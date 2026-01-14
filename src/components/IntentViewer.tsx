import type { IntentFile, Session, Chunk } from "../lib/parseIntent";

interface IntentViewerProps {
  intent: IntentFile;
  highlightedChunk?: string; // lineRange to highlight
  onChunkHover?: (lineRange: string | null) => void;
}

function ChunkCard({
  chunk,
  isHighlighted,
  onHover,
}: {
  chunk: Chunk;
  isHighlighted: boolean;
  onHover: (lineRange: string | null) => void;
}) {
  return (
    <div
      className={`chunk-card ${isHighlighted ? "highlighted" : ""}`}
      onMouseEnter={() => onHover(chunk.lineRange)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="chunk-header">
        <span className="line-range">{chunk.lineRange}</span>
        <span className="chunk-title">{chunk.title}</span>
      </div>
      <p className="chunk-description">{chunk.description}</p>
      {chunk.decisions.length > 0 && (
        <div className="decisions">
          {chunk.decisions.map((d, i) => (
            <div key={i} className="decision">
              <span className="decision-label">Décision:</span> {d.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({
  session,
  highlightedChunk,
  onChunkHover,
}: {
  session: Session;
  highlightedChunk?: string;
  onChunkHover: (lineRange: string | null) => void;
}) {
  return (
    <div className="session-card">
      <div className="session-header">
        <span className="session-date">{session.date}</span>
        <span className="session-title">{session.title}</span>
      </div>
      <div className="session-recap">
        <div className="objective">
          <strong>Objectif:</strong> {session.objective}
        </div>
        <div className="risk">
          <strong>Risque:</strong>{" "}
          <span className={`risk-badge risk-${session.risk.split(" ")[0].toLowerCase()}`}>
            {session.risk}
          </span>
        </div>
      </div>
      <div className="chunks">
        {session.chunks.map((chunk, i) => (
          <ChunkCard
            key={i}
            chunk={chunk}
            isHighlighted={highlightedChunk === chunk.lineRange}
            onHover={onChunkHover}
          />
        ))}
      </div>
    </div>
  );
}

export function IntentViewer({ intent, highlightedChunk, onChunkHover }: IntentViewerProps) {
  return (
    <div className="intent-viewer">
      <h2 className="filename">{intent.filename}</h2>
      {intent.sessions.map((session, i) => (
        <SessionCard
          key={i}
          session={session}
          highlightedChunk={highlightedChunk}
          onChunkHover={onChunkHover || (() => {})}
        />
      ))}
    </div>
  );
}
