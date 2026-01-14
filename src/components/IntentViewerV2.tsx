import type { IntentV2API, ResolvedChunkAPI } from "../lib/api";

interface IntentViewerV2Props {
  intents: IntentV2API[];
  onChunkClick?: (anchor: string, startLine: number, endLine: number) => void;
  showCode?: boolean; // Show resolved code inline (for intents-only mode)
}

function ChunkCardV2({
  chunk,
  onChunkClick,
  showCode,
}: {
  chunk: ResolvedChunkAPI;
  onChunkClick?: (anchor: string, startLine: number, endLine: number) => void;
  showCode?: boolean;
}) {
  const isStale = chunk.hashMatch === false;
  const isResolved = chunk.resolved !== null;

  const handleClick = () => {
    if (isResolved && onChunkClick) {
      onChunkClick(chunk.anchor, chunk.resolved!.startLine, chunk.resolved!.endLine);
    }
  };

  // Limit code preview to reasonable size
  const codeContent = chunk.resolved?.content || "";
  const codeLines = codeContent.split("\n");
  const maxLines = 30;
  const truncated = codeLines.length > maxLines;
  const displayCode = truncated ? codeLines.slice(0, maxLines).join("\n") : codeContent;

  return (
    <div
      className={`chunk-card-v2 ${isStale ? "stale" : ""} ${isResolved ? "clickable" : "unresolved"} ${showCode ? "with-code" : ""}`}
      onClick={handleClick}
    >
      <div className="chunk-header-v2">
        <span className="anchor">{chunk.anchor}</span>
        {isResolved && (
          <span className="line-range">
            L{chunk.resolved!.startLine}
            {chunk.resolved!.startLine !== chunk.resolved!.endLine && `-${chunk.resolved!.endLine}`}
          </span>
        )}
        {isStale && <span className="stale-badge">Stale</span>}
        {!isResolved && <span className="unresolved-badge">Not found</span>}
      </div>
      <div className="chunk-title-v2">{chunk.title}</div>
      <p className="chunk-description">{chunk.description}</p>

      {/* Show resolved code when showCode is true */}
      {showCode && isResolved && chunk.resolved?.content && (
        <div className="chunk-code-preview">
          <pre>
            <code>{displayCode}</code>
          </pre>
          {truncated && (
            <div className="code-truncated">
              ... {codeLines.length - maxLines} more lines
            </div>
          )}
        </div>
      )}

      {chunk.decisions.length > 0 && (
        <div className="decisions">
          {chunk.decisions.map((d, i) => (
            <div key={i} className="decision">
              <span className="decision-label">Decision:</span> {d}
            </div>
          ))}
        </div>
      )}
      {chunk.links.length > 0 && (
        <div className="chunk-links">
          {chunk.links.map((link, i) => (
            <div key={i} className="chunk-link">
              <span className="link-arrow">→</span>
              <span className="link-target">{link.target}</span>
              <span className="link-reason">{link.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IntentCardV2({
  intent,
  onChunkClick,
  showCode,
}: {
  intent: IntentV2API;
  onChunkClick?: (anchor: string, startLine: number, endLine: number) => void;
  showCode?: boolean;
}) {
  const { frontmatter, title, summary, motivation, resolvedChunks } = intent;

  const staleCount = resolvedChunks.filter((c) => c.hashMatch === false).length;
  const unresolvedCount = resolvedChunks.filter((c) => c.resolved === null).length;

  return (
    <div className="intent-card-v2">
      <div className="intent-header-v2">
        <div className="intent-title-row">
          <h3 className="intent-title">{title}</h3>
          {frontmatter.risk && (
            <span className={`risk-badge risk-${frontmatter.risk}`}>{frontmatter.risk}</span>
          )}
        </div>
        <div className="intent-meta">
          <span className="intent-id">#{frontmatter.id}</span>
          {frontmatter.author && <span className="intent-author">by {frontmatter.author}</span>}
          {frontmatter.date && <span className="intent-date">{frontmatter.date}</span>}
          <span className="intent-from" title="Base commit">from: {frontmatter.from}</span>
        </div>
        {(staleCount > 0 || unresolvedCount > 0) && (
          <div className="intent-warnings">
            {staleCount > 0 && (
              <span className="warning-badge stale-warning">
                {staleCount} stale chunk{staleCount > 1 ? "s" : ""}
              </span>
            )}
            {unresolvedCount > 0 && (
              <span className="warning-badge unresolved-warning">
                {unresolvedCount} not found
              </span>
            )}
          </div>
        )}
      </div>

      <div className="intent-summary">
        <p>{summary}</p>
      </div>

      {motivation && (
        <div className="intent-motivation">
          <strong>Motivation:</strong> {motivation}
        </div>
      )}

      {frontmatter.files.length > 0 && (
        <div className="intent-files">
          <span className="files-label">Files:</span>
          {frontmatter.files.map((f, i) => (
            <span key={i} className="file-pill">{f}</span>
          ))}
        </div>
      )}

      {frontmatter.tags && frontmatter.tags.length > 0 && (
        <div className="intent-tags">
          {frontmatter.tags.map((tag, i) => (
            <span key={i} className="tag-pill">{tag}</span>
          ))}
        </div>
      )}

      <div className="chunks-v2">
        {resolvedChunks.map((chunk, i) => (
          <ChunkCardV2 key={i} chunk={chunk} onChunkClick={onChunkClick} showCode={showCode} />
        ))}
      </div>
    </div>
  );
}

export function IntentViewerV2({ intents, onChunkClick, showCode }: IntentViewerV2Props) {
  if (intents.length === 0) {
    return (
      <div className="intent-viewer-v2 empty">
        <p>No intents found for this repository.</p>
      </div>
    );
  }

  // Group intents by their files
  const intentsByFile = new Map<string, IntentV2API[]>();
  for (const intent of intents) {
    for (const file of intent.frontmatter.files) {
      if (!intentsByFile.has(file)) {
        intentsByFile.set(file, []);
      }
      intentsByFile.get(file)!.push(intent);
    }
  }

  return (
    <div className="intent-viewer-v2">
      <div className="intents-header">
        <h2>Intents ({intents.length})</h2>
      </div>
      <div className="intents-list">
        {intents.map((intent, i) => (
          <IntentCardV2 key={i} intent={intent} onChunkClick={onChunkClick} showCode={showCode} />
        ))}
      </div>
    </div>
  );
}
