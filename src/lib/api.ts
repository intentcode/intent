// In production (Vercel), use relative paths. In dev, use localhost:3001
const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "";

// Custom error for API responses that need authentication
export class AuthRequiredError extends Error {
  needsAuth: boolean;

  constructor(message: string, needsAuth: boolean = true) {
    super(message);
    this.name = "AuthRequiredError";
    this.needsAuth = needsAuth;
  }
}

export type DiffMode = "branches";

// V2 Intent types (matching server response)
export interface AnchorResultAPI {
  found: boolean;
  startLine: number;
  endLine: number;
  content: string;
  hash: string;
}

export interface ResolvedChunkAPI {
  anchor: string;
  title: string;
  description: string;
  decisions: string[];
  links: Array<{ target: string; reason: string }>;
  storedHash?: string;
  resolved: AnchorResultAPI | null;
  resolvedFile: string | null; // Which file this chunk was resolved in
  hashMatch: boolean | null;
  overlaps?: string[]; // anchors of chunks that overlap with this one
}

export interface IntentFrontmatterAPI {
  id: string;
  from: string;
  author?: string;
  date?: string;
  status: "active" | "superseded" | "archived";
  superseded_by?: string;
  risk?: "low" | "medium" | "high";
  tags?: string[];
  files: string[];
}

export interface IntentV2API {
  frontmatter: IntentFrontmatterAPI;
  title: string;
  summary: string;
  motivation?: string;
  isNew: boolean; // true if intent file was added/modified in this PR
  intentFilePath: string; // path to the intent file
  chunks: Array<{
    anchor: string;
    title: string;
    storedHash?: string;
    description: string;
    decisions: string[];
    links: Array<{ target: string; reason: string }>;
  }>;
  resolvedChunks: ResolvedChunkAPI[];
  raw: string;
}

export interface ManifestAPI {
  version: number;
  default_lang: string;
  intents: Array<{
    id: string;
    file: string;
    status: "active" | "superseded" | "archived";
    superseded_by?: string;
  }>;
}

export interface DiffResponse {
  diff: string;
  changedFiles: string[];
  intents: Record<string, string>;
  intentsV2?: IntentV2API[];
  manifest: ManifestAPI | null;
  fileContents?: Record<string, string>; // Full file content for expand context
}

export interface BranchesResponse {
  currentBranch: string;
  branches: string[];
}

// Smart branch discovery types
export interface BranchInfo {
  name: string;
  lastCommit: string;
  lastCommitMessage: string;
  hasIntents: boolean;
  intentCount: number;
  aheadBehind: { ahead: number; behind: number } | null;
  isDefault: boolean;
  isCurrent: boolean;
}

export interface BranchSuggestion {
  base: string;
  head: string;
  label: string;
  hasIntents: boolean;
  intentCount: number;
}

export interface DiscoverBranchesResponse {
  currentBranch: string;
  defaultBranch: string;
  hasLocalIntents: boolean;
  branches: BranchInfo[];
  suggestions: BranchSuggestion[];
}

export interface Commit {
  hash: string;
  message: string;
}

export interface CommitsResponse {
  commits: Commit[];
}

export async function fetchDiff(
  repoPath: string,
  mode: DiffMode = "branches",
  base?: string,
  head?: string,
  lang?: string
): Promise<DiffResponse> {
  const res = await fetch(`${API_BASE}/api/diff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoPath, mode, base, head, lang }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to fetch diff");
  }

  return res.json();
}

export interface RepoInfo {
  description: string | null;
  stars: number;
  language: string | null;
  topics: string[];
}

export interface BrowseResponse {
  intentsV2: IntentV2API[];
  files: string[];
  fileContents: Record<string, string>;
  branch: string;
  repoInfo?: RepoInfo;
}

export async function fetchBrowse(
  repoPath: string,
  branch: string,
  lang?: string
): Promise<BrowseResponse> {
  const res = await fetch(`${API_BASE}/api/browse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoPath, branch, lang }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to browse branch");
  }

  return res.json();
}

export async function fetchBranches(repoPath: string): Promise<BranchesResponse> {
  const res = await fetch(`${API_BASE}/api/branches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoPath }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to fetch branches");
  }

  return res.json();
}

export async function discoverBranches(repoPath: string): Promise<DiscoverBranchesResponse> {
  const res = await fetch(`${API_BASE}/api/discover-branches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoPath }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to discover branches");
  }

  return res.json();
}

export async function fetchCommits(
  repoPath: string,
  limit = 20
): Promise<CommitsResponse> {
  const res = await fetch(`${API_BASE}/api/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoPath, limit }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to fetch commits");
  }

  return res.json();
}

// Directory browser
export interface DirectoryEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
}

export interface ListDirsResponse {
  currentPath: string;
  parentPath: string;
  isGitRepo: boolean;
  directories: DirectoryEntry[];
}

export async function listDirs(dirPath?: string): Promise<ListDirsResponse> {
  const res = await fetch(`${API_BASE}/api/list-dirs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dirPath }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to list directories");
  }

  return res.json();
}

// GitHub PR
export interface PRInfo {
  title: string;
  number: number;
  author: string;
  base: string;
  head: string;
  url: string;
}

export interface GitHubPRResponse extends DiffResponse {
  prInfo: PRInfo;
}

export async function fetchGitHubPR(
  owner: string,
  repo: string,
  prNumber: number,
  lang?: string
): Promise<GitHubPRResponse> {
  const res = await fetch(`${API_BASE}/api/github-pr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo, prNumber, lang }),
  });

  if (!res.ok) {
    const errorData = await res.json();
    if (errorData.needsAuth) {
      throw new AuthRequiredError(
        errorData.error || "This repository may be private. Please login with GitHub to access it.",
        true
      );
    }
    throw new Error(errorData.error || "Failed to fetch GitHub PR");
  }

  return res.json();
}

// Parse GitHub PR URL
export function parseGitHubURL(url: string): { owner: string; repo: string; prNumber: number } | null {
  // Match: https://github.com/owner/repo/pull/123
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (match) {
    return {
      owner: match[1],
      repo: match[2],
      prNumber: parseInt(match[3], 10),
    };
  }
  return null;
}

// Parse GitHub repo URL (without PR number)
export function parseGitHubRepoURL(url: string): { owner: string; repo: string } | null {
  // Match: https://github.com/owner/repo or https://github.com/owner/repo/...
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (match) {
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, ""), // Remove .git suffix if present
    };
  }
  return null;
}

// Discover branches from GitHub repository
export async function discoverGitHubBranches(owner: string, repo: string): Promise<DiscoverBranchesResponse> {
  const res = await fetch(`${API_BASE}/api/github-discover-branches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to discover GitHub branches");
  }

  return res.json();
}

// Browse a GitHub repository branch (view files with intents)
export async function fetchGitHubBrowse(
  owner: string,
  repo: string,
  branch: string,
  lang?: string
): Promise<BrowseResponse> {
  const res = await fetch(`${API_BASE}/api/github-browse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo, branch, lang }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to browse GitHub repository");
  }

  return res.json();
}

// Fetch diff between two GitHub branches
export async function fetchGitHubBranchesDiff(
  owner: string,
  repo: string,
  base: string,
  head: string,
  lang?: string
): Promise<DiffResponse & { branchInfo?: { base: string; head: string; aheadBy: number; behindBy: number; totalCommits: number } }> {
  const res = await fetch(`${API_BASE}/api/github-branches-diff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo, base, head, lang }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to fetch GitHub branches diff");
  }

  return res.json();
}
