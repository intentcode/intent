import { memo, useCallback } from 'react';
import type { ResolvedChunkAPI } from '../../lib/api';

interface ChunkCardProps {
  chunk: ResolvedChunkAPI;
  filename: string;
  top: number;
  expanded: boolean;
  isActive: boolean;
  isNewIntent: boolean;
  isChunkHighlighted: boolean;
  onToggle: (chunkId: string) => void;
  onActivate: (chunkId: string, startLine: number, endLine: number) => void;
  onDeactivate: () => void;
  onDeepDive: (chunk: ResolvedChunkAPI) => void;
  onLinkClick?: (targetFile: string, targetRange: string) => void;
  translations: {
    new: string;
    existing: string;
    deepDive: string;
    deepDiveTooltip: string;
  };
}

/**
 * Memoized ChunkCard component
 * Only re-renders when its specific props change, not when other chunks change
 */
export const ChunkCard = memo(function ChunkCard({
  chunk,
  filename,
  top,
  expanded,
  isActive,
  isNewIntent,
  isChunkHighlighted,
  onToggle,
  onActivate,
  onDeactivate,
  onDeepDive,
  onLinkClick,
  translations,
}: ChunkCardProps) {
  const chunkId = chunk.anchor;
  const isObsolete = !chunk.resolved;
  const isStale = !isObsolete && chunk.hashMatch === false;
  const chunkOverlaps = chunk.overlaps || [];
  const hasOverlaps = chunkOverlaps.length > 0;

  const handleHeaderClick = useCallback(() => {
    onToggle(chunkId);
    // Only highlight when expanding, clear when collapsing
    if (chunk.resolved) {
      if (!expanded) {
        // Currently collapsed → expanding → activate highlight
        onActivate(chunkId, chunk.resolved.startLine, chunk.resolved.endLine);
      } else {
        // Currently expanded → collapsing → deactivate highlight
        onDeactivate();
      }
    }
  }, [chunkId, onToggle, onActivate, onDeactivate, chunk.resolved, expanded]);

  const handleDeepDiveClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDeepDive(chunk);
  }, [onDeepDive, chunk]);

  // Unresolved/obsolete chunks
  if (isObsolete) {
    return (
      <div
        id={`chunk-${filename}-${chunkId}`}
        className={`chunk-card unresolved ${expanded ? 'expanded' : ''} ${!isChunkHighlighted ? 'dimmed' : ''}`}
        style={{ position: 'absolute', top }}
      >
        <div
          className="chunk-card-header"
          onClick={() => onToggle(chunkId)}
        >
          <span className="chunk-title">{chunk.title}</span>
          <span className="chunk-toggle">{expanded ? "▼" : "▶"}</span>
        </div>
        {expanded && (
          <div className="chunk-card-body">
            {chunk.description?.trim() && (
              <p className="chunk-description">{chunk.description}</p>
            )}
            {chunk.decisions && chunk.decisions.length > 0 && (
              <div className="chunk-decisions">
                {chunk.decisions.map((decision, idx) => (
                  <div key={idx} className="chunk-decision">
                    <span className="decision-icon">💡</span>
                    <span>{decision}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="chunk-anchor-info">
              <code>{chunk.anchor}</code>
            </p>
          </div>
        )}
      </div>
    );
  }

  // Normal resolved chunks
  return (
    <div
      id={`chunk-${filename}-${chunkId}`}
      className={`chunk-card ${expanded ? 'expanded' : ''} ${isStale ? 'stale' : ''} ${isActive ? 'active' : ''} ${!isChunkHighlighted ? 'dimmed' : ''} ${hasOverlaps ? 'has-overlap' : ''}`}
      style={{ position: 'absolute', top }}
    >
      <div
        className="chunk-card-header"
        onClick={handleHeaderClick}
      >
        <span className="chunk-line-range">
          L{chunk.resolved!.startLine}-{chunk.resolved!.endLine}
        </span>
        <span className={isNewIntent ? "intent-new-badge" : "intent-existing-badge"}>
          {isNewIntent ? translations.new : translations.existing}
        </span>
        {hasOverlaps && (
          <span className="overlap-badge" title={`Overlaps with: ${chunkOverlaps.join(', ')}`}>
            OVERLAP
          </span>
        )}
        {chunk.links && chunk.links.length > 0 && (
          <span className="links-badge" title={`${chunk.links.length} link(s)`}>
            🔗 {chunk.links.length}
          </span>
        )}
        <span className="chunk-title">{chunk.title}</span>
        <span className="chunk-toggle">{expanded ? "▼" : "▶"}</span>
      </div>
      {expanded && (
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
          {/* Chunk Links */}
          {chunk.links && chunk.links.length > 0 && (
            <div className="chunk-links">
              <div className="links-label">Links</div>
              {chunk.links.map((link, linkIdx) => {
                // Parse cross-file links: "file.py@function:name" or just "@function:name"
                const crossFileMatch = link.target.match(/^([^@]+)(@.+)$/);
                const targetFile = crossFileMatch ? crossFileMatch[1] : null;
                const targetAnchor = crossFileMatch ? crossFileMatch[2] : link.target;
                const isInternal = !targetFile;
                const isClickable = isInternal && targetAnchor;
                return (
                  <div
                    key={linkIdx}
                    className={`chunk-link ${isClickable ? 'clickable' : ''}`}
                    onClick={isClickable ? () => onLinkClick?.(filename, targetAnchor) : undefined}
                  >
                    <span className="link-icon">{isInternal ? '↓' : '📁'}</span>
                    <span className="link-target">{targetAnchor}</span>
                    {link.reason && <span className="link-reason">{link.reason}</span>}
                    {targetFile && (
                      <span className="link-file">{targetFile.split('/').pop()}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* Overlaps info */}
          {hasOverlaps && (
            <div className="chunk-overlaps">
              <span className="overlaps-label">Overlaps with:</span>
              {chunkOverlaps.map((overlap, j) => (
                <span key={j} className="overlap-anchor">{overlap}</span>
              ))}
            </div>
          )}
          <button
            className="deep-dive-btn"
            onClick={handleDeepDiveClick}
            title={translations.deepDiveTooltip}
          >
            <span className="deep-dive-icon">💬</span>
            <span className="deep-dive-text">{translations.deepDive}</span>
          </button>
        </div>
      )}
    </div>
  );
});
