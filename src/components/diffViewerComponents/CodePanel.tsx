import { memo, useRef, forwardRef, useImperativeHandle } from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import type { DiffFile } from "../../lib/parseDiff";
import type { ResolvedChunkAPI } from "../../lib/api";

const LINE_HEIGHT = 24;
const VIRTUALIZATION_THRESHOLD = 500;

// Cache for syntax-highlighted lines
const highlightCache = new Map<string, string>();
const MAX_CACHE_SIZE = 10000;

function highlightLine(line: string, language: string): string {
  const cacheKey = `${language}:${line}`;
  const cached = highlightCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result: string;
  try {
    // Dynamic import would be better, but for now use global Prism
    const Prism = (window as any).Prism;
    const grammar = Prism?.languages?.[language];
    if (grammar) {
      result = Prism.highlight(line, grammar, language);
    } else {
      result = line.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  } catch {
    result = line.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  if (highlightCache.size >= MAX_CACHE_SIZE) {
    highlightCache.clear();
  }
  highlightCache.set(cacheKey, result);
  return result;
}

interface CodePanelProps {
  // Mode flags
  isDiffMode: boolean;
  isBrowseMode: boolean;
  isIntentsOnly: boolean;
  // Data
  file?: DiffFile;
  resolvedChunks?: ResolvedChunkAPI[];
  fullFileContent?: string;
  // Pre-computed highlighted lines
  highlightedDiffLines: Map<string, string>;
  highlightedBrowseLines: string[];
  language: string;
}

export interface CodePanelHandle {
  scrollToLine: (lineNum: number) => void;
  getVirtuosoRef: () => VirtuosoHandle | null;
  getElement: () => HTMLDivElement | null;
}

/**
 * CodePanel - Renders the code/diff content
 * Memoized to prevent re-renders when only chunk expansion state changes
 */
export const CodePanel = memo(forwardRef<CodePanelHandle, CodePanelProps>(function CodePanel({
  isDiffMode,
  isBrowseMode,
  isIntentsOnly,
  file,
  resolvedChunks,
  fullFileContent,
  highlightedDiffLines,
  highlightedBrowseLines,
  language,
}, ref) {
  const codePanelRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    scrollToLine: (lineNum: number) => {
      if (isBrowseMode && highlightedBrowseLines.length > VIRTUALIZATION_THRESHOLD && virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({
          index: lineNum - 1,
          align: 'center',
          behavior: 'smooth'
        });
      } else if (codePanelRef.current) {
        const lineEl = codePanelRef.current.querySelector(`[data-line="${lineNum}"]`) as HTMLElement;
        if (lineEl) {
          lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    },
    getVirtuosoRef: () => virtuosoRef.current,
    getElement: () => codePanelRef.current,
  }), [isBrowseMode, highlightedBrowseLines.length]);

  return (
    <div className="diff-code-panel" ref={codePanelRef}>
      {/* Diff mode: show hunks */}
      {isDiffMode && file && file.hunks.map((hunk, hunkIdx) => (
        <div key={`hunk-${hunkIdx}`}>
          {hunk.lines.map((line, lineIdx) => {
            const lineNum = line.newLineNumber || line.oldLineNumber || 0;
            return (
              <div
                key={`${hunkIdx}-${lineIdx}`}
                className={`diff-line diff-line-${line.type}`}
                data-line={lineNum}
              >
                <span className="line-number line-number-old">{line.oldLineNumber || ""}</span>
                <span className="line-number line-number-new">{line.newLineNumber || ""}</span>
                <span className="line-indicator">
                  {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                </span>
                <span
                  className="line-content"
                  dangerouslySetInnerHTML={{ __html: highlightedDiffLines.get(`${hunkIdx}-${lineIdx}`) || '' }}
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
      {isBrowseMode && fullFileContent && (() => {
        const lineCount = highlightedBrowseLines.length;
        const useVirtualization = lineCount > VIRTUALIZATION_THRESHOLD;

        const renderLine = (idx: number) => {
          const lineNum = idx + 1;
          return (
            <div
              key={idx}
              className="diff-line diff-line-context"
              data-line={lineNum}
            >
              <span className="line-number line-number-old">{lineNum}</span>
              <span className="line-number line-number-new">{lineNum}</span>
              <span className="line-indicator"> </span>
              <span
                className="line-content"
                dangerouslySetInnerHTML={{ __html: highlightedBrowseLines[idx] || '' }}
              />
            </div>
          );
        };

        if (useVirtualization) {
          const totalHeight = lineCount * LINE_HEIGHT;
          return (
            <Virtuoso
              ref={virtuosoRef}
              totalCount={lineCount}
              overscan={500}
              itemContent={renderLine}
              style={{ height: totalHeight }}
            />
          );
        }

        return highlightedBrowseLines.map((_, idx) => renderLine(idx));
      })()}
    </div>
  );
}));
