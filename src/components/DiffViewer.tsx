import { useState, useMemo, useRef, useCallback, useEffect, memo } from "react";
import type { DiffFile, DiffHunk } from "../lib/parseDiff";
import type { ResolvedChunkAPI } from "../lib/api";
import { detectLanguage } from "../lib/fileUtils";
import { CodePanel, ChunksPanel } from "./diffViewerComponents";
import type { CodePanelHandle } from "./diffViewerComponents";
import Prism from "prismjs";

import "prismjs/components/prism-python";
import "./DiffViewer.css";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-markdown";

// Cache for syntax-highlighted lines (avoids re-highlighting on every render)
const highlightCache = new Map<string, string>();
const MAX_CACHE_SIZE = 10000; // Limit cache size to prevent memory issues

// Highlight a single line of code with caching
function highlightLine(line: string, language: string): string {
  const cacheKey = `${language}:${line}`;

  const cached = highlightCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result: string;
  try {
    const grammar = Prism.languages[language];
    if (grammar) {
      result = Prism.highlight(line, grammar, language);
    } else {
      result = line.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  } catch {
    // Fallback to plain text
    result = line.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Add to cache, clear if too large
  if (highlightCache.size >= MAX_CACHE_SIZE) {
    highlightCache.clear();
  }
  highlightCache.set(cacheKey, result);

  return result;
}

interface Translations {
  new: string;
  existing: string;
  context: string;
  notInDiff: string;
  modified: string;
  deepDive: string;
  toastCopied: string;
  toastError: string;
  promptTitle: string;
  promptDisclaimer: string;
  promptContext: string;
  promptFile: string;
  promptIntent: string;
  promptChunkToExplore: string;
  promptAnchor: string;
  promptTitleLabel: string;
  promptDescription: string;
  promptDecisions: string;
  promptSourceCode: string;
  promptLines: string;
  promptCodeNotAvailable: string;
  promptQuestion: string;
  promptQuestionPlaceholder: string;
  deepDiveTooltip: string;
}

type ViewMode = "diff" | "browse";

interface DiffFileViewerProps {
  file?: DiffFile;
  filename: string;
  onLinkClick?: (targetFile: string, targetRange: string) => void;
  // For intents-only mode (no git diff)
  resolvedChunks?: ResolvedChunkAPI[];
  intentTitle?: string;
  // Full file content for expand context feature
  fullFileContent?: string;
  // View mode: "diff" shows diff, "browse" shows full file
  viewMode?: ViewMode;
  // UI translations
  translations?: Translations;
  // Anchor of chunk to expand (controlled from parent)
  expandChunkAnchor?: string;
  // Selected intent ID for highlighting (passed separately for memo stability)
  selectedIntentId?: string | null;
}

const LINE_HEIGHT = 24; // pixels per line
const COLLAPSED_CARD_HEIGHT = 40; // approximate height of collapsed chunk card
const MIN_GAP_BETWEEN_CARDS = 8; // minimum gap between cards

interface LineMaps {
  newLineMap: Map<number, number>;  // newLineNumber -> rowIndex
  oldLineMap: Map<number, number>;  // oldLineNumber -> rowIndex (for deletions)
}

// Build maps of line numbers -> row index in the rendered diff
function buildLineMaps(hunks: DiffHunk[]): LineMaps {
  const newLineMap = new Map<number, number>();
  const oldLineMap = new Map<number, number>();
  let rowIndex = 0;

  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.newLineNumber) {
        newLineMap.set(line.newLineNumber, rowIndex);
      }
      if (line.oldLineNumber) {
        oldLineMap.set(line.oldLineNumber, rowIndex);
      }
      rowIndex++;
    }
  }

  return { newLineMap, oldLineMap };
}

const DEFAULT_TRANSLATIONS: Translations = {
  new: "New",
  existing: "Existing",
  context: "CONTEXT",
  notInDiff: "not in diff",
  modified: "Modified",
  deepDive: "Ask Claude",
  toastCopied: "Context copied! Paste it into Claude Code or claude.ai to explore this chunk.",
  toastError: "Error copying to clipboard",
  promptTitle: "Exploratory Parenthesis",
  promptDisclaimer: "This is a parenthesis to better understand a piece of code. This is NOT a new task.\nAfter this exploration, we'll resume where we left off.",
  promptContext: "Context",
  promptFile: "File",
  promptIntent: "Intent",
  promptChunkToExplore: "Chunk to explore",
  promptAnchor: "Anchor",
  promptTitleLabel: "Title",
  promptDescription: "Description",
  promptDecisions: "Decisions",
  promptSourceCode: "Source code",
  promptLines: "lines",
  promptCodeNotAvailable: "Code not available",
  promptQuestion: "My question",
  promptQuestionPlaceholder: "[Explain why this code is structured this way / What alternatives could have been used / I don't understand part X]",
  deepDiveTooltip: "Copy context to explore this chunk with Claude",
};

function DiffFileViewerInner({ file, filename, onLinkClick, resolvedChunks, intentTitle, fullFileContent, viewMode = "diff", translations = DEFAULT_TRANSLATIONS, expandChunkAnchor, selectedIntentId }: DiffFileViewerProps) {
  const [activeChunk, setActiveChunk] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const codePanelRef = useRef<CodePanelHandle>(null);

  // Local state for expanded chunks (isolated per file)
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  // Local chunk expansion functions
  const toggleChunk = useCallback((chunkId: string) => {
    setExpandedChunks(prev => {
      const next = new Set(prev);
      if (next.has(chunkId)) {
        next.delete(chunkId);
      } else {
        next.add(chunkId);
      }
      return next;
    });
  }, []);

  const expandChunk = useCallback((chunkId: string) => {
    setExpandedChunks(prev => {
      if (prev.has(chunkId)) return prev;
      const next = new Set(prev);
      next.add(chunkId);
      return next;
    });
  }, []);

  const isExpanded = useCallback((chunkId: string) => {
    return expandedChunks.has(chunkId);
  }, [expandedChunks]);

  // Expand chunk when controlled from parent (e.g., from story mode click)
  useEffect(() => {
    if (expandChunkAnchor) {
      expandChunk(expandChunkAnchor);
    }
  }, [expandChunkAnchor, expandChunk]);

  // Generate deep dive prompt and copy to clipboard
  const handleDeepDive = useCallback(async (chunk: ResolvedChunkAPI) => {
    const t = translations;

    // Extract code snippet from file content
    let codeSnippet = "";
    if (fullFileContent && chunk.resolved) {
      const lines = fullFileContent.split('\n');
      const start = Math.max(0, chunk.resolved.startLine - 1);
      const end = Math.min(lines.length, chunk.resolved.endLine);
      codeSnippet = lines.slice(start, end).join('\n');
    }

    const prompt = `## ${t.promptTitle}

> ${t.promptDisclaimer.split('\n').join('\n> ')}

---

## ${t.promptContext}
**${t.promptFile}:** ${filename}
**${t.promptIntent}:** ${intentTitle || 'N/A'}

## ${t.promptChunkToExplore}
**${t.promptAnchor}:** ${chunk.anchor}
**${t.promptTitleLabel}:** ${chunk.title}
**${t.promptDescription}:** ${chunk.description || 'N/A'}

${chunk.decisions.length > 0 ? `**${t.promptDecisions}:**\n${chunk.decisions.map(d => `> ${d}`).join('\n')}` : ''}

## ${t.promptSourceCode} (${t.promptLines} ${chunk.resolved?.startLine || '?'}-${chunk.resolved?.endLine || '?'})
\`\`\`${detectLanguage(filename)}
${codeSnippet || chunk.resolved?.content || t.promptCodeNotAvailable}
\`\`\`

---

## ${t.promptQuestion}
${t.promptQuestionPlaceholder}
`;

    // Try clipboard API with fallback
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(prompt);
      } else {
        // Fallback: create a textarea and copy
        const textarea = document.createElement('textarea');
        textarea.value = prompt;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setToast(t.toastCopied);
    } catch {
      setToast(t.toastError);
    }

    setTimeout(() => setToast(null), 5000);
  }, [translations, fullFileContent, filename, intentTitle]);

  // Determine display mode
  const isBrowseMode = viewMode === "browse" && !!fullFileContent;
  const isDiffMode = !isBrowseMode && !!file && file.hunks.length > 0;
  const isIntentsOnly = !isDiffMode && !isBrowseMode && !!resolvedChunks && resolvedChunks.length > 0;

  // Detect language for syntax highlighting
  const language = useMemo(() => detectLanguage(filename), [filename]);

  // Pre-compute highlighted lines for browse mode (avoids re-highlighting on every render)
  const highlightedBrowseLines = useMemo(() => {
    if (!fullFileContent) return [];
    return fullFileContent.split('\n').map(line => highlightLine(line, language));
  }, [fullFileContent, language]);

  // Pre-compute highlighted lines for diff mode hunks
  const highlightedDiffLines = useMemo(() => {
    if (!file) return new Map<string, string>();
    const cache = new Map<string, string>();
    file.hunks.forEach((hunk, hunkIdx) => {
      hunk.lines.forEach((line, lineIdx) => {
        const key = `${hunkIdx}-${lineIdx}`;
        cache.set(key, highlightLine(line.content, language));
      });
    });
    return cache;
  }, [file, language]);

  const hasV2Chunks = resolvedChunks && resolvedChunks.length > 0;

  // Build line maps - for browse mode, simple 1:1 mapping; for diff mode, from hunks
  const lineMaps = useMemo(() => {
    if (isBrowseMode && fullFileContent) {
      // In browse mode, build simple line maps from full file
      const newLineMap = new Map<number, number>();
      const lines = fullFileContent.split('\n');
      lines.forEach((_, idx) => {
        newLineMap.set(idx + 1, idx); // lineNumber -> rowIndex
      });
      return { newLineMap, oldLineMap: new Map<number, number>() };
    }
    if (file) {
      return buildLineMaps(file.hunks);
    }
    return { newLineMap: new Map(), oldLineMap: new Map() };
  }, [file, isBrowseMode, fullFileContent]);

  // Calculate absolute top positions for chunk cards (calculated once, never changes)
  const chunkTops = useMemo(() => {
    const tops: number[] = [];

    if (!hasV2Chunks || !resolvedChunks) return tops;

    // Track last used position for stacking unresolved chunks
    let stackPosition = 0;

    resolvedChunks.forEach((chunk) => {
      if (!chunk.resolved) {
        // Unresolved chunks stack at the end
        tops.push(stackPosition);
        stackPosition += COLLAPSED_CARD_HEIGHT + MIN_GAP_BETWEEN_CARDS;
        return;
      }

      if (isDiffMode || isBrowseMode) {
        const rowIndex = lineMaps.newLineMap.get(chunk.resolved.startLine);
        if (rowIndex !== undefined) {
          const top = rowIndex * LINE_HEIGHT;
          tops.push(top);
          // Update stack position if this chunk is lower
          stackPosition = Math.max(stackPosition, top + COLLAPSED_CARD_HEIGHT + MIN_GAP_BETWEEN_CARDS);
        } else {
          // Chunk not visible in diff, stack it
          tops.push(stackPosition);
          stackPosition += COLLAPSED_CARD_HEIGHT + MIN_GAP_BETWEEN_CARDS;
        }
      } else {
        // Fallback: stack chunks
        tops.push(stackPosition);
        stackPosition += COLLAPSED_CARD_HEIGHT + MIN_GAP_BETWEEN_CARDS;
      }
    });

    return tops;
  }, [isDiffMode, isBrowseMode, hasV2Chunks, resolvedChunks, lineMaps]);

  // Calculate dynamic container height: base height + extra for expanded chunks
  const EXPANDED_CHUNK_EXTRA_HEIGHT = 250; // estimated extra height when a chunk is expanded
  const baseContainerHeight = useMemo(() => {
    if (isBrowseMode && fullFileContent) {
      return fullFileContent.split('\n').length * LINE_HEIGHT;
    }
    if (file) {
      let totalLines = 0;
      file.hunks.forEach(hunk => { totalLines += hunk.lines.length; });
      return totalLines * LINE_HEIGHT;
    }
    // For intents-only mode, use chunk positions
    if (chunkTops.length > 0) {
      return Math.max(...chunkTops) + 200;
    }
    return 400;
  }, [isBrowseMode, fullFileContent, file, chunkTops]);

  // Count expanded chunks and calculate total container height
  const expandedChunksCount = useMemo(() => {
    if (!resolvedChunks) return 0;
    return resolvedChunks.filter(c => isExpanded(c.anchor)).length;
  }, [resolvedChunks, isExpanded]);

  const chunkPanelHeight = baseContainerHeight + (expandedChunksCount * EXPANDED_CHUNK_EXTRA_HEIGHT);

  // Handle chunk activation (click or hover)
  const handleChunkActivate = useCallback((chunkId: string, startLine: number, endLine: number) => {
    setActiveChunk(chunkId);

    // Get the code panel element for this file
    const panel = codePanelRef.current?.getElement();
    if (!panel) return;

    // Clear previous highlights in this file's panel
    panel.querySelectorAll('.line-highlighted').forEach(el => {
      el.classList.remove('line-highlighted');
    });

    // Add new highlights in this file's panel
    for (let i = startLine; i <= endLine; i++) {
      const lineEl = panel.querySelector(`[data-line="${i}"]`);
      lineEl?.classList.add('line-highlighted');
    }

    // Scroll to the target lines in code panel
    codePanelRef.current?.scrollToLine(startLine);
  }, []);

  const handleChunkDeactivate = useCallback(() => {
    setActiveChunk(null);
    // Clear highlights in this file's panel
    const panel = codePanelRef.current?.getElement();
    panel?.querySelectorAll('.line-highlighted').forEach(el => {
      el.classList.remove('line-highlighted');
    });
  }, []);

  const handleLinkClick = useCallback((targetAnchor: string) => {
    // Find the target chunk by anchor
    const targetChunk = resolvedChunks?.find(c => c.anchor === targetAnchor);
    if (targetChunk?.resolved) {
      const panel = codePanelRef.current?.getElement();

      // Clear previous highlights in this file's panel
      panel?.querySelectorAll('.line-highlighted').forEach(el => {
        el.classList.remove('line-highlighted');
      });

      // Highlight the target lines in this file's panel
      if (panel) {
        for (let i = targetChunk.resolved.startLine; i <= targetChunk.resolved.endLine; i++) {
          const lineEl = panel.querySelector(`[data-line="${i}"]`);
          lineEl?.classList.add('line-highlighted');
        }
      }
      setActiveChunk(targetAnchor);

      // Expand the target chunk
      expandChunk(targetAnchor);

      // Scroll to the code lines
      codePanelRef.current?.scrollToLine(targetChunk.resolved.startLine);

      // Scroll to the chunk card
      setTimeout(() => {
        const chunkEl = document.getElementById(`chunk-${filename}-${targetAnchor}`);
        if (chunkEl) {
          chunkEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      // Clear highlight after a few seconds
      setTimeout(() => {
        const panelEl = codePanelRef.current?.getElement();
        panelEl?.querySelectorAll('.line-highlighted').forEach(el => {
          el.classList.remove('line-highlighted');
        });
      }, 3000);
    } else if (onLinkClick) {
      // External link - use the callback
      onLinkClick(targetAnchor, '');
    }
  }, [resolvedChunks, expandChunk, filename, onLinkClick]);

  // Memoized link click handler for ChunkCard
  const handleChunkLinkClick = useCallback((targetFile: string, targetAnchor: string) => {
    if (targetFile === filename) {
      handleLinkClick(targetAnchor);
    } else if (onLinkClick) {
      onLinkClick(targetFile, targetAnchor);
    }
  }, [filename, handleLinkClick, onLinkClick]);

  // Memoized translations for ChunkCard to prevent re-renders
  const chunkCardTranslations = useMemo(() => ({
    new: translations.new,
    existing: translations.existing,
    deepDive: translations.deepDive,
    deepDiveTooltip: translations.deepDiveTooltip,
  }), [translations.new, translations.existing, translations.deepDive, translations.deepDiveTooltip]);

  const hasStaleChunks = resolvedChunks?.some(c => c.hashMatch === false);

  // No need for panelMinHeight anymore - CSS flow handles height automatically

  return (
    <div className={`diff-viewer ${hasStaleChunks ? 'has-stale' : ''}`}>
      {/* File Header */}
      <div className="diff-file-header">
        <span className="file-path">{file?.newPath || file?.oldPath || filename}</span>
        {intentTitle && <span className="intent-title-badge">{intentTitle}</span>}
        {hasStaleChunks && <span className="stale-indicator">{translations.modified}</span>}
      </div>

      <div className="diff-container">
        {/* Left: Code Panel - Memoized, won't re-render on chunk expand */}
        <CodePanel
          ref={codePanelRef}
          isDiffMode={isDiffMode}
          isBrowseMode={isBrowseMode}
          isIntentsOnly={isIntentsOnly}
          file={file}
          resolvedChunks={resolvedChunks}
          fullFileContent={fullFileContent}
          highlightedDiffLines={highlightedDiffLines}
          highlightedBrowseLines={highlightedBrowseLines}
          language={language}
        />

        {/* Right: Chunk Cards Panel - Memoized, isolated re-renders */}
        <ChunksPanel
          resolvedChunks={resolvedChunks}
          filename={filename}
          chunkTops={chunkTops}
          chunkPanelHeight={chunkPanelHeight}
          activeChunk={activeChunk}
          isDiffMode={isDiffMode}
          newLineMap={lineMaps.newLineMap}
          selectedIntentId={selectedIntentId}
          isExpanded={isExpanded}
          onToggle={toggleChunk}
          onActivate={handleChunkActivate}
          onDeactivate={handleChunkDeactivate}
          onDeepDive={handleDeepDive}
          onLinkClick={handleChunkLinkClick}
          translations={chunkCardTranslations}
        />
      </div>
      {/* Toast notification */}
      {toast && (
        <div className="toast-notification">
          <span className="toast-icon">📋</span>
          <span className="toast-message">{toast}</span>
          <button className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </div>
  );
}

/**
 * Memoized DiffViewer - only re-renders when props change
 * Each file viewer is independent and won't re-render when other files change
 */
export const DiffFileViewer = memo(DiffFileViewerInner);
