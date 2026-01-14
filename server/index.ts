import express from "express";
import cors from "cors";
import { execSync } from "child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import path from "path";
import os from "os";
import {
  parseIntentV2,
  parseManifest,
  type IntentV2,
  type Manifest,
} from "../src/lib/parseIntentV2";
import { resolveAnchor, type AnchorResult } from "../src/lib/anchorResolver";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

interface DiffRequest {
  repoPath: string;
  base?: string; // base branch/commit
  head?: string; // head branch/commit
  mode?: "branches" | "local" | "staged"; // comparison mode
  lang?: string; // language code (e.g., "fr", "es") - falls back to base intent.md
}

// Get diff between two refs (branches, commits, etc.)
app.post("/api/diff", (req, res) => {
  const { repoPath, base = "main", head = "HEAD", mode = "branches", lang } = req.body as DiffRequest;

  if (!repoPath || !existsSync(repoPath)) {
    return res.status(400).json({ error: "Invalid repo path" });
  }

  try {
    let diff: string;
    let changedFiles: string[];

    // Use -U15 for 15 lines of context around changes
    const contextLines = 15;

    if (mode === "local") {
      // All local changes (staged + unstaged) vs HEAD
      diff = execSync(`git diff -U${contextLines} HEAD`, {
        cwd: repoPath,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      changedFiles = execSync("git diff --name-only HEAD", {
        cwd: repoPath,
        encoding: "utf-8",
      })
        .trim()
        .split("\n")
        .filter(Boolean);
    } else if (mode === "staged") {
      // Only staged changes
      diff = execSync(`git diff -U${contextLines} --cached`, {
        cwd: repoPath,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      changedFiles = execSync("git diff --cached --name-only", {
        cwd: repoPath,
        encoding: "utf-8",
      })
        .trim()
        .split("\n")
        .filter(Boolean);
    } else {
      // Compare branches/commits
      diff = execSync(`git diff -U${contextLines} ${base}...${head}`, {
        cwd: repoPath,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      changedFiles = execSync(`git diff --name-only ${base}...${head}`, {
        cwd: repoPath,
        encoding: "utf-8",
      })
        .trim()
        .split("\n")
        .filter(Boolean);
    }

    // Filter out intent files from changed files (they're documentation, not code)
    const isIntentFile = (f: string) => /\.intent(\.[a-z]{2})?\.md$/.test(f) || f.startsWith(".intent/");
    const changedIntentFiles = changedFiles.filter((f) => isIntentFile(f));
    const codeFiles = changedFiles.filter((f) => !isIntentFile(f));

    // Load v2 intents from .intent/manifest.yaml
    const manifestPath = path.join(repoPath, ".intent", "manifest.yaml");
    const parsedIntents: IntentV2[] = [];
    let manifest: Manifest | null = null;

    if (existsSync(manifestPath)) {
      const manifestContent = readFileSync(manifestPath, "utf-8");
      manifest = parseManifest(manifestContent);

      if (manifest) {
        const intentsDir = path.join(repoPath, ".intent", "intents");

        for (const intentEntry of manifest.intents) {
          if (intentEntry.status !== "active") continue;

          // Try language-specific first, then fall back to base
          const baseName = intentEntry.file.replace(".intent.md", "");
          const langIntentPath = lang
            ? path.join(intentsDir, `${baseName}.intent.${lang}.md`)
            : null;
          const baseIntentPath = path.join(intentsDir, intentEntry.file);

          let intentContent: string | null = null;
          if (langIntentPath && existsSync(langIntentPath)) {
            intentContent = readFileSync(langIntentPath, "utf-8");
          } else if (existsSync(baseIntentPath)) {
            intentContent = readFileSync(baseIntentPath, "utf-8");
          }

          if (intentContent) {
            const parsed = parseIntentV2(intentContent);
            if (parsed) {
              parsedIntents.push(parsed);
            }
          }
        }
      }
    }

    // For each intent, resolve anchors if the file exists
    interface ResolvedIntent extends IntentV2 {
      isNew: boolean; // true if intent file was added/modified in this PR
      intentFilePath: string; // path to the intent file
      resolvedChunks: Array<{
        anchor: string;
        title: string;
        description: string;
        decisions: string[];
        links: Array<{ target: string; reason: string }>;
        storedHash?: string;
        resolved: AnchorResult | null;
        hashMatch: boolean | null;
      }>;
    }

    const intentsWithResolution: ResolvedIntent[] = parsedIntents.map((intent, idx) => {
      // Check if this intent file was changed in the PR
      const intentFileName = manifest?.intents[idx]?.file || "";
      const intentFilePath = `.intent/intents/${intentFileName}`;
      const isNew = changedIntentFiles.some(f =>
        f.includes(intentFileName) || f === intentFilePath
      );
      const resolvedChunks = intent.chunks.map((chunk) => {
        // Try to resolve anchor for each file in the intent
        let resolved: AnchorResult | null = null;
        let hashMatch: boolean | null = null;
        let resolvedFile: string | null = null;

        for (const filePath of intent.frontmatter.files) {
          const fullPath = path.join(repoPath, filePath);
          if (existsSync(fullPath)) {
            const fileContent = readFileSync(fullPath, "utf-8");
            resolved = resolveAnchor(chunk.anchor, fileContent);
            if (resolved) {
              resolvedFile = filePath;
              if (chunk.storedHash) {
                hashMatch = resolved.hash === chunk.storedHash;
              }
              break;
            }
          }
        }

        return {
          ...chunk,
          resolved,
          resolvedFile,
          hashMatch,
        };
      });

      return {
        ...intent,
        isNew,
        intentFilePath,
        resolvedChunks,
      };
    });

    // Filter diff content to exclude intent files
    const filteredDiff = diff
      .split(/(?=^diff --git)/m)
      .filter((chunk) => {
        const match = chunk.match(/^diff --git a\/(.+?) b\//);
        if (!match) return true;
        return !isIntentFile(match[1]);
      })
      .join("");

    // Legacy intents format for backward compatibility
    const legacyIntents: Record<string, string> = {};
    for (const file of codeFiles) {
      const langIntentPath = lang ? path.join(repoPath, `${file}.intent.${lang}.md`) : null;
      const baseIntentPath = path.join(repoPath, `${file}.intent.md`);

      if (langIntentPath && existsSync(langIntentPath)) {
        legacyIntents[file] = readFileSync(langIntentPath, "utf-8");
      } else if (existsSync(baseIntentPath)) {
        legacyIntents[file] = readFileSync(baseIntentPath, "utf-8");
      }
    }

    // Load full file content for expand context feature
    const fileContents: Record<string, string> = {};
    for (const file of codeFiles) {
      const fullPath = path.join(repoPath, file);
      if (existsSync(fullPath)) {
        try {
          fileContents[file] = readFileSync(fullPath, "utf-8");
        } catch {
          // Skip binary files or unreadable files
        }
      }
    }

    res.json({
      diff: filteredDiff,
      changedFiles: codeFiles,
      intents: legacyIntents, // Legacy format
      intentsV2: intentsWithResolution, // New v2 format with resolved anchors
      manifest,
      fileContents, // Full file content for expand context
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Browse a single branch - view all intents and their code
app.post("/api/browse", (req, res) => {
  const { repoPath, branch = "HEAD", lang } = req.body as { repoPath: string; branch?: string; lang?: string };

  if (!repoPath || !existsSync(repoPath)) {
    return res.status(400).json({ error: "Invalid repo path" });
  }

  try {
    // Load v2 intents from .intent/manifest.yaml at the specified branch
    const parsedIntents: IntentV2[] = [];
    let manifest: Manifest | null = null;
    let files: string[] = [];

    // Try to read manifest from the branch
    let manifestContent: string | null = null;
    try {
      manifestContent = execSync(`git show ${branch}:.intent/manifest.yaml`, {
        cwd: repoPath,
        encoding: "utf-8",
      });
    } catch {
      // No manifest in this branch
    }

    if (manifestContent) {
      manifest = parseManifest(manifestContent);

      if (manifest) {
        for (const intentEntry of manifest.intents) {
          if (intentEntry.status !== "active") continue;

          // Try language-specific first, then fall back to base
          const baseName = intentEntry.file.replace(".intent.md", "");
          const langIntentFile = lang ? `${baseName}.intent.${lang}.md` : null;

          let intentContent: string | null = null;
          try {
            if (langIntentFile) {
              intentContent = execSync(`git show ${branch}:.intent/intents/${langIntentFile}`, {
                cwd: repoPath,
                encoding: "utf-8",
              });
            }
          } catch {
            // Language-specific file doesn't exist
          }

          if (!intentContent) {
            try {
              intentContent = execSync(`git show ${branch}:.intent/intents/${intentEntry.file}`, {
                cwd: repoPath,
                encoding: "utf-8",
              });
            } catch {
              // Intent file doesn't exist
            }
          }

          if (intentContent) {
            const parsed = parseIntentV2(intentContent);
            if (parsed) {
              parsedIntents.push(parsed);
              // Collect files from this intent
              files.push(...parsed.frontmatter.files);
            }
          }
        }
      }
    }

    // Dedupe files
    files = [...new Set(files)];

    // Resolve anchors for each intent
    interface ResolvedIntent extends IntentV2 {
      isNew: boolean;
      intentFilePath: string;
      resolvedChunks: Array<{
        anchor: string;
        title: string;
        description: string;
        decisions: string[];
        links: Array<{ target: string; reason: string }>;
        storedHash?: string;
        resolved: AnchorResult | null;
        resolvedFile?: string;
        hashMatch: boolean | null;
      }>;
    }

    const intentsWithResolution: ResolvedIntent[] = parsedIntents.map((intent, idx) => {
      const intentFileName = manifest?.intents[idx]?.file || "";
      const intentFiles = intent.frontmatter.files || [];

      return {
        ...intent,
        isNew: false,
        intentFilePath: `.intent/intents/${intentFileName}`,
        resolvedChunks: intent.chunks.map((chunk) => {
          // Anchor format is like "@class:SlackCleaner" or "@function:process_thread"
          // The file to search in comes from intent.frontmatter.files
          const anchorSpec = chunk.anchor;

          let resolved: AnchorResult | null = null;
          let hashMatch: boolean | null = null;
          let resolvedFile: string | undefined;

          // Try each file from the intent's files list until we find a match
          for (const file of intentFiles) {
            try {
              const fileContent = execSync(`git show ${branch}:${file}`, {
                cwd: repoPath,
                encoding: "utf-8",
              });
              const result = resolveAnchor(anchorSpec, fileContent);

              if (result && result.found) {
                resolved = result;
                resolvedFile = file;

                if (chunk.hash) {
                  hashMatch = resolved.hash === chunk.hash;
                }
                break; // Found a match, stop searching
              }
            } catch {
              // File doesn't exist in branch, try next
            }
          }

          return {
            anchor: chunk.anchor,
            title: chunk.title,
            description: chunk.description,
            decisions: chunk.decisions,
            links: chunk.links,
            storedHash: chunk.hash,
            resolved,
            resolvedFile,
            hashMatch,
          };
        }),
      };
    });

    // Load file contents for files in intents
    const fileContents: Record<string, string> = {};
    for (const file of files) {
      try {
        fileContents[file] = execSync(`git show ${branch}:${file}`, {
          cwd: repoPath,
          encoding: "utf-8",
        });
      } catch {
        // File doesn't exist or is binary
      }
    }

    res.json({
      intentsV2: intentsWithResolution,
      files,
      fileContents,
      branch,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Get current branch info (simple)
app.post("/api/branches", (req, res) => {
  const { repoPath } = req.body as { repoPath: string };

  if (!repoPath || !existsSync(repoPath)) {
    return res.status(400).json({ error: "Invalid repo path" });
  }

  try {
    const currentBranch = execSync("git branch --show-current", {
      cwd: repoPath,
      encoding: "utf-8",
    }).trim();

    const branches = execSync("git branch -a", {
      cwd: repoPath,
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .map((b) => b.trim().replace("* ", ""));

    res.json({ currentBranch, branches });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Smart branch discovery with intent detection
app.post("/api/discover-branches", (req, res) => {
  const { repoPath } = req.body as { repoPath: string };

  if (!repoPath || !existsSync(repoPath)) {
    return res.status(400).json({ error: "Invalid repo path" });
  }

  try {
    // Get current branch
    const currentBranch = execSync("git branch --show-current", {
      cwd: repoPath,
      encoding: "utf-8",
    }).trim();

    // Get default branch (main or master)
    let defaultBranch = "main";
    try {
      execSync("git rev-parse --verify main", { cwd: repoPath, encoding: "utf-8" });
    } catch {
      try {
        execSync("git rev-parse --verify master", { cwd: repoPath, encoding: "utf-8" });
        defaultBranch = "master";
      } catch {
        defaultBranch = currentBranch;
      }
    }

    // Get all local branches with last commit info
    const branchOutput = execSync(
      'git for-each-ref --sort=-committerdate refs/heads/ --format="%(refname:short)|%(committerdate:relative)|%(subject)"',
      { cwd: repoPath, encoding: "utf-8" }
    ).trim();

    interface BranchInfo {
      name: string;
      lastCommit: string;
      lastCommitMessage: string;
      hasIntents: boolean;
      intentCount: number;
      aheadBehind: { ahead: number; behind: number } | null;
      isDefault: boolean;
      isCurrent: boolean;
    }

    const branches: BranchInfo[] = [];

    for (const line of branchOutput.split("\n").filter(Boolean)) {
      const [name, lastCommit, lastCommitMessage] = line.split("|");

      // Check if branch has intents by looking for manifest.yaml
      let hasIntents = false;
      let intentCount = 0;
      try {
        const manifestContent = execSync(`git show ${name}:.intent/manifest.yaml 2>/dev/null || echo ""`, {
          cwd: repoPath,
          encoding: "utf-8",
        }).trim();
        if (manifestContent) {
          hasIntents = true;
          // Count intents in manifest
          const matches = manifestContent.match(/- id:/g);
          intentCount = matches ? matches.length : 0;
        }
      } catch {
        // No manifest in this branch
      }

      // Get ahead/behind compared to default branch
      let aheadBehind: { ahead: number; behind: number } | null = null;
      if (name !== defaultBranch) {
        try {
          const abOutput = execSync(`git rev-list --left-right --count ${defaultBranch}...${name}`, {
            cwd: repoPath,
            encoding: "utf-8",
          }).trim();
          const [behind, ahead] = abOutput.split("\t").map(Number);
          aheadBehind = { ahead, behind };
        } catch {
          // Can't compute ahead/behind
        }
      }

      branches.push({
        name,
        lastCommit,
        lastCommitMessage,
        hasIntents,
        intentCount,
        aheadBehind,
        isDefault: name === defaultBranch,
        isCurrent: name === currentBranch,
      });
    }

    // Check if current repo has intents on current branch
    const hasLocalIntents = existsSync(path.join(repoPath, ".intent", "manifest.yaml"));

    res.json({
      currentBranch,
      defaultBranch,
      hasLocalIntents,
      branches,
      // Suggested comparisons for quick access
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

// Get recent commits
app.post("/api/commits", (req, res) => {
  const { repoPath, limit = 20 } = req.body as { repoPath: string; limit?: number };

  if (!repoPath || !existsSync(repoPath)) {
    return res.status(400).json({ error: "Invalid repo path" });
  }

  try {
    const log = execSync(`git log --oneline -${limit}`, {
      cwd: repoPath,
      encoding: "utf-8",
    });

    const commits = log
      .trim()
      .split("\n")
      .map((line) => {
        const [hash, ...messageParts] = line.split(" ");
        return { hash, message: messageParts.join(" ") };
      });

    res.json({ commits });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// List directories for file browser
app.post("/api/list-dirs", (req, res) => {
  const { dirPath } = req.body as { dirPath?: string };
  const targetPath = dirPath || os.homedir();

  try {
    if (!existsSync(targetPath)) {
      return res.status(400).json({ error: "Directory not found" });
    }

    const stat = statSync(targetPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: "Not a directory" });
    }

    const entries = readdirSync(targetPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        path: path.join(targetPath, e.name),
        isGitRepo: existsSync(path.join(targetPath, e.name, ".git")),
      }))
      .sort((a, b) => {
        // Git repos first, then alphabetically
        if (a.isGitRepo && !b.isGitRepo) return -1;
        if (!a.isGitRepo && b.isGitRepo) return 1;
        return a.name.localeCompare(b.name);
      });

    // Check if current dir is a git repo
    const isGitRepo = existsSync(path.join(targetPath, ".git"));

    res.json({
      currentPath: targetPath,
      parentPath: path.dirname(targetPath),
      isGitRepo,
      directories: dirs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Fetch GitHub PR diff
app.post("/api/github-pr", async (req, res) => {
  const { owner, repo, prNumber } = req.body as {
    owner: string;
    repo: string;
    prNumber: number;
  };

  if (!owner || !repo || !prNumber) {
    return res.status(400).json({ error: "Missing owner, repo, or prNumber" });
  }

  try {
    // Fetch PR diff from GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          Accept: "application/vnd.github.v3.diff",
          "User-Agent": "Intent-App",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const diff = await response.text();

    // Get PR info
    const prInfoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Intent-App",
        },
      }
    );

    const prInfo = await prInfoResponse.json();

    // Get changed files
    const filesResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Intent-App",
        },
      }
    );

    const files = await filesResponse.json();
    const changedFiles = files.map((f: { filename: string }) => f.filename);

    res.json({
      diff,
      changedFiles,
      intents: {}, // No local intents for remote repos
      manifest: null,
      prInfo: {
        title: prInfo.title,
        number: prInfo.number,
        author: prInfo.user?.login,
        base: prInfo.base?.ref,
        head: prInfo.head?.ref,
        url: prInfo.html_url,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Fetch GitHub diff between two branches
app.post("/api/github-branches-diff", async (req, res) => {
  const { owner, repo, base, head } = req.body as {
    owner: string;
    repo: string;
    base: string;
    head: string;
  };

  if (!owner || !repo || !base || !head) {
    return res.status(400).json({ error: "Missing owner, repo, base, or head" });
  }

  try {
    // Get diff between branches
    const diffResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
      {
        headers: {
          Accept: "application/vnd.github.v3.diff",
          "User-Agent": "Intent-App",
        },
      }
    );

    if (!diffResponse.ok) {
      throw new Error(`GitHub API error: ${diffResponse.status}`);
    }

    const diff = await diffResponse.text();

    // Get compare info for changed files
    const compareResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Intent-App",
        },
      }
    );

    const compareData = await compareResponse.json();
    const changedFiles = compareData.files?.map((f: { filename: string }) => f.filename) || [];

    // Try to load intents from the head branch
    const intentsV2: IntentV2[] = [];
    let manifest: Manifest | null = null;

    try {
      // Check if manifest exists
      const manifestResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/.intent/manifest.yaml?ref=${head}`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Intent-App",
          },
        }
      );

      if (manifestResponse.ok) {
        const manifestData = await manifestResponse.json();
        if (manifestData.content) {
          const manifestContent = Buffer.from(manifestData.content, "base64").toString("utf-8");
          manifest = parseManifest(manifestContent);

          if (manifest) {
            // Load each intent file
            for (const intentEntry of manifest.intents) {
              if (intentEntry.status !== "active") continue;

              try {
                const intentResponse = await fetch(
                  `https://api.github.com/repos/${owner}/${repo}/contents/.intent/intents/${intentEntry.file}?ref=${head}`,
                  {
                    headers: {
                      Accept: "application/vnd.github.v3+json",
                      "User-Agent": "Intent-App",
                    },
                  }
                );

                if (intentResponse.ok) {
                  const intentData = await intentResponse.json();
                  if (intentData.content) {
                    const intentContent = Buffer.from(intentData.content, "base64").toString("utf-8");
                    const parsed = parseIntentV2(intentContent);
                    if (parsed) {
                      intentsV2.push(parsed);
                    }
                  }
                }
              } catch {
                // Failed to load this intent
              }
            }
          }
        }
      }
    } catch {
      // No intents in this branch
    }

    res.json({
      diff,
      changedFiles,
      intents: {}, // No legacy intents for GitHub
      intentsV2: intentsV2.map((intent) => ({
        ...intent,
        resolvedChunks: intent.chunks.map((chunk) => ({
          ...chunk,
          resolved: null, // Can't resolve anchors without file content
          hashMatch: null,
        })),
      })),
      manifest,
      branchInfo: {
        base,
        head,
        aheadBy: compareData.ahead_by,
        behindBy: compareData.behind_by,
        totalCommits: compareData.total_commits,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Discover branches from GitHub repository
app.post("/api/github-discover-branches", async (req, res) => {
  const { owner, repo } = req.body as { owner: string; repo: string };

  if (!owner || !repo) {
    return res.status(400).json({ error: "Missing owner or repo" });
  }

  try {
    // Get repo info (includes default branch)
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Intent-App",
        },
      }
    );

    if (!repoResponse.ok) {
      throw new Error(`GitHub API error: ${repoResponse.status}`);
    }

    const repoInfo = await repoResponse.json();
    const defaultBranch = repoInfo.default_branch;

    // Get all branches
    const branchesResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Intent-App",
        },
      }
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
          {
            headers: {
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "Intent-App",
            },
          }
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
            {
              headers: {
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "Intent-App",
              },
            }
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
          {
            headers: {
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "Intent-App",
            },
          }
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

app.listen(PORT, () => {
  console.log(`Intent server running on http://localhost:${PORT}`);
});
