/**
 * File utilities - centralized functions for file path handling,
 * classification, and chunk extraction
 */

import type { DiffFile } from './parseDiff';
import type { IntentV2API, ResolvedChunkAPI } from './api';
import type { FileData } from '../types';

// ============================================================================
// PATH EXTRACTION
// ============================================================================

/**
 * Extract filename from a path
 * @example getFileName('src/lib/utils.ts') => 'utils.ts'
 */
export function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

/**
 * Extract file extension (lowercase)
 * @example getFileExtension('utils.ts') => 'ts'
 */
export function getFileExtension(path: string): string {
  const filename = getFileName(path);
  return filename.split('.').pop()?.toLowerCase() || '';
}

/**
 * Extract directory from a path
 * @example getDirectory('src/lib/utils.ts') => 'src/lib'
 */
export function getDirectory(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

/**
 * Get the file path from a FileData or DiffFile
 */
export function getFilePath(file: FileData | DiffFile | { diff?: DiffFile; filename?: string }): string {
  if ('diff' in file && file.diff) {
    return file.diff.newPath || file.diff.oldPath || (file as FileData).filename || '';
  }
  if ('newPath' in file) {
    return file.newPath || file.oldPath || '';
  }
  return '';
}

// ============================================================================
// PATH NORMALIZATION & MATCHING
// ============================================================================

/**
 * Normalize a path by removing leading ./
 * @example normalizePath('./src/utils.ts') => 'src/utils.ts'
 */
export function normalizePath(path: string): string {
  return path.replace(/^\.\//, '');
}

/**
 * Check if two paths match (flexible matching)
 * Handles cases where one path is a suffix of the other
 * @example pathsMatch('src/utils.ts', 'utils.ts') => true
 */
export function pathsMatch(pathA: string, pathB: string): boolean {
  const a = normalizePath(pathA);
  const b = normalizePath(pathB);
  return a === b || a.endsWith('/' + b) || b.endsWith('/' + a);
}

/**
 * Check if a path is in the .intent/ directory
 */
export function isIntentFile(path: string): boolean {
  return path.startsWith('.intent/') || path.includes('/.intent/');
}

// ============================================================================
// FILE TYPE DETECTION
// ============================================================================

/** Binary file extensions */
const BINARY_EXTENSIONS = /\.(png|jpg|jpeg|gif|ico|svg|webp|bmp|pdf|zip|tar|gz|exe|dll|so|dylib|woff|woff2|ttf|eot|mp3|mp4|mov|avi|mkv)$/i;

/**
 * Check if a file has a binary extension
 */
export function hasBinaryExtension(path: string): boolean {
  return BINARY_EXTENSIONS.test(path);
}

/**
 * Classify a file based on its diff data
 */
export interface FileClassification {
  isBinary: boolean;
  isEmpty: boolean;
  isNormal: boolean;
}

export function classifyFile(file: FileData): FileClassification {
  const filePath = getFilePath(file);
  const hasNoHunks = !file.diff?.hunks || file.diff.hunks.length === 0;
  const hasFullContent = !!file.fullFileContent;
  const isBinaryExt = hasBinaryExtension(filePath);

  const isBinary = hasNoHunks && isBinaryExt && !hasFullContent;
  const isEmpty = hasNoHunks && !isBinaryExt && !hasFullContent;
  const isNormal = !isBinary && !isEmpty;

  return { isBinary, isEmpty, isNormal };
}

/** Language map for syntax highlighting */
const LANGUAGE_MAP: Record<string, string> = {
  'py': 'python',
  'ts': 'typescript',
  'tsx': 'tsx',
  'js': 'javascript',
  'jsx': 'jsx',
  'css': 'css',
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'sh': 'bash',
  'bash': 'bash',
  'md': 'markdown',
  'html': 'html',
  'xml': 'xml',
  'sql': 'sql',
  'go': 'go',
  'rs': 'rust',
  'rb': 'ruby',
  'java': 'java',
  'kt': 'kotlin',
  'swift': 'swift',
  'c': 'c',
  'cpp': 'cpp',
  'h': 'c',
  'hpp': 'cpp',
};

/**
 * Detect programming language from filename for syntax highlighting
 */
export function detectLanguage(filename: string): string {
  const ext = getFileExtension(filename);
  return LANGUAGE_MAP[ext] || 'javascript';
}

// ============================================================================
// FILE STATUS (added, deleted, modified)
// ============================================================================

export type FileStatus = 'added' | 'deleted' | 'modified';

/**
 * Check if a file is newly added
 */
export function isNewFile(file: DiffFile | FileData): boolean {
  const diff = 'diff' in file ? file.diff : file;
  return diff.oldPath === '/dev/null' || !diff.oldPath;
}

/**
 * Check if a file is deleted
 */
export function isDeletedFile(file: DiffFile | FileData): boolean {
  const diff = 'diff' in file ? file.diff : file;
  return diff.newPath === '/dev/null';
}

/**
 * Get the status of a file (added, deleted, or modified)
 */
export function getFileStatus(file: DiffFile | FileData): FileStatus {
  if (isNewFile(file)) return 'added';
  if (isDeletedFile(file)) return 'deleted';
  return 'modified';
}

/**
 * Get localized status text for a file
 */
export function getFileStatusText(
  file: FileData,
  lang: string
): { text: string; className: FileStatus } {
  const { isBinary } = classifyFile(file);
  const status = getFileStatus(file);

  const labels: Record<string, Record<FileStatus, Record<string, string>>> = {
    binary: {
      added: { en: 'Binary file added', fr: 'Fichier binaire ajouté' },
      deleted: { en: 'Binary file deleted', fr: 'Fichier binaire supprimé' },
      modified: { en: 'Binary file modified', fr: 'Fichier binaire modifié' },
    },
    text: {
      added: { en: 'File added', fr: 'Fichier ajouté' },
      deleted: { en: 'File deleted', fr: 'Fichier supprimé' },
      modified: { en: 'File modified', fr: 'Fichier modifié' },
    },
  };

  const type = isBinary ? 'binary' : 'text';
  const text = labels[type][status][lang] || labels[type][status]['en'];

  return { text, className: status };
}

// ============================================================================
// CHUNK EXTRACTION
// ============================================================================

export interface EnrichedChunk extends ResolvedChunkAPI {
  intentId: string;
  intentTitle: string;
  isNew: boolean;
  isHighlighted: boolean;
}

/**
 * Get all chunks for a specific file from all intents
 */
export function getChunksForFile(
  file: FileData,
  intents: IntentV2API[],
  selectedIntentId?: string | null
): EnrichedChunk[] {
  const filePath = getFilePath(file);
  const filename = file.filename;

  return intents.flatMap(intent => {
    const intentFiles = intent.frontmatter.files || [];

    // Check if file is explicitly listed in this intent
    const fileExplicitlyListed = intentFiles.some(f => {
      const normalizedIntentFile = normalizePath(f);
      const normalizedFilePath = normalizePath(filePath);
      return (
        normalizedFilePath === normalizedIntentFile ||
        normalizedFilePath.endsWith('/' + normalizedIntentFile) ||
        normalizedIntentFile.endsWith('/' + filename)
      );
    });

    if (!fileExplicitlyListed) return [];

    // Filter chunks that belong to this file
    return intent.resolvedChunks
      .filter(chunk => {
        if (!chunk.resolved) return false;
        if (chunk.resolvedFile) {
          return filePath.includes(chunk.resolvedFile) || chunk.resolvedFile.includes(filename);
        }
        return true;
      })
      .map(chunk => ({
        ...chunk,
        intentId: intent.frontmatter.id,
        intentTitle: intent.title,
        isNew: intent.isNew ?? false,
        isHighlighted: selectedIntentId ? intent.frontmatter.id === selectedIntentId : true,
      }));
  });
}

/**
 * Find a file in a list by path (using flexible matching)
 */
export function findFileByPath(files: FileData[], filePath: string): FileData | undefined {
  return files.find(f => {
    const fp = getFilePath(f);
    return pathsMatch(fp, filePath);
  });
}
