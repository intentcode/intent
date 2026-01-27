import { Router } from "express";
import { execSync } from "child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import path from "path";
import os from "os";
import {
  parseIntentV2,
  parseManifest,
  type Manifest,
} from "../../src/lib/parseIntentV2";
import { resolveAnchor, type AnchorResult } from "../../src/lib/anchorResolver";
import { logger } from "../utils/logger";
import {
  loadLocalManifest,
  loadLocalIntents,
  resolveLocalAnchors,
  applyOverlaps,
  type ResolvedIntent,
} from "../services/intentLoader";

const router = Router();

interface DiffRequest {
  repoPath: string;
  base?: string; // base branch/commit
  head?: string; // head branch/commit
  mode?: "branches" | "local" | "staged"; // comparison mode
  lang?: string; // language code (e.g., "fr", "es") - falls back to base intent.md
}

// Get diff between two refs (branches, commits, etc.)
router.post("/diff", (req, res) => {
  const { repoPath, base = "main", head = "HEAD", mode = "branches", lang } = req.body as DiffRequest;
  logger.info("local-diff", `Loading diff: ${repoPath} (mode=${mode}, ${base}...${head})`);

  if (!repoPath || !existsSync(repoPath)) {
    logger.warn("local-diff", `Invalid repo path: ${repoPath}`);
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

    // Load v2 intents from .intent/manifest.yaml using intentLoader
    const manifest = loadLocalManifest(repoPath);
    const parsedIntents = manifest ? loadLocalIntents(repoPath, manifest, lang) : [];

    // Resolve anchors for each intent
    const intentsWithResolution = manifest
      ? resolveLocalAnchors(parsedIntents, repoPath, manifest, changedIntentFiles)
      : [];

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
    // Include both changed files AND files referenced by intents (for virtual hunks)
    const fileContents: Record<string, string> = {};
    const filesToLoad = new Set<string>(codeFiles);

    // Add files referenced by intents
    for (const intent of intentsWithResolution) {
      for (const file of intent.frontmatter.files) {
        const normalizedFile = file.replace(/^\.\//, '');
        filesToLoad.add(normalizedFile);
      }
    }

    for (const file of filesToLoad) {
      const fullPath = path.join(repoPath, file);
      if (existsSync(fullPath)) {
        try {
          fileContents[file] = readFileSync(fullPath, "utf-8");
        } catch {
          // Skip binary files or unreadable files
        }
      }
    }

    // Apply overlap detection to intents
    const intentsWithOverlaps = applyOverlaps(intentsWithResolution);

    logger.info("local-diff", `Success: ${intentsWithOverlaps.length} intents, ${codeFiles.length} files, ${changedIntentFiles.length} intent files changed`);

    res.json({
      diff: filteredDiff,
      changedFiles: codeFiles,
      intents: legacyIntents, // Legacy format
      intentsV2: intentsWithOverlaps, // New v2 format with resolved anchors and overlaps
      manifest,
      fileContents, // Full file content for expand context
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("local-diff", `Failed:`, message);
    res.status(500).json({ error: message });
  }
});

// Browse a single branch - view all intents and their code
router.post("/browse", (req, res) => {
  const { repoPath, branch = "HEAD", lang } = req.body as { repoPath: string; branch?: string; lang?: string };
  logger.info("local-browse", `Browsing ${repoPath}@${branch}${lang ? ` (lang=${lang})` : ""}`);

  if (!repoPath || !existsSync(repoPath)) {
    logger.warn("local-browse", `Invalid repo path: ${repoPath}`);
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
            const parsed = parseIntentV2(intentContent, lang || 'en');
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

    // Resolve anchors for each intent using git show for branch-specific content
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

    // Apply overlap detection to intents
    const intentsWithOverlaps = applyOverlaps(intentsWithResolution);

    logger.info("local-browse", `Success: ${intentsWithOverlaps.length} intents, ${files.length} files`);

    res.json({
      intentsV2: intentsWithOverlaps,
      files,
      fileContents,
      branch,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("local-browse", `Failed:`, message);
    res.status(500).json({ error: message });
  }
});

// Get current branch info (simple)
router.post("/branches", (req, res) => {
  const { repoPath } = req.body as { repoPath: string };
  logger.debug("local-branches", `Getting branches for ${repoPath}`);

  if (!repoPath || !existsSync(repoPath)) {
    logger.warn("local-branches", `Invalid repo path: ${repoPath}`);
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

    logger.debug("local-branches", `Found ${branches.length} branches, current: ${currentBranch}`);
    res.json({ currentBranch, branches });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("local-branches", `Failed:`, message);
    res.status(500).json({ error: message });
  }
});

// Smart branch discovery with intent detection
router.post("/discover-branches", (req, res) => {
  const { repoPath } = req.body as { repoPath: string };
  logger.debug("local-discover", `Discovering branches for ${repoPath}`);

  if (!repoPath || !existsSync(repoPath)) {
    logger.warn("local-discover", `Invalid repo path: ${repoPath}`);
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

    const branchesWithIntents = branches.filter(b => b.hasIntents).length;
    logger.debug("local-discover", `Found ${branches.length} branches (${branchesWithIntents} with intents), current: ${currentBranch}, default: ${defaultBranch}`);

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
    logger.error("local-discover", `Failed:`, message);
    res.status(500).json({ error: message });
  }
});

// Get recent commits
router.post("/commits", (req, res) => {
  const { repoPath, limit = 20 } = req.body as { repoPath: string; limit?: number };
  logger.debug("local-commits", `Getting ${limit} commits for ${repoPath}`);

  if (!repoPath || !existsSync(repoPath)) {
    logger.warn("local-commits", `Invalid repo path: ${repoPath}`);
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

    logger.debug("local-commits", `Found ${commits.length} commits`);
    res.json({ commits });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("local-commits", `Failed:`, message);
    res.status(500).json({ error: message });
  }
});

// List directories for file browser
router.post("/list-dirs", (req, res) => {
  const { dirPath } = req.body as { dirPath?: string };
  const targetPath = dirPath || os.homedir();
  logger.debug("local-listdirs", `Listing ${targetPath}`);

  try {
    if (!existsSync(targetPath)) {
      logger.warn("local-listdirs", `Directory not found: ${targetPath}`);
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
    const gitRepos = dirs.filter(d => d.isGitRepo).length;

    logger.debug("local-listdirs", `Found ${dirs.length} dirs (${gitRepos} git repos)${isGitRepo ? " - current is git repo" : ""}`);

    res.json({
      currentPath: targetPath,
      parentPath: path.dirname(targetPath),
      isGitRepo,
      directories: dirs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("local-listdirs", `Failed:`, message);
    res.status(500).json({ error: message });
  }
});

// Fetch GitHub PR diff

export default router;
