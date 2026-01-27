import { memo } from 'react';
import type { IntentV2API, TranslateFunction } from '../types';
import { EmptyState } from './common';
import './StoryMode.css';

interface StoryModeProps {
  intents: IntentV2API[];
  onChunkClick: (anchor: string) => void;
  t: TranslateFunction;
}

/**
 * Story Mode - Narrative view of intents without code
 * Displays intents as chapters with summaries, motivations, and chunks
 * Toggle button is in ProjectOverview (via StoryModeContext)
 * Memoized to prevent unnecessary re-renders
 */
export const StoryMode = memo(function StoryMode({
  intents,
  onChunkClick,
  t,
}: StoryModeProps) {
  const handleChunkClick = (intent: IntentV2API, anchor: string) => {
    // Navigate to the chunk in the code view
    const chunkFile = intent.frontmatter.files[0] || '';
    const filename = chunkFile.split('/').pop() || chunkFile;
    const targetId = `chunk-${filename}-${anchor}`;
    const element = document.getElementById(targetId);

    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("chunk-highlight");
      setTimeout(() => element.classList.remove("chunk-highlight"), 2000);
    }

    // Trigger expand via callback
    setTimeout(() => {
      onChunkClick(anchor);
    }, 5);
  };

  return (
    <div className="story-mode-page">
      {intents.length === 0 ? (
        <EmptyState type="story-empty" t={t} />
      ) : (
        <div className="story-content">
          {intents.map((intent, idx) => (
            <article key={intent.frontmatter.id} className="story-chapter">
              <div className="chapter-header">
                <span className="chapter-number">{t('chapter')} {idx + 1}</span>
                <div className="chapter-meta">
                  <span className="chapter-id">#{intent.frontmatter.id}</span>
                  {intent.frontmatter.risk && (
                    <span className={`risk-badge risk-${intent.frontmatter.risk}`}>
                      {intent.frontmatter.risk}
                    </span>
                  )}
                  {intent.frontmatter.date && (
                    <span className="chapter-date">{intent.frontmatter.date}</span>
                  )}
                </div>
              </div>

              <h3 className="chapter-title">{intent.title}</h3>

              {intent.summary && (
                <div className="chapter-summary">
                  <p>{intent.summary}</p>
                </div>
              )}

              {intent.motivation && (
                <div className="chapter-motivation">
                  <h4>{t('motivation')}</h4>
                  <p>{intent.motivation}</p>
                </div>
              )}

              {intent.frontmatter.tags && intent.frontmatter.tags.length > 0 && (
                <div className="chapter-tags">
                  {intent.frontmatter.tags.map((tag, i) => (
                    <span key={i} className="tag-pill">{tag}</span>
                  ))}
                </div>
              )}

              {intent.resolvedChunks.length > 0 && (
                <div className="chapter-chunks">
                  {intent.resolvedChunks.map((chunk, chunkIdx) => (
                    <div
                      key={chunkIdx}
                      className="story-chunk story-chunk-clickable"
                      onClick={() => handleChunkClick(intent, chunk.anchor)}
                      title={t('backToCode')}
                    >
                      <div className="story-chunk-header">
                        <span className="story-chunk-anchor">{chunk.anchor}</span>
                        {chunk.title && <span className="story-chunk-title">{chunk.title}</span>}
                        <span className="story-chunk-goto">→</span>
                      </div>
                      {chunk.description && (
                        <p className="story-chunk-description">{chunk.description}</p>
                      )}
                      {chunk.decisions && chunk.decisions.length > 0 && (
                        <div className="story-chunk-decisions">
                          {chunk.decisions.map((decision, dIdx) => (
                            <div key={dIdx} className="story-decision">
                              <span className="decision-arrow">→</span>
                              <span>{decision}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
});
