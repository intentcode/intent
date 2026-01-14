import { useState, useMemo, useLayoutEffect, useRef, useCallback } from "react";
import type { DiffFile, DiffHunk } from "../lib/parseDiff";
import type { Session, ChunkLink, ChunkReplaces } from "../lib/parseIntent";
import type { ResolvedChunkAPI } from "../lib/api";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-markdown";

// Detect language from filename extension
function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
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
  };
  return langMap[ext] || 'javascript';
}

// Highlight a single line of code
function highlightLine(line: string, language: string): string {
  try {
    const grammar = Prism.languages[language];
    if (grammar) {
      return Prism.highlight(line, grammar, language);
    }
  } catch {
    // Fallback to plain text
  }
  return line.replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

interface DiffViewerProps {
  file?: DiffFile;
  session?: Session;
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
}

const LINE_HEIGHT = 24; // pixels per line
const COLLAPSED_CARD_HEIGHT = 40; // approximate height of collapsed chunk card
const MIN_GAP_BETWEEN_CARDS = 8; // minimum gap between cards

// Chunk target info for connectors and highlighting
interface ChunkTarget {
  chunkId: string;
  startLine: number;
  endLine: number;
  topPosition: number;
}

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

export function DiffViewer({ file, session, filename, onLinkClick, resolvedChunks, intentTitle, fullFileContent, viewMode = "diff", translations = DEFAULT_TRANSLATIONS }: DiffViewerProps) {
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());
  const [chunkHeights, setChunkHeights] = useState<Map<string, number>>(new Map());
  const [activeChunk, setActiveChunk] = useState<string | null>(null);
  const [highlightedLines, setHighlightedLines] = useState<Set<number>>(new Set());
  const [codePanelWidth, setCodePanelWidth] = useState(500);
  const [toast, setToast] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const codePanelRef = useRef<HTMLDivElement>(null);
  const chunkRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const toggleChunk = (chunkId: string) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) {
        next.delete(chunkId);
      } else {
        next.add(chunkId);
      }
      return next;
    });
  };

  // Generate deep dive prompt and copy to clipboard
  const handleDeepDive = async (chunk: ResolvedChunkAPI) => {
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
  };

  // Determine display mode
  const isBrowseMode = viewMode === "browse" && fullFileContent;
  const isDiffMode = !isBrowseMode && !!file && file.hunks.length > 0;
  const isIntentsOnly = !isDiffMode && !isBrowseMode && resolvedChunks && resolvedChunks.length > 0;

  // Detect language for syntax highlighting
  const language = useMemo(() => detectLanguage(filename), [filename]);

  // Use v2 resolved chunks if available, otherwise fall back to v1 session chunks
  const hasV2Chunks = resolvedChunks && resolvedChunks.length > 0;
  const chunks = useMemo(() => session?.chunks || [], [session?.chunks]);

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

  // Measure chunk heights after render - use useLayoutEffect for synchronous measurement
  useLayoutEffect(() => {
    const measureHeights = () => {
      const newHeights = new Map<string, number>();
      chunkRefs.current.forEach((el, id) => {
        if (el) {
          newHeights.set(id, el.getBoundingClientRect().height);
        }
      });
      setChunkHeights(newHeights);
    };

    // Measure immediately (useLayoutEffect runs synchronously after DOM mutations)
    measureHeights();

    // Also measure again after a frame to catch any CSS transitions
    const rafId = requestAnimationFrame(() => {
      measureHeights();
    });

    return () => cancelAnimationFrame(rafId);
  }, [expandedChunks]);

  // Measure code panel width for SVG connectors
  useLayoutEffect(() => {
    if (codePanelRef.current) {
      setCodePanelWidth(codePanelRef.current.offsetWidth);
    }
  }, [file, fullFileContent]);

  // Calculate non-overlapping positions for chunk cards
  const calculatePositions = useMemo(() => {
    const positions: number[] = [];

    // Use v2 chunks if available, otherwise fall back to v1
    if (hasV2Chunks && resolvedChunks) {
      // First pass: separate chunks into visible-in-diff and not-visible
      const visibleChunks: { idx: number; rowIndex: number }[] = [];
      const notVisibleChunks: number[] = [];

      resolvedChunks.forEach((chunk, i) => {
        if (!chunk.resolved) {
          notVisibleChunks.push(i);
          return;
        }

        if (isDiffMode || isBrowseMode) {
          // In diff or browse mode, use line maps for positioning
          const rowIndex = lineMaps.newLineMap.get(chunk.resolved.startLine);
          if (rowIndex !== undefined) {
            visibleChunks.push({ idx: i, rowIndex });
          } else {
            notVisibleChunks.push(i);
          }
        } else {
          // Intents-only mode: all chunks are "visible"
          visibleChunks.push({ idx: i, rowIndex: i * 100 });
        }
      });

      // Sort visible chunks by their row index
      visibleChunks.sort((a, b) => a.rowIndex - b.rowIndex);

      // Position visible chunks first
      let lastBottom = 0;
      const tempPositions: Map<number, number> = new Map();

      for (const { idx, rowIndex } of visibleChunks) {
        const chunk = resolvedChunks[idx];
        const idealTop = rowIndex * LINE_HEIGHT;
        const actualTop = Math.max(idealTop, lastBottom + MIN_GAP_BETWEEN_CARDS);
        tempPositions.set(idx, actualTop);

        const chunkId = chunk.anchor;
        const height = chunkHeights.get(chunkId) || COLLAPSED_CARD_HEIGHT;
        lastBottom = actualTop + height;
      }

      // Position not-visible chunks at the end
      for (const idx of notVisibleChunks) {
        const chunk = resolvedChunks[idx];
        const actualTop = lastBottom + MIN_GAP_BETWEEN_CARDS;
        tempPositions.set(idx, actualTop);

        const chunkId = chunk.anchor;
        const height = chunkHeights.get(chunkId) || COLLAPSED_CARD_HEIGHT;
        lastBottom = actualTop + height;
      }

      // Build final positions array in original order
      for (let i = 0; i < resolvedChunks.length; i++) {
        positions.push(tempPositions.get(i) || 0);
      }
    } else if (isDiffMode && chunks.length > 0) {
      // Fallback to v1 chunks
      let lastBottom = 0;
      chunks.forEach((chunk) => {
        const map = chunk.isDeletion ? lineMaps.oldLineMap : lineMaps.newLineMap;
        const rowIndex = map.get(chunk.startLine) ?? 0;
        const idealTop = rowIndex * LINE_HEIGHT;

        const actualTop = Math.max(idealTop, lastBottom + MIN_GAP_BETWEEN_CARDS);
        positions.push(actualTop);

        const chunkId = chunk.lineRange;
        const height = chunkHeights.get(chunkId) || COLLAPSED_CARD_HEIGHT;
        lastBottom = actualTop + height;
      });
    }

    return positions;
  }, [isDiffMode, isBrowseMode, hasV2Chunks, chunks, resolvedChunks, lineMaps, chunkHeights]);

  // Build chunk targets for connectors and highlighting
  const chunkTargets = useMemo<ChunkTarget[]>(() => {
    const targets: ChunkTarget[] = [];

    if (hasV2Chunks && resolvedChunks) {
      resolvedChunks.forEach((chunk, i) => {
        if (chunk.resolved) {
          targets.push({
            chunkId: chunk.anchor,
            startLine: chunk.resolved.startLine,
            endLine: chunk.resolved.endLine,
            topPosition: calculatePositions[i] || 0,
          });
        }
      });
    } else if (isDiffMode && chunks.length > 0) {
      chunks.forEach((chunk, i) => {
        targets.push({
          chunkId: chunk.lineRange,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          topPosition: calculatePositions[i] || 0,
        });
      });
    }

    return targets;
  }, [hasV2Chunks, resolvedChunks, isDiffMode, chunks, calculatePositions]);

  // Handle chunk activation (click or hover)
  const handleChunkActivate = useCallback((chunkId: string, startLine: number, endLine: number) => {
    setActiveChunk(chunkId);

    // Set highlighted lines
    const lines = new Set<number>();
    for (let i = startLine; i <= endLine; i++) {
      lines.add(i);
    }
    setHighlightedLines(lines);

    // Scroll to the target lines in code panel
    const firstLineEl = lineRefs.current.get(startLine);
    if (firstLineEl && codePanelRef.current) {
      const panelRect = codePanelRef.current.getBoundingClientRect();
      const lineRect = firstLineEl.getBoundingClientRect();
      const scrollTop = lineRect.top - panelRect.top + codePanelRef.current.scrollTop - 50;
      codePanelRef.current.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
    }
  }, []);

  const handleChunkDeactivate = useCallback(() => {
    setActiveChunk(null);
    setHighlightedLines(new Set());
  }, []);

  const renderLink = (link: ChunkLink, index: number) => (
    <div
      key={index}
      className="chunk-link"
      onClick={(e) => {
        e.stopPropagation();
        onLinkClick?.(link.targetFile, link.targetRange);
      }}
    >
      <span className="link-icon">↗</span>
      <span className="link-target">{link.targetFile}#{link.targetRange}</span>
      <span className="link-reason">{link.reason}</span>
    </div>
  );

  const renderReplaces = (replaces: ChunkReplaces, index: number) => (
    <div key={index} className="chunk-replaces">
      <span className="replaces-icon">⊖</span>
      <span className="replaces-range">
        {replaces.oldFile ? `${replaces.oldFile}#` : ""}{replaces.oldRange}
      </span>
      <span className="replaces-reason">{replaces.reason}</span>
    </div>
  );

  const handleLinkClick = (targetAnchor: string) => {
    // Find the target chunk by anchor
    const targetChunk = resolvedChunks?.find(c => c.anchor === targetAnchor);
    if (targetChunk?.resolved) {
      // Highlight the target lines
      const lines = new Set<number>();
      for (let i = targetChunk.resolved.startLine; i <= targetChunk.resolved.endLine; i++) {
        lines.add(i);
      }
      setHighlightedLines(lines);
      setActiveChunk(targetAnchor);

      // Expand the target chunk
      setExpandedChunks(prev => new Set(prev).add(targetAnchor));

      // Scroll to the chunk card
      setTimeout(() => {
        const chunkEl = document.getElementById(`chunk-${filename}-${targetAnchor}`);
        if (chunkEl) {
          chunkEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      // Clear highlight after a few seconds
      setTimeout(() => {
        setHighlightedLines(new Set());
      }, 3000);
    } else if (onLinkClick) {
      // External link - use the callback
      onLinkClick(targetAnchor, '');
    }
  };

  const renderResolvedLink = (link: { target: string; reason: string }, index: number) => {
    const isInternal = resolvedChunks?.some(c => c.anchor === link.target);
    return (
      <div
        key={index}
        className={`chunk-link ${isInternal ? 'clickable' : ''}`}
        onClick={(e) => {
          if (isInternal) {
            e.stopPropagation();
            handleLinkClick(link.target);
          }
        }}
        onMouseEnter={() => {
          if (isInternal) {
            const targetChunk = resolvedChunks?.find(c => c.anchor === link.target);
            if (targetChunk?.resolved) {
              const lines = new Set<number>();
              for (let i = targetChunk.resolved.startLine; i <= targetChunk.resolved.endLine; i++) {
                lines.add(i);
              }
              setHighlightedLines(lines);
            }
          }
        }}
        onMouseLeave={() => {
          setHighlightedLines(new Set());
        }}
      >
        <span className="link-icon">{isInternal ? '↓' : '↗'}</span>
        <span className="link-target">{link.target}</span>
        <span className="link-reason">{link.reason}</span>
      </div>
    );
  };

  const hasStaleChunks = resolvedChunks?.some(c => c.hashMatch === false);

  // Calculate total panel height needed
  const panelMinHeight = useMemo(() => {
    if (calculatePositions.length === 0) return 0;
    const lastIdx = calculatePositions.length - 1;
    const lastChunkId = hasV2Chunks
      ? resolvedChunks?.[lastIdx]?.anchor
      : chunks[lastIdx]?.lineRange;
    const lastHeight = lastChunkId ? (chunkHeights.get(lastChunkId) || COLLAPSED_CARD_HEIGHT) : COLLAPSED_CARD_HEIGHT;
    return calculatePositions[lastIdx] + lastHeight + 20;
  }, [calculatePositions, chunkHeights, hasV2Chunks, chunks, resolvedChunks]);

  return (
    <div className={`diff-viewer ${hasStaleChunks ? 'has-stale' : ''}`}>
      {/* File Header */}
      <div className="diff-file-header">
        <span className="file-path">{file?.newPath || file?.oldPath || filename}</span>
        {intentTitle && <span className="intent-title-badge">{intentTitle}</span>}
        {hasStaleChunks && <span className="stale-indicator">{translations.modified}</span>}
      </div>

      <div className="diff-container">
        {/* SVG Connector Layer */}
        {(isDiffMode || isBrowseMode) && chunkTargets.length > 0 && (
          <svg className="connector-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
            {chunkTargets.map((target) => {
              // Skip connectors for chunks in context sections (not in diff)
              const rowIndex = lineMaps.newLineMap.get(target.startLine);
              if (rowIndex === undefined) return null;

              const isActive = activeChunk === target.chunkId;
              const codeY = rowIndex * LINE_HEIGHT + LINE_HEIGHT / 2;
              const chunkY = target.topPosition + 20; // Middle of chunk header

              // Calculate the x positions
              const codeX = codePanelWidth;
              const chunkX = codeX + 10;

              return (
                <g key={target.chunkId} opacity={isActive ? 1 : 0.3}>
                  <path
                    d={`M ${codeX - 5} ${codeY} C ${codeX + 20} ${codeY}, ${chunkX - 20} ${chunkY}, ${chunkX} ${chunkY}`}
                    fill="none"
                    stroke={isActive ? '#58a6ff' : '#484f58'}
                    strokeWidth={isActive ? 2 : 1}
                    strokeDasharray={isActive ? 'none' : '4 2'}
                  />
                  <circle cx={codeX - 5} cy={codeY} r={3} fill={isActive ? '#58a6ff' : '#484f58'} />
                </g>
              );
            })}
          </svg>
        )}

        {/* Left: Code Panel */}
        <div className="diff-code-panel" ref={codePanelRef}>
          {/* Diff mode: show hunks only (no context sections) */}
          {isDiffMode && file && file.hunks.map((hunk, hunkIdx) => (
            <div key={`hunk-${hunkIdx}`}>
              {hunk.lines.map((line, lineIdx) => {
                const lineNum = line.newLineNumber || line.oldLineNumber || 0;
                const isHighlighted = highlightedLines.has(lineNum);
                return (
                  <div
                    key={`${hunkIdx}-${lineIdx}`}
                    className={`diff-line diff-line-${line.type}${isHighlighted ? ' line-highlighted' : ''}`}
                    ref={(el) => {
                      if (el && lineNum) lineRefs.current.set(lineNum, el);
                    }}
                    data-line={lineNum}
                  >
                    <span className="line-number line-number-old">{line.oldLineNumber || ""}</span>
                    <span className="line-number line-number-new">{line.newLineNumber || ""}</span>
                    <span className="line-indicator">
                      {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                    </span>
                    <span
                      className="line-content"
                      dangerouslySetInnerHTML={{ __html: highlightLine(line.content, language) }}
                    />
                  </div>
                );
              })}
            </div>
          ))}

          {/* Intents-only mode: show resolved code */}
          {isIntentsOnly && resolvedChunks && resolvedChunks.map((chunk, chunkIdx) => {
            if (!chunk.resolved?.content) return null;
            const isStale = chunk.hashMatch === false;
            const codeLines = chunk.resolved.content.split('\n');

            return (
              <div key={chunkIdx} className={`code-section ${isStale ? 'stale' : ''}`}>
                {chunkIdx > 0 && <div className="code-section-separator" />}
                <div className="code-section-header">
                  <span className="anchor-badge">{chunk.anchor}</span>
                  <span className="line-range-badge">L{chunk.resolved.startLine}-{chunk.resolved.endLine}</span>
                  {isStale && <span className="stale-badge">Stale</span>}
                </div>
                {codeLines.map((line, lineIdx) => (
                  <div key={lineIdx} className="diff-line diff-line-context">
                    <span className="line-number line-number-old">
                      {chunk.resolved!.startLine + lineIdx}
                    </span>
                    <span className="line-number line-number-new">
                      {chunk.resolved!.startLine + lineIdx}
                    </span>
                    <span className="line-indicator"> </span>
                    <span
                      className="line-content"
                      dangerouslySetInnerHTML={{ __html: highlightLine(line, language) }}
                    />
                  </div>
                ))}
              </div>
            );
          })}

          {/* Browse mode: show full file content */}
          {isBrowseMode && fullFileContent && fullFileContent.split('\n').map((line, idx) => {
            const lineNum = idx + 1;
            const isHighlighted = highlightedLines.has(lineNum);
            return (
              <div
                key={idx}
                className={`diff-line diff-line-context${isHighlighted ? ' line-highlighted' : ''}`}
                ref={(el) => {
                  if (el) lineRefs.current.set(lineNum, el);
                }}
                data-line={lineNum}
              >
                <span className="line-number line-number-old">{lineNum}</span>
                <span className="line-number line-number-new">{lineNum}</span>
                <span className="line-indicator"> </span>
                <span
                  className="line-content"
                  dangerouslySetInnerHTML={{ __html: highlightLine(line, language) }}
                />
              </div>
            );
          })}
        </div>

        {/* Right: Chunk Cards Panel */}
        <div
          ref={panelRef}
          className="diff-explanation-panel"
          style={{ minHeight: panelMinHeight > 0 ? panelMinHeight : undefined }}
        >
          <div className="explanation-scroll-container">
            {/* Diff mode: v1 chunks from session (only if no v2 chunks) */}
            {isDiffMode && !hasV2Chunks && chunks.map((chunk, i) => {
              const isExpanded = expandedChunks.has(chunk.lineRange);
              const topPosition = calculatePositions[i] || 0;
              const chunkId = chunk.lineRange;
              const hasContent = chunk.description?.trim() || chunk.decisions.length > 0 || chunk.links.length > 0 || chunk.replaces.length > 0;

              return (
                <div
                  key={i}
                  id={`chunk-${filename}-${chunkId}`}
                  ref={(el) => {
                    if (el) chunkRefs.current.set(chunkId, el);
                  }}
                  className={`chunk-card ${isExpanded ? 'expanded' : ''}`}
                  style={{ position: "absolute", top: topPosition }}
                >
                  <div
                    className="chunk-card-header"
                    onClick={() => toggleChunk(chunkId)}
                  >
                    <span className="chunk-line-range">{chunk.lineRange}</span>
                    <span className="chunk-title">{chunk.title}</span>
                    <span className="chunk-toggle">{isExpanded ? "▼" : "▶"}</span>
                  </div>
                  {isExpanded && hasContent && (
                    <div className="chunk-card-body">
                      {chunk.description?.trim() && (
                        <p className="chunk-description">{chunk.description}</p>
                      )}
                      {chunk.decisions.length > 0 && (
                        <div className="chunk-decisions">
                          {chunk.decisions.map((d, j) => (
                            <div key={j} className="decision">
                              <span className="decision-arrow">→</span> {d.text}
                            </div>
                          ))}
                        </div>
                      )}
                      {chunk.replaces.length > 0 && (
                        <div className="chunk-replaces-section">
                          <div className="replaces-label">Remplace:</div>
                          {chunk.replaces.map((r, j) => renderReplaces(r, j))}
                        </div>
                      )}
                      {chunk.links.length > 0 && (
                        <div className="chunk-links">
                          <div className="links-label">Liens:</div>
                          {chunk.links.map((link, j) => renderLink(link, j))}
                        </div>
                      )}
                      {/* Note: Deep dive not available for V1 chunks - need resolved anchor */}
                    </div>
                  )}
                </div>
              );
            })}

            {/* V2 resolved chunks - in diff mode, only show chunks visible in diff; in browse mode, show all */}
            {hasV2Chunks && resolvedChunks && resolvedChunks.map((chunk, i) => {
              if (!chunk.resolved) return null;

              // In diff mode, only show chunks whose lines are in the diff
              // In browse mode, show all chunks
              const isVisibleInDiff = lineMaps.newLineMap.has(chunk.resolved.startLine);
              if (isDiffMode && !isVisibleInDiff) return null;

              const isExpanded = expandedChunks.has(chunk.anchor);
              const topPosition = calculatePositions[i] || 0;
              const chunkId = chunk.anchor;
              const isStale = chunk.hashMatch === false;
              const isActive = activeChunk === chunkId;

              // Get isNew from extended chunk (added in App.tsx)
              const isNewIntent = (chunk as { isNew?: boolean }).isNew ?? false;

              return (
                <div
                  key={i}
                  id={`chunk-${filename}-${chunkId}`}
                  ref={(el) => {
                    if (el) chunkRefs.current.set(chunkId, el);
                  }}
                  className={`chunk-card ${isExpanded ? 'expanded' : ''} ${isStale ? 'stale' : ''} ${isActive ? 'active' : ''}`}
                  style={{ position: "absolute", top: topPosition }}
                  onMouseEnter={() => handleChunkActivate(chunkId, chunk.resolved!.startLine, chunk.resolved!.endLine)}
                  onMouseLeave={handleChunkDeactivate}
                >
                  <div
                    className="chunk-card-header"
                    onClick={() => {
                      toggleChunk(chunkId);
                      handleChunkActivate(chunkId, chunk.resolved!.startLine, chunk.resolved!.endLine);
                    }}
                  >
                    <span className="chunk-line-range">
                      L{chunk.resolved.startLine}-{chunk.resolved.endLine}
                    </span>
                    <span className={isNewIntent ? "intent-new-badge" : "intent-existing-badge"}>
                      {isNewIntent ? translations.new : translations.existing}
                    </span>
                    <span className="chunk-title">{chunk.title}</span>
                    <span className="chunk-toggle">{isExpanded ? "▼" : "▶"}</span>
                  </div>
                  {isExpanded && (
                    <div className="chunk-card-body">
                      {chunk.description?.trim() && (
                        <p className="chunk-description">{chunk.description}</p>
                      )}
                      {chunk.decisions.length > 0 && (
                        <div className="chunk-decisions">
                          {chunk.decisions.map((d, j) => (
                            <div key={j} className="decision">
                              <span className="decision-arrow">→</span> {d}
                            </div>
                          ))}
                        </div>
                      )}
                      {chunk.links.length > 0 && (
                        <div className="chunk-links">
                          <div className="links-label">Liens:</div>
                          {chunk.links.map((link, j) => renderResolvedLink(link, j))}
                        </div>
                      )}
                      <button
                        className="deep-dive-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeepDive(chunk);
                        }}
                        title={translations.deepDiveTooltip}
                      >
                        <span className="deep-dive-icon">💬</span>
                        <span className="deep-dive-text">{translations.deepDive}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
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
