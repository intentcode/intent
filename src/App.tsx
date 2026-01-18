import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { parseDiff } from "./lib/parseDiff";
import type { DiffFile, DiffHunk, DiffLine } from "./lib/parseDiff";
import { DiffViewer } from "./components/DiffViewer";
import { RepoSelector } from "./components/RepoSelector";
import { fetchDiff, fetchBrowse, fetchGitHubPR, fetchGitHubBranchesDiff, fetchGitHubBrowse, fetchConfig, AuthRequiredError, type DiffMode, type IntentV2API, type RepoInfo, type AppConfig } from "./lib/api";
import { getCurrentUser, loginWithGitHub, logout, type User } from "./lib/auth";
import { TRANSLATIONS, setStoredLanguage, type Language } from "./lib/language";
import "./App.css";

type AppMode = "home" | "github-pr" | "github-compare" | "github-browse";

interface AppProps {
  mode?: AppMode;
  lang?: Language;
  onLangChange?: (lang: Language) => void;
}

interface FileData {
  diff: DiffFile;
  filename: string;
  fullFileContent?: string;
}


// Context to track what diff is being displayed
interface DiffContext {
  type: "branches" | "browse" | "github-pr" | "github-branches";
  base?: string;
  head?: string;
  repoPath?: string;
  owner?: string;
  repo?: string;
  prNumber?: number;
}

// File tree node for hierarchical display
interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  isNew?: boolean;
  children: TreeNode[];
}

// Build a tree structure from flat file paths
function buildFileTree(files: FileData[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const filePath = file.diff.newPath || file.diff.oldPath || file.filename;
    // Skip files with empty paths
    if (!filePath || filePath.trim() === '') continue;
    const parts = filePath.split('/').filter(p => p.length > 0);
    if (parts.length === 0) continue;
    const isNew = file.diff?.oldPath === "/dev/null" || !file.diff?.oldPath;

    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      let existing = currentLevel.find(n => n.name === part);
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          isFile,
          isNew: isFile ? isNew : undefined,
          children: [],
        };
        currentLevel.push(existing);
      }
      currentLevel = existing.children;
    }
  }

  // Collapse folders with single folder child (e.g., src/components -> src/components)
  const collapseNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.map(node => {
      if (!node.isFile) {
        // Recursively collapse children first
        node.children = collapseNodes(node.children);
        // If this folder has exactly one child and it's a folder, collapse them
        while (node.children.length === 1 && !node.children[0].isFile) {
          const child = node.children[0];
          node.name = `${node.name}/${child.name}`;
          node.path = child.path;
          node.children = child.children;
        }
      }
      return node;
    });
  };

  // Sort: folders first, then files, alphabetically
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .map(n => ({ ...n, children: sortNodes(n.children) }))
      .sort((a, b) => {
        if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  };

  return sortNodes(collapseNodes(root));
}

const LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
  { code: "es", label: "ES" },
  { code: "de", label: "DE" },
];

type ViewMode = "diff" | "browse" | "story";

function App({ mode, lang: propLang = "en", onLangChange }: AppProps) {
  const params = useParams<{ owner?: string; repo?: string; prNumber?: string; base?: string; head?: string; branch?: string }>();
  const [files, setFiles] = useState<FileData[]>([]);
  const [intentsV2, setIntentsV2] = useState<IntentV2API[]>([]);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [allFileContents, setAllFileContents] = useState<Record<string, string>>({});
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("diff");
  const lang = propLang;
  const setLang = (newLang: Language) => {
    if (onLangChange) {
      onLangChange(newLang);
    }
    setStoredLanguage(newLang);
  };
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState<string | null>(null); // What we're loading
  const [expandChunkAnchor, setExpandChunkAnchor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [diffRequested, setDiffRequested] = useState(false);
  const [diffContext, setDiffContext] = useState<DiffContext | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [hideIntentFiles, setHideIntentFiles] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const lastLoadParamsRef = useRef<{repoPath: string; diffMode: DiffMode; base: string; head: string} | null>(null);
  const lastBrowseParamsRef = useRef<{repoPath: string; branch: string} | null>(null);
  const lastGitHubPRRef = useRef<{owner: string; repo: string; prNumber: number} | null>(null);
  const lastGitHubBranchesRef = useRef<{owner: string; repo: string; base: string; head: string} | null>(null);
  const lastGitHubBrowseRef = useRef<{owner: string; repo: string; branch: string} | null>(null);
  const isFirstRender = useRef(true);
  const urlLoadedRef = useRef(false);

  // Toggle folder expansion
  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Expand all folders
  const expandAllFolders = (tree: TreeNode[]) => {
    const paths = new Set<string>();
    const collectPaths = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (!node.isFile) {
          paths.add(node.path);
          collectPaths(node.children);
        }
      }
    };
    collectPaths(tree);
    setExpandedFolders(paths);
  };

  // Collapse all folders
  const collapseAllFolders = () => {
    setExpandedFolders(new Set());
  };

  // Auto-expand all folders when files change
  useEffect(() => {
    if (files.length > 0) {
      const tree = buildFileTree(files);
      expandAllFolders(tree);
    }
  }, [files]);

  // Fetch current user and config on mount
  useEffect(() => {
    getCurrentUser().then(setUser);
    fetchConfig().then(setAppConfig);
  }, []);

  // Auto-load from URL params
  useEffect(() => {
    if (urlLoadedRef.current) return;

    const { owner, repo, prNumber, base, head, branch } = params;

    if (mode === "github-pr" && owner && repo && prNumber) {
      urlLoadedRef.current = true;
      loadFromGitHub(owner, repo, parseInt(prNumber, 10));
    } else if (mode === "github-compare" && owner && repo && base && head) {
      urlLoadedRef.current = true;
      loadFromGitHubBranches(owner, repo, base, head);
    } else if (mode === "github-browse" && owner && repo) {
      urlLoadedRef.current = true;
      loadFromGitHubBrowse(owner, repo, branch || "main");
    }
  }, [mode, params]);

  // Translation helper
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;

  // Helper: Switch view mode - direct state change, CSS handles transition
  const switchViewMode = (newMode: ViewMode) => {
    if (newMode === viewMode) return;
    setViewMode(newMode);
  };

  // Helper: check if any line in a range is visible in the diff hunks
  const isRangeInDiff = (filePath: string, startLine: number, endLine: number): boolean => {
    const file = files.find(f => {
      const fp = f.diff?.newPath || f.diff?.oldPath || f.filename || '';
      return fp === filePath || fp.endsWith('/' + filePath) || filePath.endsWith('/' + fp);
    });
    if (!file || !file.diff?.hunks) return false;

    // Check if any line in the range is in any hunk
    for (const hunk of file.diff.hunks) {
      if (!hunk.lines || !Array.isArray(hunk.lines)) continue;
      for (const line of hunk.lines) {
        if (line.type !== 'remove' && line.newLineNumber !== undefined) {
          if (line.newLineNumber >= startLine && line.newLineNumber <= endLine) {
            return true;
          }
        }
      }
    }
    return false;
  };

  // Filter intents and mark chunks as in-diff or context
  // Show intent if it has at least one chunk in the diff
  // Keep ALL chunks of that intent (for context display)
  const filteredIntentsV2 = useMemo(() => {
    // In browse or story mode, show all intents without filtering
    if (viewMode === "browse" || viewMode === "story") return intentsV2;
    if (files.length === 0) return intentsV2;

    return intentsV2.filter(intent => {
      // Check if at least one chunk is in the diff
      return intent.resolvedChunks.some(chunk => {
        if (!chunk.resolved || !chunk.resolvedFile) return false;
        return isRangeInDiff(chunk.resolvedFile, chunk.resolved.startLine, chunk.resolved.endLine);
      });
    });
  }, [intentsV2, files, viewMode]);

  // Create virtual hunks for context chunks (chunks not in diff but intent is shown)
  const virtualHunksMap = useMemo(() => {
    const CONTEXT_LINES = 10; // Lines of context before/after chunk
    const virtualHunks: Record<string, DiffHunk[]> = {};

    if (viewMode === "browse") return virtualHunks;

    for (const intent of filteredIntentsV2) {
      for (const chunk of intent.resolvedChunks) {
        if (!chunk.resolved || !chunk.resolvedFile) continue;

        // Check if this chunk is NOT in the diff (context chunk)
        const inDiff = isRangeInDiff(chunk.resolvedFile, chunk.resolved.startLine, chunk.resolved.endLine);
        if (inDiff) continue; // Skip chunks that are already in the diff

        // Get file content to create virtual hunk
        const fileContent = allFileContents[chunk.resolvedFile];
        if (!fileContent) continue;

        const fileLines = fileContent.split('\n');
        const { startLine, endLine } = chunk.resolved;

        // Calculate context range
        const contextStart = Math.max(1, startLine - CONTEXT_LINES);
        const contextEnd = Math.min(fileLines.length, endLine + CONTEXT_LINES);

        // Create virtual hunk lines
        const hunkLines: DiffLine[] = [];

        // Header line
        const hunkHeader = `@@ -${contextStart},${contextEnd - contextStart + 1} +${contextStart},${contextEnd - contextStart + 1} @@ (context for ${chunk.title || chunk.anchor})`;
        hunkLines.push({ type: "header", content: hunkHeader });

        // Add lines as context (no +/-)
        for (let i = contextStart; i <= contextEnd; i++) {
          const lineContent = fileLines[i - 1] || '';
          hunkLines.push({
            type: "context",
            content: lineContent,
            oldLineNumber: i,
            newLineNumber: i,
          });
        }

        // Create the virtual hunk
        const virtualHunk: DiffHunk = {
          header: hunkHeader,
          startLineOld: contextStart,
          startLineNew: contextStart,
          lines: hunkLines,
          isVirtual: true, // Mark as virtual for styling
          chunkAnchor: chunk.anchor, // Reference to the chunk
        };

        // Add to the map
        if (!virtualHunks[chunk.resolvedFile]) {
          virtualHunks[chunk.resolvedFile] = [];
        }
        virtualHunks[chunk.resolvedFile].push(virtualHunk);
      }
    }

    return virtualHunks;
  }, [filteredIntentsV2, allFileContents, viewMode]);

  // Merge virtual hunks into files (without mutating original state)
  const filesWithVirtualHunks = useMemo((): FileData[] => {
    if (viewMode === "browse") return files;
    if (Object.keys(virtualHunksMap).length === 0) return files;

    const existingFilePaths = new Set(files.map(f => f.diff?.newPath || f.diff?.oldPath || f.filename));

    // Create new array with merged hunks
    const result: FileData[] = files.map(file => {
      const fp = file.diff?.newPath || file.diff?.oldPath || file.filename || '';

      // Find matching virtual hunks for this file
      const matchingVirtualHunks = Object.entries(virtualHunksMap).find(([vhPath]) =>
        vhPath === fp || vhPath.endsWith('/' + fp) || fp.endsWith('/' + vhPath)
      );

      if (matchingVirtualHunks && file.diff) {
        const [, vhunks] = matchingVirtualHunks;
        const allHunks = [...file.diff.hunks, ...vhunks];
        allHunks.sort((a, b) => a.startLineNew - b.startLineNew);

        return {
          ...file,
          diff: {
            ...file.diff,
            hunks: allHunks,
          },
        };
      }
      return file;
    });

    // Add new files for virtual hunks that don't have existing files
    for (const [filePath, virtualHunks] of Object.entries(virtualHunksMap)) {
      const hasExistingFile = files.some(f => {
        const fp = f.diff?.newPath || f.diff?.oldPath || f.filename || '';
        return fp === filePath || fp.endsWith('/' + filePath) || filePath.endsWith('/' + fp);
      });

      if (!hasExistingFile && !existingFilePaths.has(filePath)) {
        const fileContent = allFileContents[filePath];
        result.push({
          diff: {
            oldPath: filePath,
            newPath: filePath,
            hunks: virtualHunks,
          },
          filename: filePath.split('/').pop() || filePath,
          fullFileContent: fileContent,
        });
      }
    }

    return result;
  }, [files, virtualHunksMap, allFileContents, viewMode]);

  // Get the currently selected intent
  const selectedIntent = useMemo(() => {
    if (!selectedIntentId) return null;
    return filteredIntentsV2.find(i => i.frontmatter.id === selectedIntentId) || null;
  }, [selectedIntentId, filteredIntentsV2]);

  // Filter out .intent/ files from the file list when hideIntentFiles is true
  // Use filesWithVirtualHunks to include context chunks
  const filteredFiles = useMemo(() => {
    const sourceFiles = filesWithVirtualHunks;
    if (!hideIntentFiles) return sourceFiles;
    return sourceFiles.filter(file => {
      const filePath = file.diff?.newPath || file.diff?.oldPath || file.filename || '';
      return !filePath.startsWith('.intent/') && !filePath.includes('/.intent/');
    });
  }, [filesWithVirtualHunks, hideIntentFiles]);

  // Reload when language changes
  useEffect(() => {
    // Skip the first render (initial mount)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (loading) return;

    console.log('[Lang change] lang:', lang, 'viewMode:', viewMode, 'refs:', {
      browse: lastBrowseParamsRef.current,
      githubPR: lastGitHubPRRef.current,
      githubBranches: lastGitHubBranchesRef.current,
      githubBrowse: lastGitHubBrowseRef.current,
      load: lastLoadParamsRef.current
    });

    // Reload based on current mode - check GitHub refs first as they're more specific
    if (lastGitHubPRRef.current) {
      console.log('[Lang change] Reloading GitHub PR with lang:', lang);
      const { owner, repo, prNumber } = lastGitHubPRRef.current;
      loadFromGitHub(owner, repo, prNumber, lang);
    } else if (lastGitHubBranchesRef.current) {
      console.log('[Lang change] Reloading GitHub branches with lang:', lang);
      const { owner, repo, base, head } = lastGitHubBranchesRef.current;
      loadFromGitHubBranches(owner, repo, base, head, lang);
    } else if (lastGitHubBrowseRef.current) {
      console.log('[Lang change] Reloading GitHub browse with lang:', lang, 'viewMode:', viewMode);
      const { owner, repo, branch } = lastGitHubBrowseRef.current;
      // Preserve view mode (story or browse) when reloading for language change
      loadFromGitHubBrowse(owner, repo, branch, lang, true);
    } else if (viewMode === "story" && lastBrowseParamsRef.current) {
      const { repoPath, branch } = lastBrowseParamsRef.current;
      loadStory(repoPath, branch, lang);
    } else if (viewMode === "browse" && lastBrowseParamsRef.current) {
      const { repoPath, branch } = lastBrowseParamsRef.current;
      loadBrowse(repoPath, branch, lang);
    } else if (lastLoadParamsRef.current) {
      const { repoPath, diffMode, base, head } = lastLoadParamsRef.current;
      loadFromRepo(repoPath, diffMode, base, head, lang);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Load from git repo
  const loadFromRepo = async (repoPath: string, diffMode: DiffMode, base: string, head: string, langOverride?: Language) => {
    setLoading(true);
    setLoadingContext("diff");
    setError(null);
    setDiffRequested(true);
    setDiffContext({
      type: diffMode,
      base,
      head,
      repoPath,
    });
    // Clear other refs to prevent conflicts on lang change
    lastLoadParamsRef.current = { repoPath, diffMode, base, head };
    lastGitHubPRRef.current = null;
    lastGitHubBranchesRef.current = null;
    lastGitHubBrowseRef.current = null;
    lastBrowseParamsRef.current = null;

    try {
      // Pass language for intent file lookup (en is base, others have suffix)
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchDiff(repoPath, diffMode, base, head, langParam);
      const diffFiles = parseDiff(response.diff);

      // Store v2 intents and changed files
      setIntentsV2(response.intentsV2 || []);
      setChangedFiles(response.changedFiles || []);
      setAllFileContents(response.fileContents || {});

      const parsed: FileData[] = diffFiles.map((diffFile) => {
        const filePath = diffFile.newPath || diffFile.oldPath || "";
        const filename = filePath.split("/").pop() || filePath;
        const fullFileContent = response.fileContents?.[filePath];

        return {
          diff: diffFile,
          filename,
          fullFileContent,
        };
      });

      setFiles(parsed);
      setViewMode("diff"); // Set view mode to diff for compare
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diff");
    } finally {
      setLoading(false);
    }
  };

  // Load browse mode - view a single branch with intents
  const loadBrowse = async (repoPath: string, branch: string, langOverride?: Language) => {
    setLoading(true);
    setLoadingContext("browse");
    setError(null);
    setDiffRequested(true);
    setDiffContext({
      type: "browse",
      head: branch,
      repoPath,
    });
    setViewMode("browse"); // Set view mode to browse
    // Clear other refs to prevent conflicts on lang change
    lastBrowseParamsRef.current = { repoPath, branch };
    lastGitHubPRRef.current = null;
    lastGitHubBranchesRef.current = null;
    lastGitHubBrowseRef.current = null;
    lastLoadParamsRef.current = null;

    try {
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchBrowse(repoPath, branch, langParam);

      // Store v2 intents
      setIntentsV2(response.intentsV2 || []);
      setChangedFiles(response.files || []);

      // Create file data for each file in intents
      const parsed: FileData[] = response.files.map((filePath) => {
        const filename = filePath.split("/").pop() || filePath;
        const fullFileContent = response.fileContents?.[filePath];

        // Create a fake diff file with no hunks (browse mode)
        const diff: DiffFile = {
          oldPath: filePath,
          newPath: filePath,
          hunks: [],
        };

        return {
          diff,
          filename,
          fullFileContent,
        };
      });

      setFiles(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to browse branch");
    } finally {
      setLoading(false);
    }
  };

  // Load story mode - view intents only as a narrative
  const loadStory = async (repoPath: string, branch: string, langOverride?: Language) => {
    setLoading(true);
    setLoadingContext("story");
    setError(null);
    setDiffRequested(true);
    setDiffContext({
      type: "browse", // Uses same context type as browse
      head: branch,
      repoPath,
    });
    setViewMode("story"); // Set view mode to story
    // Clear other refs to prevent conflicts on lang change
    lastBrowseParamsRef.current = { repoPath, branch };
    lastGitHubPRRef.current = null;
    lastGitHubBranchesRef.current = null;
    lastGitHubBrowseRef.current = null;
    lastLoadParamsRef.current = null;

    try {
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchBrowse(repoPath, branch, langParam);

      // Store v2 intents only - we don't need files for story mode
      setIntentsV2(response.intentsV2 || []);
      setChangedFiles([]);
      setFiles([]); // No files needed for story mode
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load story");
    } finally {
      setLoading(false);
    }
  };

  // Load from GitHub PR
  const loadFromGitHub = async (owner: string, repo: string, prNumber: number, langOverride?: Language) => {
    setLoading(true);
    setLoadingContext("github-pr");
    setError(null);
    setDiffRequested(true);
    setDiffContext({
      type: "github-pr",
      owner,
      repo,
      prNumber,
    });
    // Clear other refs to prevent conflicts on lang change
    lastGitHubPRRef.current = { owner, repo, prNumber };
    lastGitHubBranchesRef.current = null;
    lastGitHubBrowseRef.current = null;
    lastLoadParamsRef.current = null;
    lastBrowseParamsRef.current = null;

    try {
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      console.log('[loadFromGitHub] Fetching with lang:', langParam, 'currentLang:', currentLang);
      const response = await fetchGitHubPR(owner, repo, prNumber, langParam);
      const diffFiles = parseDiff(response.diff);

      const parsed: FileData[] = diffFiles.map((diffFile) => {
        const filePath = diffFile.newPath || diffFile.oldPath || "";
        const filename = filePath.split("/").pop() || filePath;
        const fullFileContent = response.fileContents?.[filePath];

        return {
          diff: diffFile,
          filename,
          fullFileContent,
        };
      });

      setFiles(parsed);
      setIntentsV2(response.intentsV2 || []);
      setChangedFiles(response.changedFiles || []);
      setAllFileContents(response.fileContents || {});
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        setNeedsAuth(true);
        setError(err.message);
      } else {
        setNeedsAuth(false);
        setError(err instanceof Error ? err.message : "Failed to load GitHub PR");
      }
    } finally {
      setLoading(false);
    }
  };

  // Load from GitHub branches comparison
  const loadFromGitHubBranches = async (owner: string, repo: string, base: string, head: string, langOverride?: Language) => {
    setLoading(true);
    setLoadingContext("github-branches");
    setError(null);
    setDiffRequested(true);
    setDiffContext({
      type: "github-branches",
      base,
      head,
      owner,
      repo,
    });
    // Clear other refs to prevent conflicts on lang change
    lastGitHubBranchesRef.current = { owner, repo, base, head };
    lastGitHubPRRef.current = null;
    lastGitHubBrowseRef.current = null;
    lastLoadParamsRef.current = null;
    lastBrowseParamsRef.current = null;

    try {
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchGitHubBranchesDiff(owner, repo, base, head, langParam);
      const diffFiles = parseDiff(response.diff);

      // Store v2 intents and changed files
      setIntentsV2(response.intentsV2 || []);
      setChangedFiles(response.changedFiles || []);
      setAllFileContents(response.fileContents || {});

      const parsed: FileData[] = diffFiles.map((diffFile) => {
        const filePath = diffFile.newPath || diffFile.oldPath || "";
        const filename = filePath.split("/").pop() || filePath;
        const fullFileContent = response.fileContents?.[filePath];

        return {
          diff: diffFile,
          filename,
          fullFileContent,
        };
      });

      setFiles(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GitHub branches diff");
    } finally {
      setLoading(false);
    }
  };

  // Load from GitHub browse mode (view a single branch with intents)
  const loadFromGitHubBrowse = async (owner: string, repo: string, branch: string, langOverride?: Language, preserveViewMode?: boolean) => {
    setLoading(true);
    setLoadingContext("github-browse");
    setError(null);
    setDiffRequested(true);
    setDiffContext({
      type: "browse",
      head: branch,
      owner,
      repo,
    });
    // Clear other refs to prevent conflicts on lang change
    lastGitHubBrowseRef.current = { owner, repo, branch };
    lastGitHubPRRef.current = null;
    lastGitHubBranchesRef.current = null;
    lastLoadParamsRef.current = null;
    lastBrowseParamsRef.current = null;
    if (!preserveViewMode) {
      setViewMode("browse");
    }

    try {
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchGitHubBrowse(owner, repo, branch, langParam);

      // Store v2 intents and repo info
      setIntentsV2(response.intentsV2 || []);
      setChangedFiles(response.files || []);
      setRepoInfo(response.repoInfo || null);

      // Create file data for each file in intents
      const parsed: FileData[] = response.files.map((filePath) => {
        const filename = filePath.split("/").pop() || filePath;
        const fullFileContent = response.fileContents?.[filePath];

        // Create a fake diff file with no hunks (browse mode)
        const diff: DiffFile = {
          oldPath: filePath,
          newPath: filePath,
          hunks: [],
        };

        return {
          diff,
          filename,
          fullFileContent,
        };
      });

      setFiles(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to browse GitHub repository");
    } finally {
      setLoading(false);
    }
  };

  const handleLinkClick = (targetFile: string, targetRange: string) => {
    // Find the target element and scroll to it
    const targetId = `chunk-${targetFile}-${targetRange}`;
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("chunk-highlight");
      setTimeout(() => element.classList.remove("chunk-highlight"), 2000);
    }
  };

  // Helper to render the diff context info
  const renderDiffContextBadge = () => {
    if (!diffContext) return null;

    const getLabel = () => {
      switch (diffContext.type) {
        case "browse":
          return `${diffContext.head}`;
        case "branches":
          return `${diffContext.base} → ${diffContext.head}`;
        case "github-pr":
          return `PR #${diffContext.prNumber}`;
        case "github-branches":
          return `${diffContext.owner}/${diffContext.repo}: ${diffContext.base} → ${diffContext.head}`;
        default:
          return "";
      }
    };

    const getIcon = () => {
      switch (diffContext.type) {
        case "browse":
          return "📖";
        case "branches":
        case "github-branches":
          return "🔀";
        case "github-pr":
          return "🔗";
        default:
          return "📄";
      }
    };

    const getRepoName = () => {
      if (diffContext.type === "github-pr" || diffContext.type === "github-branches") {
        return `${diffContext.owner}/${diffContext.repo}`;
      }
      if (diffContext.repoPath) {
        return diffContext.repoPath.split("/").pop() || diffContext.repoPath;
      }
      return "";
    };

    return (
      <div className="diff-context-badge">
        <span className="diff-context-icon">{getIcon()}</span>
        <span className="diff-context-repo">{getRepoName()}</span>
        <span className="diff-context-separator">|</span>
        <span className="diff-context-label">{getLabel()}</span>
      </div>
    );
  };

  // Get GitHub URL from current context
  const getGitHubUrl = () => {
    if (!diffContext) return null;
    const { owner, repo, prNumber, base, head } = diffContext;
    if (owner && repo) {
      if (prNumber) {
        return `https://github.com/${owner}/${repo}/pull/${prNumber}`;
      }
      if (base && head) {
        return `https://github.com/${owner}/${repo}/compare/${base}...${head}`;
      }
      return `https://github.com/${owner}/${repo}`;
    }
    return null;
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <a href="/home" className="header-logo">
            <img src="/intent_logo.png" alt="Intent" className="logo-icon" />
            <h1>Intent</h1>
          </a>
          {mode !== "home" && (
            <a href="/home" className="nav-home-link">
              ← Home
            </a>
          )}
        </div>
        <span className="tagline">Intent-based code review</span>
        <div className="header-right">
          {getGitHubUrl() && (
            <a
              href={getGitHubUrl()!}
              target="_blank"
              rel="noopener noreferrer"
              className="github-link"
            >
              View on GitHub ↗
            </a>
          )}
          <div className="lang-selector">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                className={lang === l.code ? "active" : ""}
                onClick={() => setLang(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="auth-section">
            {user ? (
              <div className="user-menu">
                <img src={user.avatar} alt={user.login} className="user-avatar" />
                <span className="user-name">{user.login}</span>
                <button onClick={logout} className="logout-btn">Logout</button>
              </div>
            ) : (
              <button onClick={() => loginWithGitHub(window.location.pathname)} className="login-btn">
                Login with GitHub
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Only show RepoSelector in home mode */}
      {mode === "home" && (
        <RepoSelector
          onLoadLocal={loadFromRepo}
          onLoadBrowse={loadBrowse}
          onLoadStory={loadStory}
          onLoadGitHub={loadFromGitHub}
          onLoadGitHubBranches={loadFromGitHubBranches}
          loading={loading}
          error={error}
          defaultPath={appConfig?.defaultRepoPath ?? ""}
          localOnly={true}
        />
      )}

      {/* Show diff context badge when a diff was requested - hide in browse mode when Project Overview is shown */}
      {diffContext && !loading && viewMode !== "story" && viewMode !== "browse" && (
        <div className="diff-context-container">
          {renderDiffContextBadge()}
        </div>
      )}

      {/* Story Mode - Collapsible section at top, code visible below */}
      {viewMode === "story" && !loading && diffRequested && !error && filteredIntentsV2.length > 0 && (
        <div className="story-mode-page">
          <div className="story-header">
            <div className="story-header-left">
              <h2 className="story-title">📚 {t('storyMode')}</h2>
              <span className="story-context">
                {diffContext?.repoPath?.split('/').pop()} • {diffContext?.head}
              </span>
            </div>
            <button
              className="story-exit-btn"
              onClick={() => switchViewMode("browse")}
            >
              {t('backToCode')}
            </button>
          </div>

          {filteredIntentsV2.length === 0 ? (
            <div className="story-empty">
              <div className="story-empty-icon">📭</div>
              <p>{t('noIntentsForStory')}</p>
            </div>
          ) : (
            <div className="story-content">
              {filteredIntentsV2.map((intent, idx) => (
                <article key={intent.frontmatter.id} className="story-chapter">
                  <div className="chapter-header">
                    <span className="chapter-number">{t('chapter')} {idx + 1}</span>
                    <div className="chapter-meta">
                      <span className="chapter-id">#{intent.frontmatter.id}</span>
                      {intent.frontmatter.risk && (
                        <span className={`risk-badge risk-${intent.frontmatter.risk}`}>
                          {intent.frontmatter.risk}
                        </span>
                      )}
                      {intent.frontmatter.date && (
                        <span className="chapter-date">{intent.frontmatter.date}</span>
                      )}
                    </div>
                  </div>

                  <h3 className="chapter-title">{intent.title}</h3>

                  {intent.summary && (
                    <div className="chapter-summary">
                      <p>{intent.summary}</p>
                    </div>
                  )}

                  {intent.motivation && (
                    <div className="chapter-motivation">
                      <h4>{t('motivation')}</h4>
                      <p>{intent.motivation}</p>
                    </div>
                  )}

                  {intent.frontmatter.tags && intent.frontmatter.tags.length > 0 && (
                    <div className="chapter-tags">
                      {intent.frontmatter.tags.map((tag, i) => (
                        <span key={i} className="tag-pill">{tag}</span>
                      ))}
                    </div>
                  )}

                  {intent.resolvedChunks.length > 0 && (
                    <div className="chapter-chunks">
                      {intent.resolvedChunks.map((chunk, chunkIdx) => (
                        <div
                          key={chunkIdx}
                          className="story-chunk story-chunk-clickable"
                          onClick={() => {
                            // Scroll immediately
                            const chunkFile = intent.frontmatter.files[0] || '';
                            const filename = chunkFile.split('/').pop() || chunkFile;
                            const targetId = `chunk-${filename}-${chunk.anchor}`;
                            const element = document.getElementById(targetId);
                            if (element) {
                              element.scrollIntoView({ behavior: "smooth", block: "center" });
                              element.classList.add("chunk-highlight");
                              setTimeout(() => element.classList.remove("chunk-highlight"), 2000);
                            }

                            // Expand chunk after 5ms
                            setTimeout(() => {
                              setExpandChunkAnchor(chunk.anchor);
                              setTimeout(() => setExpandChunkAnchor(null), 100);
                            }, 5);
                          }}
                          title={t('backToCode')}
                        >
                          <div className="story-chunk-header">
                            <span className="story-chunk-anchor">{chunk.anchor}</span>
                            {chunk.title && <span className="story-chunk-title">{chunk.title}</span>}
                            <span className="story-chunk-goto">→</span>
                          </div>
                          {chunk.description && (
                            <p className="story-chunk-description">{chunk.description}</p>
                          )}
                          {chunk.decisions && chunk.decisions.length > 0 && (
                            <div className="story-chunk-decisions">
                              {chunk.decisions.map((decision, dIdx) => (
                                <div key={dIdx} className="story-decision">
                                  <span className="decision-arrow">→</span>
                                  <span>{decision}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auth required error - show login prompt */}
      {error && needsAuth && !loading && (
        <div className="auth-required-banner">
          <div className="auth-required-icon">🔒</div>
          <div className="auth-required-content">
            <div className="auth-required-title">
              {lang === "fr" ? "Authentification requise" : "Authentication Required"}
            </div>
            <div className="auth-required-desc">
              {lang === "fr"
                ? "Ce dépôt est peut-être privé. Connectez-vous avec GitHub pour y accéder."
                : "This repository may be private. Please login with GitHub to access it."}
            </div>
          </div>
          <button
            onClick={() => loginWithGitHub(window.location.pathname)}
            className="auth-required-btn"
          >
            {lang === "fr" ? "Se connecter avec GitHub" : "Login with GitHub"}
          </button>
        </div>
      )}

      {/* General error display */}
      {error && !needsAuth && !loading && (
        <div className="error-banner">
          <div className="error-icon">😵</div>
          <div className="error-title">{t("errorTitle")}</div>
          <div className="error-message">{t("errorMessage")}</div>
          <div className="error-details">{error}</div>
          <button
            className="error-retry-btn"
            onClick={() => window.location.reload()}
          >
            {t("retry")}
          </button>
        </div>
      )}

      {/* Empty state for home mode - waiting for user to select a repo */}
      {files.length === 0 && !loading && !diffRequested && mode === "home" && (
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <div className="empty-state-title">Select a repository</div>
          <div className="empty-state-hint">Browse for a git repository, then choose the branches to compare</div>
        </div>
      )}

      {/* Empty state for GitHub modes - no diff/content found */}
      {filteredFiles.length === 0 && !loading && diffRequested && !error && filteredIntentsV2.length === 0 && viewMode !== "story" && (
        <div className="empty-state no-diff">
          <div className="no-diff-icon">📭</div>
          <div className="no-diff-title">
            {diffContext?.type === "browse" ? "No intents found" : "No changes found"}
          </div>
          <div className="no-diff-hint">
            {diffContext?.type === "branches" && `Branches ${diffContext.base} and ${diffContext.head} are identical.`}
            {diffContext?.type === "github-pr" && "This PR has no file changes."}
            {diffContext?.type === "github-branches" && `Branches ${diffContext.base} and ${diffContext.head} are identical.`}
            {diffContext?.type === "browse" && "This repository doesn't have any intents configured."}
            {!diffContext && "The branches might be identical or contain only intent files."}
          </div>
        </div>
      )}

      {/* Show intents even without code diff - unified design (Browse Mode) */}
      {filteredFiles.length === 0 && !loading && diffRequested && !error && filteredIntentsV2.length > 0 && viewMode !== "story" && (
        <>
          {/* Project Overview Header */}
          <div className="project-overview">
            <div className="project-overview-header">
              <div className="project-overview-info">
                <h2 className="project-overview-title">{t('projectOverview')}</h2>
                <p className="project-overview-description">
                  {repoInfo?.description || filteredIntentsV2[0]?.summary || t('noDescription')}
                </p>
                <div className="project-overview-meta">
                  {repoInfo?.stars !== undefined && repoInfo.stars > 0 && (
                    <span className="meta-item meta-stars">
                      <span className="meta-icon-styled">★</span>
                      <span className="meta-value">{repoInfo.stars.toLocaleString()}</span>
                    </span>
                  )}
                  {repoInfo?.language && (
                    <span className="meta-item meta-language">
                      <span className="meta-dot"></span>
                      <span className="meta-value">{repoInfo.language}</span>
                    </span>
                  )}
                  <span className="meta-item meta-intents">
                    <span className="meta-badge">{filteredIntentsV2.length}</span>
                    <span className="meta-value">{t('intentsCount')}</span>
                  </span>
                  <span className="meta-item meta-files">
                    <span className="meta-badge">{new Set(filteredIntentsV2.flatMap(i => i.frontmatter.files)).size}</span>
                    <span className="meta-value">{t('filesDocumented')}</span>
                  </span>
                </div>
                {/* Risk Overview */}
                {filteredIntentsV2.some(i => i.frontmatter.risk) && (
                  <div className="project-overview-risk">
                    {filteredIntentsV2.filter(i => i.frontmatter.risk === 'high').length > 0 && (
                      <span className="risk-item risk-high">
                        <span className="risk-count">{filteredIntentsV2.filter(i => i.frontmatter.risk === 'high').length}</span>
                        <span className="risk-label">{t('highRisk')}</span>
                      </span>
                    )}
                    {filteredIntentsV2.filter(i => i.frontmatter.risk === 'medium').length > 0 && (
                      <span className="risk-item risk-medium">
                        <span className="risk-count">{filteredIntentsV2.filter(i => i.frontmatter.risk === 'medium').length}</span>
                        <span className="risk-label">{t('mediumRisk')}</span>
                      </span>
                    )}
                    {filteredIntentsV2.filter(i => i.frontmatter.risk === 'low').length > 0 && (
                      <span className="risk-item risk-low">
                        <span className="risk-count">{filteredIntentsV2.filter(i => i.frontmatter.risk === 'low').length}</span>
                        <span className="risk-label">{t('lowRisk')}</span>
                      </span>
                    )}
                  </div>
                )}
                {/* Branch Info */}
                {diffContext && (
                  <div className="project-overview-branch">
                    <span className="branch-icon">⎇</span>
                    <span className="branch-name">{diffContext.head}</span>
                    {diffContext.owner && diffContext.repo && (
                      <span className="branch-repo">{diffContext.owner}/{diffContext.repo}</span>
                    )}
                  </div>
                )}
              </div>
              <button
                className="story-mode-btn"
                onClick={() => switchViewMode("story")}
              >
                📚 {t('viewStoryMode')}
              </button>
            </div>
          </div>

          {/* Intent recap at top - like PR recap */}
          {filteredIntentsV2.map((intent, intentIdx) => (
            <div key={intentIdx} className="pr-recap intent-recap">
              <div className="pr-meta">
                <span className="pr-date">{intent.frontmatter.date || ''}</span>
                <span className="pr-title">{intent.title}</span>
                {intent.frontmatter.risk && (
                  <span className={`risk-badge risk-${intent.frontmatter.risk}`}>{intent.frontmatter.risk}</span>
                )}
              </div>
              <div className="pr-info">
                <div className="pr-item">
                  <span className="pr-label">{t('summary')}</span>
                  <span className="pr-value">{intent.summary}</span>
                </div>
                {intent.motivation && (
                  <div className="pr-item">
                    <span className="pr-label">{t('motivation')}</span>
                    <span className="pr-value">{intent.motivation}</span>
                  </div>
                )}
                <div className="pr-item">
                  <span className="pr-label">{t('files')}</span>
                  <span className="pr-value">{intent.frontmatter.files.join(', ')}</span>
                </div>
                {filteredIntentsV2.some(i => i.resolvedChunks.some(c => c.hashMatch === false)) && (
                  <div className="pr-item">
                    <span className="pr-label stale-warning">{t('warning')}</span>
                    <span className="pr-value stale-warning">{t('staleWarning')}</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          <main className="app-main">
            {/* File Tree Sidebar */}
            <div className="files-sidebar">
              <div className="sidebar-title">{t('documentedFiles')}</div>
              <div className="file-tree">
                {filteredIntentsV2.map((intent, i) => (
                  intent.frontmatter.files.map((file, j) => (
                    <div
                      key={`${i}-${j}`}
                      className="tree-file documented"
                      onClick={() => {
                        const el = document.getElementById(`intent-file-${i}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      <span className="tree-file-icon">📄</span>
                      {file.split('/').pop()}
                    </div>
                  ))
                ))}
              </div>
            </div>

            {/* Files Content - using unified DiffViewer */}
            <div className="files-content">
              {filteredIntentsV2.map((intent, i) => {
                const intentChunks = intent.resolvedChunks.filter(c => c.resolved?.content);
                return (
                <div key={i} id={`intent-file-${i}`}>
                  <DiffViewer
                    filename={intent.frontmatter.files[0] || 'unknown'}
                    resolvedChunks={intentChunks}
                    intentTitle={intent.title}
                    onLinkClick={handleLinkClick}
                    expandChunkAnchor={expandChunkAnchor && intentChunks.some(c => c.anchor === expandChunkAnchor) ? expandChunkAnchor : undefined}
                    translations={{
                      new: t('new'), existing: t('existing'), context: t('context'), notInDiff: t('notInDiff'), modified: t('modified'),
                      deepDive: t('deepDive'), toastCopied: t('toastCopied'), toastError: t('toastError'),
                      promptTitle: t('promptTitle'), promptDisclaimer: t('promptDisclaimer'), promptContext: t('promptContext'),
                      promptFile: t('promptFile'), promptIntent: t('promptIntent'), promptChunkToExplore: t('promptChunkToExplore'),
                      promptAnchor: t('promptAnchor'), promptTitleLabel: t('promptTitleLabel'), promptDescription: t('promptDescription'),
                      promptDecisions: t('promptDecisions'), promptSourceCode: t('promptSourceCode'), promptLines: t('promptLines'),
                      promptCodeNotAvailable: t('promptCodeNotAvailable'), promptQuestion: t('promptQuestion'),
                      promptQuestionPlaceholder: t('promptQuestionPlaceholder'), deepDiveTooltip: t('deepDiveTooltip')
                    }}
                  />
                </div>
              );
              })}
            </div>
          </main>
        </>
      )}

      {files.length === 0 && loading && (
        <div className="loading-page">
          <div className="loading-spinner"></div>
          <div className="loading-text">
            {loadingContext === "diff" && t('loadingDiff')}
            {loadingContext === "browse" && t('loadingBrowse')}
            {loadingContext === "story" && t('loadingStory')}
            {loadingContext === "github-pr" && t('loadingPR')}
            {loadingContext === "github-branches" && t('loadingBranches')}
            {loadingContext === "github-browse" && t('loadingGitHubBrowse')}
            {!loadingContext && t('loading')}
          </div>
          {diffContext?.owner && diffContext?.repo && (
            <div className="loading-repo">{diffContext.owner}/{diffContext.repo}</div>
          )}
        </div>
      )}

      {filteredFiles.length > 0 && (
        <>
      {/* Project Overview Header for Browse Mode */}
      {viewMode === "browse" && filteredIntentsV2.length > 0 && (
        <div className="project-overview">
          <div className="project-overview-header">
            <div className="project-overview-info">
              <h2 className="project-overview-title">{t('projectOverview')}</h2>
              <p className="project-overview-description">
                {repoInfo?.description || filteredIntentsV2[0]?.summary || t('noDescription')}
              </p>
              <div className="project-overview-meta">
                {repoInfo?.stars !== undefined && repoInfo.stars > 0 && (
                  <span className="meta-item meta-stars">
                    <span className="meta-icon-styled">★</span>
                    <span className="meta-value">{repoInfo.stars.toLocaleString()}</span>
                  </span>
                )}
                {repoInfo?.language && (
                  <span className="meta-item meta-language">
                    <span className="meta-dot"></span>
                    <span className="meta-value">{repoInfo.language}</span>
                  </span>
                )}
                <span className="meta-item meta-intents">
                  <span className="meta-badge">{filteredIntentsV2.length}</span>
                  <span className="meta-value">{t('intentsCount')}</span>
                </span>
                <span className="meta-item meta-files">
                  <span className="meta-badge">{new Set(filteredIntentsV2.flatMap(i => i.frontmatter.files)).size}</span>
                  <span className="meta-value">{t('filesDocumented')}</span>
                </span>
              </div>
              {/* Risk Overview */}
              {filteredIntentsV2.some(i => i.frontmatter.risk) && (
                <div className="project-overview-risk">
                  {filteredIntentsV2.filter(i => i.frontmatter.risk === 'high').length > 0 && (
                    <span className="risk-item risk-high">
                      <span className="risk-count">{filteredIntentsV2.filter(i => i.frontmatter.risk === 'high').length}</span>
                      <span className="risk-label">{t('highRisk')}</span>
                    </span>
                  )}
                  {filteredIntentsV2.filter(i => i.frontmatter.risk === 'medium').length > 0 && (
                    <span className="risk-item risk-medium">
                      <span className="risk-count">{filteredIntentsV2.filter(i => i.frontmatter.risk === 'medium').length}</span>
                      <span className="risk-label">{t('mediumRisk')}</span>
                    </span>
                  )}
                  {filteredIntentsV2.filter(i => i.frontmatter.risk === 'low').length > 0 && (
                    <span className="risk-item risk-low">
                      <span className="risk-count">{filteredIntentsV2.filter(i => i.frontmatter.risk === 'low').length}</span>
                      <span className="risk-label">{t('lowRisk')}</span>
                    </span>
                  )}
                </div>
              )}
              {/* Branch Info */}
              {diffContext && (
                <div className="project-overview-branch">
                  <span className="branch-icon">⎇</span>
                  <span className="branch-name">{diffContext.head}</span>
                  {diffContext.owner && diffContext.repo && (
                    <span className="branch-repo">{diffContext.owner}/{diffContext.repo}</span>
                  )}
                </div>
              )}
            </div>
            <button
              className="story-mode-btn"
              onClick={() => switchViewMode("story")}
            >
              📚 {t('viewStoryMode')}
            </button>
          </div>
        </div>
      )}

      {/* No intent banner for PRs without documentation */}
      {filteredIntentsV2.length === 0 && (mode === "github-pr" || diffContext?.type === "github-pr") && (
        <div className="no-intent-banner">
          <div className="no-intent-icon">📝</div>
          <div className="no-intent-content">
            <div className="no-intent-title">{t('noIntentTitle')}</div>
            <div className="no-intent-desc">{t('noIntentDesc')}</div>
            <div className="no-intent-hint">{t('noIntentHint')}</div>
          </div>
          <a
            href="https://github.com/anthropics/intent#creating-intents"
            target="_blank"
            rel="noopener noreferrer"
            className="no-intent-link"
          >
            {t('createIntent')} →
          </a>
        </div>
      )}

      <main className="app-main">
        {/* File Tree Sidebar */}
        <div className="files-sidebar">
          <div className="sidebar-title-row">
            <span className="sidebar-title">{t('modifiedFiles')}</span>
            <div className="tree-actions">
              <button
                className={`tree-action-btn intent-toggle ${hideIntentFiles ? 'hidden' : 'visible'}`}
                onClick={() => setHideIntentFiles(!hideIntentFiles)}
                data-tooltip={hideIntentFiles ? t('showIntentFiles') : t('hideIntentFiles')}
              >
                <span className="toggle-icon">{hideIntentFiles ? '📄' : '📝'}</span>
              </button>
              <button
                className="tree-action-btn"
                onClick={() => expandAllFolders(buildFileTree(filteredFiles))}
                data-tooltip={t('expandAll')}
              >
                ▼
              </button>
              <button
                className="tree-action-btn"
                onClick={collapseAllFolders}
                data-tooltip={t('collapseAll')}
              >
                ▶
              </button>
            </div>
          </div>
          <div className="file-tree">
            {(() => {
              const tree = buildFileTree(filteredFiles);
              const countFiles = (nodes: TreeNode[]): number => {
                return nodes.reduce((acc, node) => {
                  if (node.isFile) return acc + 1;
                  return acc + countFiles(node.children);
                }, 0);
              };
              const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
                const isExpanded = expandedFolders.has(node.path);
                const indent = depth * 16;

                if (node.isFile) {
                  return (
                    <div
                      key={node.path}
                      className={`tree-file ${node.isNew ? "added" : "modified"}`}
                      style={{ paddingLeft: `${indent + 20}px` }}
                      onClick={() => {
                        const el = document.getElementById(`file-${node.name}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      <span className={`tree-file-badge ${node.isNew ? "badge-added" : "badge-modified"}`}>
                        {node.isNew ? "+" : "M"}
                      </span>
                      <span className="tree-file-name">{node.name}</span>
                    </div>
                  );
                }

                const fileCount = countFiles(node.children);
                return (
                  <div key={node.path} className="tree-folder">
                    <div
                      className={`tree-folder-header ${isExpanded ? 'expanded' : ''}`}
                      style={{ paddingLeft: `${indent}px` }}
                      onClick={() => toggleFolder(node.path)}
                    >
                      <span className={`tree-chevron ${isExpanded ? 'expanded' : ''}`}>
                        ▶
                      </span>
                      <span className="tree-folder-icon">📁</span>
                      <span className="tree-folder-name">{node.name}</span>
                      <span className="tree-folder-count">{fileCount}</span>
                    </div>
                    {isExpanded && (
                      <div className="tree-folder-children">
                        {node.children.map((child) => renderNode(child, depth + 1))}
                      </div>
                    )}
                  </div>
                );
              };
              return tree.map((node) => renderNode(node, 0));
            })()}
          </div>

          {/* Intents Section */}
          {filteredIntentsV2.length > 0 && (
            <div className="sidebar-intents">
              <div className="sidebar-title">
                Intents ({filteredIntentsV2.length})
                {selectedIntentId && (
                  <button
                    className="clear-selection-btn"
                    onClick={() => setSelectedIntentId(null)}
                    title="Clear selection"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="intents-list">
                {filteredIntentsV2.map((intent) => {
                  const isSelected = selectedIntentId === intent.frontmatter.id;
                  // Get unique resolved files that are in changed files
                  const linkedFiles = [...new Set(
                    intent.resolvedChunks
                      .filter(c => c.resolved && c.resolvedFile)
                      .map(c => c.resolvedFile!)
                      .filter(f => changedFiles.some(cf => cf.includes(f) || f.includes(cf)))
                  )];
                  const totalChunks = intent.resolvedChunks.filter(c => c.resolved).length;
                  // Stale: code exists but has changed (resolved exists, hash mismatch)
                  const staleCount = intent.resolvedChunks.filter(c =>
                    c.resolved !== null && c.hashMatch === false
                  ).length;
                  return (
                    <div
                      key={intent.frontmatter.id}
                      className={`intent-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedIntentId(isSelected ? null : intent.frontmatter.id)}
                    >
                      <div className="intent-item-header">
                        <span className="intent-item-id">#{intent.frontmatter.id}</span>
                        {intent.frontmatter.risk && (
                          <span className={`risk-dot risk-${intent.frontmatter.risk}`} title={intent.frontmatter.risk} />
                        )}
                        {staleCount > 0 && (
                          <span className="stale-dot" title={`${staleCount} ${t('stale').toLowerCase()}`} />
                        )}
                      </div>
                      <div className="intent-item-title">{intent.title}</div>
                      <div className="intent-item-meta">
                        {totalChunks} chunk{totalChunks !== 1 ? 's' : ''}
                        {staleCount > 0 && <span className="meta-stale"> · {staleCount} {t('stale').toLowerCase()}</span>}
                      </div>
                      {linkedFiles.length > 0 && (
                        <div className="intent-item-files">
                          {linkedFiles.map((f, idx) => (
                            <span key={idx} className="intent-file-tag">{f.split('/').pop()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          )}
        </div>

        {/* Files Content */}
        <div className="files-content">
          {/* Selected Intent Header */}
          {selectedIntent && (
            <div className="selected-intent-header">
              <div className="selected-intent-top">
                <div className="selected-intent-badge">
                  <span className="intent-id">#{selectedIntent.frontmatter.id}</span>
                  {selectedIntent.frontmatter.risk && (
                    <span className={`risk-badge risk-${selectedIntent.frontmatter.risk}`}>
                      {selectedIntent.frontmatter.risk}
                    </span>
                  )}
                  {selectedIntent.frontmatter.date && (
                    <span className="intent-date">{selectedIntent.frontmatter.date}</span>
                  )}
                </div>
                <button
                  className="close-intent-btn"
                  onClick={() => setSelectedIntentId(null)}
                >
                  ✕
                </button>
              </div>
              <h2 className="selected-intent-title">{selectedIntent.title}</h2>
              {selectedIntent.summary && (
                <div className="selected-intent-section">
                  <h4>{t('summary')}</h4>
                  <p>{selectedIntent.summary}</p>
                </div>
              )}
              {selectedIntent.motivation && (
                <div className="selected-intent-section">
                  <h4>{t('motivation')}</h4>
                  <p>{selectedIntent.motivation}</p>
                </div>
              )}
              {selectedIntent.frontmatter.tags && selectedIntent.frontmatter.tags.length > 0 && (
                <div className="selected-intent-tags">
                  {selectedIntent.frontmatter.tags.map((tag, i) => (
                    <span key={i} className="tag-pill">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {filteredFiles.map((file, i) => {
            // Find all chunks from filtered intents that match this file
            // All chunks are shown, but chunks from selected intent are highlighted
            const filePath = file.diff.newPath || file.diff.oldPath || file.filename;
            // Check if this is a binary file or has no content
            // Note: In browse mode, hunks are empty but fullFileContent exists - don't treat as empty
            const hasBinaryExtension = filePath.match(/\.(png|jpg|jpeg|gif|ico|svg|webp|bmp|pdf|zip|tar|gz|exe|dll|so|dylib|woff|woff2|ttf|eot|mp3|mp4|mov|avi|mkv)$/i) !== null;
            const hasNoHunks = file.diff.hunks.length === 0;
            const hasFullContent = !!file.fullFileContent;
            const isBinaryFile = hasNoHunks && hasBinaryExtension && !hasFullContent;
            const isEmptyDiff = hasNoHunks && !hasBinaryExtension && !hasFullContent;

            const fileChunks = filteredIntentsV2.flatMap(intent => {
              // For GitHub PRs without resolved anchors, match chunks based on intent's files list
              const intentFiles = intent.frontmatter.files || [];

              // Strict match: only show chunks if this file is explicitly listed in the intent
              const fileExplicitlyListed = intentFiles.some(f => {
                const normalizedIntentFile = f.replace(/^\.\//, '');
                const normalizedFilePath = filePath.replace(/^\.\//, '');
                return normalizedFilePath === normalizedIntentFile ||
                       normalizedFilePath.endsWith('/' + normalizedIntentFile) ||
                       normalizedIntentFile.endsWith('/' + file.filename);
              });

              if (!fileExplicitlyListed) return [];

              return intent.resolvedChunks.filter(chunk => {
                // Only show chunks that are resolved (have actual code location)
                if (!chunk.resolved) return false;

                // If chunk has resolvedFile, use it for matching
                if (chunk.resolvedFile) {
                  return filePath.includes(chunk.resolvedFile) || chunk.resolvedFile.includes(file.filename);
                }
                // For resolved chunks without resolvedFile, show if file matches
                return true;
              }).map(chunk => ({
                ...chunk,
                intentId: intent.frontmatter.id,
                intentTitle: intent.title,
                isNew: intent.isNew ?? false,
                isHighlighted: selectedIntentId ? intent.frontmatter.id === selectedIntentId : true,
              }));
            });

            // Skip files with empty paths
            if (!filePath || filePath.trim() === '') return null;

            // For binary files or empty diffs, show a simple header without diff content
            if (isBinaryFile || isEmptyDiff) {
              const displayName = filePath.split('/').pop() || filePath;
              const isNewFile = file.diff.oldPath === "/dev/null" || !file.diff.oldPath;
              const isDeleted = file.diff.newPath === "/dev/null";

              let statusText = '';
              let statusClass = '';
              if (isBinaryFile) {
                if (isNewFile) {
                  statusText = lang === 'fr' ? 'Fichier binaire ajouté' : 'Binary file added';
                  statusClass = 'added';
                } else if (isDeleted) {
                  statusText = lang === 'fr' ? 'Fichier binaire supprimé' : 'Binary file deleted';
                  statusClass = 'deleted';
                } else {
                  statusText = lang === 'fr' ? 'Fichier binaire modifié' : 'Binary file modified';
                  statusClass = 'modified';
                }
              } else {
                if (isNewFile) {
                  statusText = lang === 'fr' ? 'Fichier ajouté' : 'File added';
                  statusClass = 'added';
                } else if (isDeleted) {
                  statusText = lang === 'fr' ? 'Fichier supprimé' : 'File deleted';
                  statusClass = 'deleted';
                } else {
                  statusText = lang === 'fr' ? 'Fichier modifié' : 'File modified';
                  statusClass = 'modified';
                }
              }

              return (
                <div key={i} id={`file-${displayName}`} className="diff-viewer binary-file">
                  <div className="diff-header">
                    <span className="diff-filename">{displayName || filePath}</span>
                    <span className={`binary-badge ${statusClass}`}>{statusText}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} id={`file-${file.filename}`}>
                <DiffViewer
                  file={file.diff}
                  filename={file.filename}
                  onLinkClick={handleLinkClick}
                  fullFileContent={file.fullFileContent}
                  resolvedChunks={fileChunks}
                  viewMode={viewMode === "story" ? "browse" : viewMode}
                  expandChunkAnchor={expandChunkAnchor && fileChunks.some(c => c.anchor === expandChunkAnchor) ? expandChunkAnchor : undefined}
                  translations={{
                    new: t('new'), existing: t('existing'), context: t('context'), notInDiff: t('notInDiff'), modified: t('modified'),
                    deepDive: t('deepDive'), toastCopied: t('toastCopied'), toastError: t('toastError'),
                    promptTitle: t('promptTitle'), promptDisclaimer: t('promptDisclaimer'), promptContext: t('promptContext'),
                    promptFile: t('promptFile'), promptIntent: t('promptIntent'), promptChunkToExplore: t('promptChunkToExplore'),
                    promptAnchor: t('promptAnchor'), promptTitleLabel: t('promptTitleLabel'), promptDescription: t('promptDescription'),
                    promptDecisions: t('promptDecisions'), promptSourceCode: t('promptSourceCode'), promptLines: t('promptLines'),
                    promptCodeNotAvailable: t('promptCodeNotAvailable'), promptQuestion: t('promptQuestion'),
                    promptQuestionPlaceholder: t('promptQuestionPlaceholder'), deepDiveTooltip: t('deepDiveTooltip')
                  }}
                />
              </div>
            );
          })}
        </div>
      </main>
        </>
      )}
    </div>
  );
}

export default App;
