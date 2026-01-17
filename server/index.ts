import "dotenv/config";
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

// GitHub API token (optional, increases rate limit from 60 to 5000 requests/hour)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Helper to get GitHub API headers
function getGitHubHeaders(accept: string = "application/vnd.github.v3+json"): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": "Intent-App",
  };
  if (GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  }
  return headers;
}

// Detect overlapping chunks within the same file
interface ChunkWithFile {
  anchor: string;
  resolvedFile?: string | null;
  resolved: { startLine: number; endLine: number } | null;
}

function detectOverlaps(chunks: ChunkWithFile[]): Map<string, string[]> {
  const overlaps = new Map<string, string[]>();

  // Group chunks by file
  const chunksByFile = new Map<string, ChunkWithFile[]>();
  for (const chunk of chunks) {
    if (chunk.resolved && chunk.resolvedFile) {
      const existing = chunksByFile.get(chunk.resolvedFile) || [];
      existing.push(chunk);
      chunksByFile.set(chunk.resolvedFile, existing);
    }
  }

  // Check for overlaps within each file
  for (const [_file, fileChunks] of chunksByFile) {
    for (let i = 0; i < fileChunks.length; i++) {
      for (let j = i + 1; j < fileChunks.length; j++) {
        const a = fileChunks[i];
        const b = fileChunks[j];

        if (!a.resolved || !b.resolved) continue;

        // Check if ranges overlap
        const aStart = a.resolved.startLine;
        const aEnd = a.resolved.endLine;
        const bStart = b.resolved.startLine;
        const bEnd = b.resolved.endLine;

        // Overlap if: aStart <= bEnd AND bStart <= aEnd
        if (aStart <= bEnd && bStart <= aEnd) {
          // Add overlap for chunk a
          const aOverlaps = overlaps.get(a.anchor) || [];
          if (!aOverlaps.includes(b.anchor)) {
            aOverlaps.push(b.anchor);
          }
          overlaps.set(a.anchor, aOverlaps);

          // Add overlap for chunk b
          const bOverlaps = overlaps.get(b.anchor) || [];
          if (!bOverlaps.includes(a.anchor)) {
            bOverlaps.push(a.anchor);
          }
          overlaps.set(b.anchor, bOverlaps);
        }
      }
    }
  }

  return overlaps;
}

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
            const parsed = parseIntentV2(intentContent, lang || 'en');
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
        resolvedFile?: string | null;
        hashMatch: boolean | null;
        overlaps?: string[]; // anchors of chunks that overlap with this one
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

    // Detect overlapping chunks across all intents
    const allChunks = intentsWithResolution.flatMap(intent =>
      intent.resolvedChunks.map(c => ({
        anchor: c.anchor,
        resolvedFile: c.resolvedFile,
        resolved: c.resolved,
      }))
    );
    const overlapsMap = detectOverlaps(allChunks);

    // Add overlaps info to each chunk
    const intentsWithOverlaps = intentsWithResolution.map(intent => ({
      ...intent,
      resolvedChunks: intent.resolvedChunks.map(chunk => ({
        ...chunk,
        overlaps: overlapsMap.get(chunk.anchor) || [],
      })),
    }));

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
        overlaps?: string[];
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

    // Detect overlapping chunks across all intents
    const allChunks = intentsWithResolution.flatMap(intent =>
      intent.resolvedChunks.map(c => ({
        anchor: c.anchor,
        resolvedFile: c.resolvedFile,
        resolved: c.resolved,
      }))
    );
    const overlapsMap = detectOverlaps(allChunks);

    // Add overlaps info to each chunk
    const intentsWithOverlaps = intentsWithResolution.map(intent => ({
      ...intent,
      resolvedChunks: intent.resolvedChunks.map(chunk => ({
        ...chunk,
        overlaps: overlapsMap.get(chunk.anchor) || [],
      })),
    }));

    res.json({
      intentsV2: intentsWithOverlaps,
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
      { headers: getGitHubHeaders("application/vnd.github.v3.diff") }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const diff = await response.text();

    // Get PR info
    const prInfoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      { headers: getGitHubHeaders() }
    );

    const prInfo = await prInfoResponse.json();

    // Get changed files
    const filesResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
      { headers: getGitHubHeaders() }
    );

    const files = await filesResponse.json();
    const changedFiles = files.map((f: { filename: string }) => f.filename);

    const head = prInfo.head?.ref;
    const lang = req.body.lang || 'en';

    // Try to load intents from the head branch
    const intentsV2: IntentV2[] = [];
    let manifest: Manifest | null = null;

    try {
      // Check if manifest exists
      const manifestResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/.intent/manifest.yaml?ref=${head}`,
        { headers: getGitHubHeaders() }
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
                  { headers: getGitHubHeaders() }
                );

                if (intentResponse.ok) {
                  const intentData = await intentResponse.json();
                  if (intentData.content) {
                    const intentContent = Buffer.from(intentData.content, "base64").toString("utf-8");
                    const parsed = parseIntentV2(intentContent, lang);
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

    // Collect all files referenced by intents to fetch their content
    const filesToFetch = new Set<string>();
    for (const intent of intentsV2) {
      for (const file of intent.frontmatter.files) {
        filesToFetch.add(file.replace(/^\.\//, ''));
      }
    }

    // Fetch file contents from GitHub
    const fileContents: Record<string, string> = {};
    for (const filePath of filesToFetch) {
      try {
        const fileResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${head}`,
          { headers: getGitHubHeaders() }
        );
        if (fileResponse.ok) {
          const fileData = await fileResponse.json();
          if (fileData.content) {
            fileContents[filePath] = Buffer.from(fileData.content, "base64").toString("utf-8");
          }
        }
      } catch {
        // File not found or error fetching
      }
    }

    // Resolve anchors for each intent's chunks
    const resolvedIntentsV2 = intentsV2.map((intent) => {
      const resolvedChunks = intent.chunks.map((chunk) => {
        // Find which file this chunk belongs to
        let resolvedFile: string | null = null;
        let resolved: { startLine: number; endLine: number; content: string; contentHash: string } | null = null;
        let hashMatch: boolean | null = null;

        // Try to resolve in each of the intent's files
        for (const file of intent.frontmatter.files) {
          const normalizedFile = file.replace(/^\.\//, '');
          const content = fileContents[normalizedFile];
          if (!content) continue;

          const anchorResult = resolveAnchor(chunk.anchor, content);
          if (anchorResult && anchorResult.found) {
            resolvedFile = normalizedFile;
            resolved = {
              startLine: anchorResult.startLine,
              endLine: anchorResult.endLine,
              content: anchorResult.content,
              contentHash: anchorResult.hash,
            };
            // Check hash match if stored hash exists
            if (chunk.storedHash) {
              hashMatch = anchorResult.hash === chunk.storedHash;
            }
            break;
          }
        }

        return {
          ...chunk,
          resolvedFile,
          resolved,
          hashMatch,
        };
      });

      // Detect overlaps
      const overlaps = detectOverlaps(resolvedChunks);

      return {
        ...intent,
        resolvedChunks: resolvedChunks.map(chunk => ({
          ...chunk,
          overlaps: overlaps.get(chunk.anchor) || [],
        })),
      };
    });

    res.json({
      diff,
      changedFiles,
      intents: {}, // No legacy intents for GitHub
      intentsV2: resolvedIntentsV2,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Fetch GitHub diff between two branches
app.post("/api/github-branches-diff", async (req, res) => {
  const { owner, repo, base, head, lang } = req.body as {
    owner: string;
    repo: string;
    base: string;
    head: string;
    lang?: string;
  };

  if (!owner || !repo || !base || !head) {
    return res.status(400).json({ error: "Missing owner, repo, base, or head" });
  }

  try {
    // Get diff between branches
    const diffResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
      { headers: getGitHubHeaders("application/vnd.github.v3.diff") }
    );

    if (!diffResponse.ok) {
      throw new Error(`GitHub API error: ${diffResponse.status}`);
    }

    const diff = await diffResponse.text();

    // Get compare info for changed files
    const compareResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
      { headers: getGitHubHeaders() }
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
        { headers: getGitHubHeaders() }
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
                  { headers: getGitHubHeaders() }
                );

                if (intentResponse.ok) {
                  const intentData = await intentResponse.json();
                  if (intentData.content) {
                    const intentContent = Buffer.from(intentData.content, "base64").toString("utf-8");
                    const parsed = parseIntentV2(intentContent, lang || 'en');
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

    // Collect all files referenced by intents to fetch their content
    const filesToFetch = new Set<string>();
    for (const intent of intentsV2) {
      for (const file of intent.frontmatter.files) {
        filesToFetch.add(file.replace(/^\.\//, ''));
      }
    }

    // Fetch file contents from GitHub
    const fileContents: Record<string, string> = {};
    for (const filePath of filesToFetch) {
      try {
        const fileResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${head}`,
          { headers: getGitHubHeaders() }
        );
        if (fileResponse.ok) {
          const fileData = await fileResponse.json();
          if (fileData.content) {
            fileContents[filePath] = Buffer.from(fileData.content, "base64").toString("utf-8");
          }
        }
      } catch {
        // File not found or error fetching
      }
    }

    // Resolve anchors for each intent's chunks
    const resolvedIntentsV2 = intentsV2.map((intent) => {
      const resolvedChunks = intent.chunks.map((chunk) => {
        let resolvedFile: string | null = null;
        let resolved: { startLine: number; endLine: number; content: string; contentHash: string } | null = null;
        let hashMatch: boolean | null = null;

        for (const file of intent.frontmatter.files) {
          const normalizedFile = file.replace(/^\.\//, '');
          const content = fileContents[normalizedFile];
          if (!content) continue;

          const anchorResult = resolveAnchor(chunk.anchor, content);
          if (anchorResult && anchorResult.found) {
            resolvedFile = normalizedFile;
            resolved = {
              startLine: anchorResult.startLine,
              endLine: anchorResult.endLine,
              content: anchorResult.content,
              contentHash: anchorResult.hash,
            };
            if (chunk.storedHash) {
              hashMatch = anchorResult.hash === chunk.storedHash;
            }
            break;
          }
        }

        return {
          ...chunk,
          resolvedFile,
          resolved,
          hashMatch,
        };
      });

      // Detect overlaps
      const overlaps = detectOverlaps(resolvedChunks);

      return {
        ...intent,
        resolvedChunks: resolvedChunks.map(chunk => ({
          ...chunk,
          overlaps: overlaps.get(chunk.anchor) || [],
        })),
      };
    });

    res.json({
      diff,
      changedFiles,
      intents: {}, // No legacy intents for GitHub
      intentsV2: resolvedIntentsV2,
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
      { headers: getGitHubHeaders() }
    );

    if (!repoResponse.ok) {
      throw new Error(`GitHub API error: ${repoResponse.status}`);
    }

    const repoInfo = await repoResponse.json();
    const defaultBranch = repoInfo.default_branch;

    // Get all branches
    const branchesResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
      { headers: getGitHubHeaders() }
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
          { headers: getGitHubHeaders() }
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
            { headers: getGitHubHeaders() }
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
          { headers: getGitHubHeaders() }
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
app.post("/api/github-browse", async (req, res) => {
  const { owner, repo, branch, lang } = req.body as {
    owner: string;
    repo: string;
    branch: string;
    lang?: string;
  };

  if (!owner || !repo || !branch) {
    return res.status(400).json({ error: "Missing owner, repo, or branch" });
  }

  try {
    const intentsV2: IntentV2[] = [];
    let manifest: Manifest | null = null;
    const fileContents: Record<string, string> = {};
    const filesSet = new Set<string>();
    let repoInfo: { description: string | null; stars: number; language: string | null; topics: string[] } | null = null;

    // Fetch repo info (description, stars, language, topics)
    try {
      const repoResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers: getGitHubHeaders() }
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

    // Try to load intents from the branch
    try {
      // Check if manifest exists
      const manifestResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/.intent/manifest.yaml?ref=${branch}`,
        { headers: getGitHubHeaders() }
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
                  `https://api.github.com/repos/${owner}/${repo}/contents/.intent/intents/${intentEntry.file}?ref=${branch}`,
                  { headers: getGitHubHeaders() }
                );

                if (intentResponse.ok) {
                  const intentData = await intentResponse.json();
                  if (intentData.content) {
                    const intentContent = Buffer.from(intentData.content, "base64").toString("utf-8");
                    const parsed = parseIntentV2(intentContent, lang || 'en');
                    if (parsed) {
                      intentsV2.push(parsed);
                      // Collect files from frontmatter
                      for (const file of parsed.frontmatter.files) {
                        filesSet.add(file);
                      }
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

    const files = Array.from(filesSet);

    // Fetch content for each file
    for (const filePath of files) {
      try {
        const fileResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
          { headers: getGitHubHeaders() }
        );

        if (fileResponse.ok) {
          const fileData = await fileResponse.json();
          if (fileData.content) {
            fileContents[filePath] = Buffer.from(fileData.content, "base64").toString("utf-8");
          }
        }
      } catch {
        // Failed to load file content
      }
    }

    // Resolve chunks with file contents
    const resolvedIntentsV2 = intentsV2.map((intent) => ({
      ...intent,
      resolvedChunks: intent.chunks.map((chunk) => {
        // Try to resolve anchor in the files we have
        for (const filePath of intent.frontmatter.files) {
          const content = fileContents[filePath];
          if (!content) continue;

          const resolved = resolveAnchor(chunk.anchor, content);
          if (resolved && resolved.found) {
            return {
              ...chunk,
              resolved: {
                startLine: resolved.startLine,
                endLine: resolved.endLine,
                content: resolved.content,
                contentHash: resolved.hash,
              },
              resolvedFile: filePath,
              hashMatch: chunk.storedHash ? chunk.storedHash === resolved.hash : null,
            };
          }
        }

        // Anchor not resolved
        return {
          ...chunk,
          resolved: null,
          resolvedFile: null,
          hashMatch: null,
        };
      }),
    }));

    res.json({
      intentsV2: resolvedIntentsV2,
      files,
      fileContents,
      branch,
      repoInfo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Intent server running on http://localhost:${PORT}`);
});
