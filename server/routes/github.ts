import { Router } from "express";
import { type Manifest } from "../../src/lib/parseIntentV2";
import { getRepoAccessToken, isGitHubAppConfigured } from "../services/tokenManager";
import { getGitHubHeaders } from "../utils/github";
import { getAuthUser } from "../middleware/auth";
import { logger } from "../utils/logger";
import {
  loadGitHubManifest,
  loadGitHubIntents,
  loadGitHubFileContent,
  resolveAnchorsWithContent,
  applyOverlaps,
  getCacheStats,
} from "../services/intentLoader";

const router = Router();

router.post("/github-pr", async (req, res) => {
  const { owner, repo, prNumber } = req.body as {
    owner: string;
    repo: string;
    prNumber: number;
  };

  logger.info("github-pr", `Loading PR #${prNumber} from ${owner}/${repo}`);

  if (!owner || !repo || !prNumber) {
    logger.warn("github-pr", "Missing required params:", { owner, repo, prNumber });
    return res.status(400).json({ error: "Missing owner, repo, or prNumber" });
  }

  // Get user's OAuth token from session cookie
  const auth = await getAuthUser(req.headers.cookie);
  const userToken = auth?.githubToken;

  // Get the best available token (installation > user > server)
  const { token: accessToken, source: tokenSource } = await getRepoAccessToken(owner, repo, userToken);
  logger.debug("github-pr", `Auth: user=${auth?.user?.login || "anonymous"}, tokenSource=${tokenSource || "none"}`);

  try {
    // Fetch PR diff from GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      { headers: getGitHubHeaders("application/vnd.github.v3.diff", accessToken || undefined) }
    );

    logger.debug("github-pr", `GitHub API response: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("github-pr", `GitHub API error ${response.status}:`, errorBody);

      // Check if this is a private repo access issue
      if (response.status === 404 || response.status === 403) {
        // If GitHub App is configured but not installed on this repo, suggest installation
        if (isGitHubAppConfigured && tokenSource !== "installation") {
          const installUrl = `https://github.com/apps/intent-code/installations/new`;
          return res.status(403).json({
            error: "app_not_installed",
            message: `The Intent app is not installed on the ${owner} organization. Install it to access private repositories.`,
            installUrl,
            owner,
            repo,
          });
        }

        // If using user token without repo scope
        if (tokenSource === "user" && !isGitHubAppConfigured) {
          return res.status(403).json({
            error: "insufficient_permissions",
            message: "Your OAuth token doesn't have access to this repository. The organization may have restricted third-party app access.",
          });
        }
      }

      throw new Error(`GitHub API error: ${response.status} - ${errorBody}`);
    }

    const diff = await response.text();

    // Get PR info
    const prInfoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      { headers: getGitHubHeaders(undefined, accessToken || undefined) }
    );

    const prInfo = await prInfoResponse.json();

    // Get changed files
    const filesResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
      { headers: getGitHubHeaders(undefined, accessToken || undefined) }
    );

    const files = await filesResponse.json();
    const changedFiles = files.map((f: { filename: string }) => f.filename);

    const head = prInfo.head?.ref;
    const lang = req.body.lang || 'en';

    // Load intents from the head branch using intentLoader
    const manifest = await loadGitHubManifest(owner, repo, head, accessToken || undefined);
    const intentsV2 = manifest
      ? await loadGitHubIntents(owner, repo, head, manifest, lang, accessToken || undefined)
      : [];

    // Collect all files referenced by intents to fetch their content
    const filesToFetch = new Set<string>();
    for (const intent of intentsV2) {
      for (const file of intent.frontmatter.files) {
        filesToFetch.add(file.replace(/^\.\//, ''));
      }
    }

    // Fetch file contents from GitHub in parallel
    const fileContents: Record<string, string> = {};
    const filePromises = Array.from(filesToFetch).map(async (filePath) => {
      const content = await loadGitHubFileContent(owner, repo, filePath, head, accessToken || undefined);
      if (content) {
        fileContents[filePath] = content;
      }
    });
    await Promise.all(filePromises);

    // Resolve anchors using already-fetched file contents (no double fetch)
    const resolvedIntents = manifest
      ? resolveAnchorsWithContent(intentsV2, manifest, fileContents, [])
      : [];
    const intentsWithOverlaps = applyOverlaps(resolvedIntents);

    res.json({
      diff,
      changedFiles,
      intents: {}, // No legacy intents for GitHub
      intentsV2: intentsWithOverlaps,
      manifest,
      fileContents, // Full file content for virtual hunks
      prInfo: {
        title: prInfo.title,
        number: prInfo.number,
        author: prInfo.user?.login,
        base: prInfo.base?.ref,
        head: prInfo.head?.ref,
        url: prInfo.html_url,
      },
    });
    logger.info("github-pr", `Loaded PR #${prNumber}: ${intentsWithOverlaps.length} intents, ${changedFiles.length} files`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("github-pr", `Failed to load PR #${prNumber}:`, message);
    res.status(500).json({ error: message });
  }
});

// Fetch open PRs for a GitHub repository
router.post("/github-prs", async (req, res) => {
  const { owner, repo } = req.body as { owner: string; repo: string };
  logger.debug("github-prs", `Listing PRs for ${owner}/${repo}`);

  if (!owner || !repo) {
    return res.status(400).json({ error: "Missing owner or repo" });
  }

  // Get user's OAuth token from session cookie
  const auth = await getAuthUser(req.headers.cookie);
  const userToken = auth?.githubToken;

  // Get the best available token
  const { token: accessToken } = await getRepoAccessToken(owner, repo, userToken);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=10`,
      { headers: getGitHubHeaders(undefined, accessToken || undefined) }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const prs = await response.json();

    res.json({
      prs: prs.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login,
        authorAvatar: pr.user?.avatar_url,
        head: pr.head?.ref,
        base: pr.base?.ref,
        updatedAt: pr.updated_at,
        draft: pr.draft,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("github-prs", `Failed to list PRs:`, message);
    res.status(500).json({ error: message });
  }
});

// Fetch GitHub diff between two branches
router.post("/github-branches-diff", async (req, res) => {
  const { owner, repo, base, head, lang } = req.body as {
    owner: string;
    repo: string;
    base: string;
    head: string;
    lang?: string;
  };
  logger.info("github-branches", `Comparing ${owner}/${repo}: ${base}...${head}`);

  if (!owner || !repo || !base || !head) {
    return res.status(400).json({ error: "Missing owner, repo, base, or head" });
  }

  // Get user's OAuth token from session cookie
  const auth = await getAuthUser(req.headers.cookie);
  const userToken = auth?.githubToken;

  // Get the best available token (installation > user > server)
  const { token: accessToken } = await getRepoAccessToken(owner, repo, userToken);

  try {
    // Get diff between branches
    const diffResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
      { headers: getGitHubHeaders("application/vnd.github.v3.diff", accessToken || undefined) }
    );

    if (!diffResponse.ok) {
      throw new Error(`GitHub API error: ${diffResponse.status}`);
    }

    const diff = await diffResponse.text();

    // Get compare info for changed files
    const compareResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
      { headers: getGitHubHeaders(undefined, accessToken || undefined) }
    );

    const compareData = await compareResponse.json();
    const changedFiles = compareData.files?.map((f: { filename: string }) => f.filename) || [];

    // Load intents from the head branch using intentLoader
    const manifest = await loadGitHubManifest(owner, repo, head, accessToken || undefined);
    const intentsV2 = manifest
      ? await loadGitHubIntents(owner, repo, head, manifest, lang, accessToken || undefined)
      : [];

    // Collect all files referenced by intents to fetch their content
    const filesToFetch = new Set<string>();
    for (const intent of intentsV2) {
      for (const file of intent.frontmatter.files) {
        filesToFetch.add(file.replace(/^\.\//, ''));
      }
    }

    // Fetch file contents from GitHub in parallel
    const fileContents: Record<string, string> = {};
    const filePromises = Array.from(filesToFetch).map(async (filePath) => {
      const content = await loadGitHubFileContent(owner, repo, filePath, head, accessToken || undefined);
      if (content) {
        fileContents[filePath] = content;
      }
    });
    await Promise.all(filePromises);

    // Resolve anchors using already-fetched file contents (no double fetch)
    const resolvedIntents = manifest
      ? resolveAnchorsWithContent(intentsV2, manifest, fileContents, [])
      : [];
    const intentsWithOverlaps = applyOverlaps(resolvedIntents);

    res.json({
      diff,
      changedFiles,
      intents: {}, // No legacy intents for GitHub
      intentsV2: intentsWithOverlaps,
      manifest,
      fileContents, // Full file content for virtual hunks
      branchInfo: {
        base,
        head,
        aheadBy: compareData.ahead_by,
        behindBy: compareData.behind_by,
        totalCommits: compareData.total_commits,
      },
    });
    logger.info("github-branches", `Loaded diff: ${intentsWithOverlaps.length} intents, ${changedFiles.length} files`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("github-branches", `Failed:`, message);
    res.status(500).json({ error: message });
  }
});

// Discover branches from GitHub repository
router.post("/github-discover-branches", async (req, res) => {
  const { owner, repo } = req.body as { owner: string; repo: string };
  logger.debug("github-discover", `Discovering branches for ${owner}/${repo}`);

  if (!owner || !repo) {
    return res.status(400).json({ error: "Missing owner or repo" });
  }

  // Get user's OAuth token from session cookie
  const auth = await getAuthUser(req.headers.cookie);
  const userToken = auth?.githubToken;

  // Get the best available token (installation > user > server)
  const { token: accessToken } = await getRepoAccessToken(owner, repo, userToken);

  try {
    // Get repo info (includes default branch)
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: getGitHubHeaders(undefined, accessToken || undefined) }
    );

    if (!repoResponse.ok) {
      throw new Error(`GitHub API error: ${repoResponse.status}`);
    }

    const repoInfo = await repoResponse.json();
    const defaultBranch = repoInfo.default_branch;

    // Get all branches
    const branchesResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
      { headers: getGitHubHeaders(undefined, accessToken || undefined) }
    );

    if (!branchesResponse.ok) {
      throw new Error(`GitHub API error: ${branchesResponse.status}`);
    }

    const branchesData = await branchesResponse.json();

    interface GitHubBranchInfo {
      name: string;
      lastCommit: string;
      lastCommitMessage: string;
      hasIntents: boolean;
      intentCount: number;
      aheadBehind: { ahead: number; behind: number } | null;
      isDefault: boolean;
      isCurrent: boolean;
    }

    const branches: GitHubBranchInfo[] = [];

    // Process each branch (limit to avoid rate limiting)
    for (const branch of branchesData.slice(0, 20)) {
      // Check if branch has intent manifest
      let hasIntents = false;
      let intentCount = 0;
      try {
        const manifestResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/.intent/manifest.yaml?ref=${branch.name}`,
          { headers: getGitHubHeaders(undefined, accessToken || undefined) }
        );
        if (manifestResponse.ok) {
          hasIntents = true;
          // Get content to count intents
          const manifestData = await manifestResponse.json();
          if (manifestData.content) {
            const content = Buffer.from(manifestData.content, "base64").toString("utf-8");
            const matches = content.match(/- id:/g);
            intentCount = matches ? matches.length : 0;
          }
        }
      } catch {
        // No manifest in this branch
      }

      // Get ahead/behind compared to default branch
      let aheadBehind: { ahead: number; behind: number } | null = null;
      if (branch.name !== defaultBranch) {
        try {
          const compareResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/compare/${defaultBranch}...${branch.name}`,
            { headers: getGitHubHeaders(undefined, accessToken || undefined) }
          );
          if (compareResponse.ok) {
            const compareData = await compareResponse.json();
            aheadBehind = {
              ahead: compareData.ahead_by,
              behind: compareData.behind_by,
            };
          }
        } catch {
          // Can't compute ahead/behind
        }
      }

      // Get last commit info
      let lastCommit = "";
      let lastCommitMessage = "";
      try {
        const commitResponse = await fetch(
          branch.commit.url,
          { headers: getGitHubHeaders(undefined, accessToken || undefined) }
        );
        if (commitResponse.ok) {
          const commitData = await commitResponse.json();
          const date = new Date(commitData.commit.committer.date);
          const now = new Date();
          const diffMs = now.getTime() - date.getTime();
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          const diffDays = Math.floor(diffHours / 24);

          if (diffDays > 0) {
            lastCommit = `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
          } else if (diffHours > 0) {
            lastCommit = `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
          } else {
            lastCommit = "just now";
          }
          lastCommitMessage = commitData.commit.message.split("\n")[0];
        }
      } catch {
        // Failed to get commit info
      }

      branches.push({
        name: branch.name,
        lastCommit,
        lastCommitMessage,
        hasIntents,
        intentCount,
        aheadBehind,
        isDefault: branch.name === defaultBranch,
        isCurrent: false, // No concept of "current" for remote repos
      });
    }

    // Sort: default first, then by recent activity
    branches.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return 0;
    });

    // Check if default branch has intents
    const defaultBranchInfo = branches.find((b) => b.isDefault);
    const hasLocalIntents = defaultBranchInfo?.hasIntents || false;

    res.json({
      currentBranch: defaultBranch, // Use default as "current" for remote repos
      defaultBranch,
      hasLocalIntents,
      branches,
      // Suggest branches that are ahead of default
      suggestions: branches
        .filter((b) => !b.isDefault && b.aheadBehind && b.aheadBehind.ahead > 0)
        .slice(0, 5)
        .map((b) => ({
          base: defaultBranch,
          head: b.name,
          label: `${b.name} (${b.aheadBehind!.ahead} commits)`,
          hasIntents: b.hasIntents,
          intentCount: b.intentCount,
        })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Browse a GitHub repository branch (view files with intents)
router.post("/github-browse", async (req, res) => {
  const { owner, repo, branch, lang } = req.body as {
    owner: string;
    repo: string;
    branch: string;
    lang?: string;
  };
  logger.info("github-browse", `Browsing ${owner}/${repo}@${branch}${lang ? ` (lang=${lang})` : ""}`);

  if (!owner || !repo || !branch) {
    return res.status(400).json({ error: "Missing owner, repo, or branch" });
  }

  // Get user's OAuth token from session cookie
  const auth = await getAuthUser(req.headers.cookie);
  const userToken = auth?.githubToken;

  // Get the best available token (installation > user > server)
  const { token: accessToken, source: tokenSource } = await getRepoAccessToken(owner, repo, userToken);
  logger.debug("github-browse", `Auth: user=${auth?.user?.login || "anonymous"}, tokenSource=${tokenSource || "none"}`);

  try {
    let repoInfo: { description: string | null; stars: number; language: string | null; topics: string[] } | null = null;

    // Fetch repo info (description, stars, language, topics)
    try {
      const repoResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers: getGitHubHeaders(undefined, accessToken || undefined) }
      );
      if (repoResponse.ok) {
        const repoData = await repoResponse.json();
        repoInfo = {
          description: repoData.description,
          stars: repoData.stargazers_count,
          language: repoData.language,
          topics: repoData.topics || [],
        };
      }
    } catch {
      // Failed to fetch repo info
    }

    // Load intents from the branch using intentLoader
    const manifest = await loadGitHubManifest(owner, repo, branch, accessToken || undefined);
    const intentsV2 = manifest
      ? await loadGitHubIntents(owner, repo, branch, manifest, lang, accessToken || undefined)
      : [];

    // Collect all files referenced by intents
    const filesSet = new Set<string>();
    for (const intent of intentsV2) {
      for (const file of intent.frontmatter.files) {
        filesSet.add(file);
      }
    }
    const files = Array.from(filesSet);

    // Fetch content for each file in parallel
    const fileContents: Record<string, string> = {};
    const filePromises = files.map(async (filePath) => {
      const content = await loadGitHubFileContent(owner, repo, filePath, branch, accessToken || undefined);
      if (content) {
        fileContents[filePath] = content;
      }
    });
    await Promise.all(filePromises);

    // Resolve anchors using already-fetched file contents (no double fetch)
    const resolvedIntents = manifest
      ? resolveAnchorsWithContent(intentsV2, manifest, fileContents, [])
      : [];
    const intentsWithOverlaps = applyOverlaps(resolvedIntents);

    const stats = getCacheStats();
    logger.info("github-browse", `Loaded: ${intentsWithOverlaps.length} intents, ${files.length} files (cache: ${stats.hits} hits, ${stats.misses} misses)`);
    res.json({
      intentsV2: intentsWithOverlaps,
      files,
      fileContents,
      branch,
      repoInfo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("github-browse", `Failed:`, message);
    res.status(500).json({ error: message });
  }
});


export default router;
