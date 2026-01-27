/**
 * Shared TypeScript interfaces and types
 */

// Re-export API types
export type {
  IntentV2API,
  RepoInfo,
  OpenPR,
  DiffMode,
  AppConfig,
} from '../lib/api';

// Re-export auth types
export type { User } from '../lib/auth';

// Re-export language types
export type { Language } from '../lib/language';

// Re-export diff parsing types
export type { DiffFile, DiffHunk, DiffLine } from '../lib/parseDiff';

// Diff context - shared between components
export interface DiffContext {
  type: "branches" | "browse" | "github-pr" | "github-branches" | "github-browse";
  base?: string;
  head?: string;
  repoPath?: string;
  owner?: string;
  repo?: string;
  prNumber?: number;
}

// File data from diff parsing (uses DiffFile from parseDiff)
import type { DiffFile } from '../lib/parseDiff';

export interface FileData {
  diff: DiffFile;
  filename: string;
  fullFileContent?: string;
}

// Tree node for file tree
export interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  isNew?: boolean;
  children: TreeNode[];
}

// Scroll marker for scroll indicator
export interface ScrollMarker {
  id: string;
  anchor: string;
  top: number;
  height: number;
  isHighlighted: boolean;
  filename: string;
}

// View modes
export type ViewMode = "diff" | "browse" | "story";
export type AppMode = "home" | "github-pr" | "github-compare" | "github-browse";

// Translation function type
export type TranslateFunction = (key: string) => string;

// Localized string (for multi-language support)
export type LocalizedString = Record<string, string>;

// Provider-specific install error (e.g., GitHub App not installed)
export interface ProviderInstallError {
  title: LocalizedString;
  message: string;
  hint?: LocalizedString;
  actionUrl: string;
  actionLabel: LocalizedString;
  icon?: 'github' | 'gitlab' | 'default';
}

// Provider-agnostic auth info
export interface AuthInfo {
  needsAuth: boolean;
  providerName: string;
  providerIcon?: 'github' | 'gitlab' | 'default';
  loginAction: () => void;
  loginLabel: LocalizedString;
  loginDesc?: LocalizedString;
  installError?: ProviderInstallError | null;
}
