import { memo } from "react";
import type { ResolvedChunkAPI } from "../../lib/api";
import { ChunkCard } from "./ChunkCard";

interface ChunksPanelProps {
  // Data
  resolvedChunks?: ResolvedChunkAPI[];
  filename: string;
  // Positioning
  chunkTops: number[];
  chunkPanelHeight: number;
  // State
  activeChunk: string | null;
  // Line maps for filtering (diff mode)
  isDiffMode: boolean;
  newLineMap: Map<number, number>;
  // Selected intent for highlight calculation (passed separately for memo stability)
  selectedIntentId?: string | null;
  // Callbacks
  isExpanded: (chunkId: string) => boolean;
  onToggle: (chunkId: string) => void;
  onActivate: (chunkId: string, startLine: number, endLine: number) => void;
  onDeactivate: () => void;
  onDeepDive: (chunk: ResolvedChunkAPI) => void;
  onLinkClick: (targetFile: string, targetAnchor: string) => void;
  // Translations
  translations: {
    new: string;
    existing: string;
    deepDive: string;
    deepDiveTooltip: string;
  };
}

/**
 * ChunksPanel - Renders the chunk cards
 * Memoized to isolate re-renders from the code panel
 * Only re-renders when chunk-related props change
 */
export const ChunksPanel = memo(function ChunksPanel({
  resolvedChunks,
  filename,
  chunkTops,
  chunkPanelHeight,
  activeChunk,
  isDiffMode,
  newLineMap,
  selectedIntentId,
  isExpanded,
  onToggle,
  onActivate,
  onDeactivate,
  onDeepDive,
  onLinkClick,
  translations,
}: ChunksPanelProps) {
  const hasV2Chunks = resolvedChunks && resolvedChunks.length > 0;

  return (
    <div className="diff-explanation-panel">
      <div
        className="explanation-scroll-container"
        style={{ position: 'relative', minHeight: chunkPanelHeight }}
      >
        {hasV2Chunks && resolvedChunks && resolvedChunks.map((chunk, i) => {
          // In diff mode, only show chunks whose lines are visible in the diff
          if (isDiffMode && chunk.resolved && !newLineMap.has(chunk.resolved.startLine)) {
            return null;
          }

          const isNewIntent = (chunk as { isNew?: boolean }).isNew ?? false;
          // Calculate isHighlighted based on selectedIntentId (not from chunk object for memo stability)
          const chunkIntentId = (chunk as { intentId?: string }).intentId;
          const isChunkHighlighted = selectedIntentId ? chunkIntentId === selectedIntentId : true;

          return (
            <ChunkCard
              key={chunk.anchor}
              chunk={chunk}
              filename={filename}
              top={chunkTops[i] || 0}
              expanded={isExpanded(chunk.anchor)}
              isActive={activeChunk === chunk.anchor}
              isNewIntent={isNewIntent}
              isChunkHighlighted={isChunkHighlighted}
              onToggle={onToggle}
              onActivate={onActivate}
              onDeactivate={onDeactivate}
              onDeepDive={onDeepDive}
              onLinkClick={onLinkClick}
              translations={translations}
            />
          );
        })}
      </div>
    </div>
  );
});
