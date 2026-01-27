import type { IntentV2API, TranslateFunction } from '../../types';

interface IntentRecapProps {
  intents: IntentV2API[];
  t: TranslateFunction;
}

/**
 * Intent recap section - shows summary of each intent at the top
 * Similar to PR recap, displays title, summary, motivation, files, and warnings
 */
export function IntentRecap({ intents, t }: IntentRecapProps) {
  if (intents.length === 0) return null;

  const hasStaleChunks = intents.some(i =>
    i.resolvedChunks.some(c => c.hashMatch === false)
  );

  return (
    <>
      {intents.map((intent, idx) => (
        <div key={idx} className="pr-recap intent-recap">
          <div className="pr-meta">
            <span className="pr-date">{intent.frontmatter.date || ''}</span>
            <span className="pr-title">{intent.title}</span>
            {intent.frontmatter.risk && (
              <span className={`risk-badge risk-${intent.frontmatter.risk}`}>
                {intent.frontmatter.risk}
              </span>
            )}
          </div>
          <div className="pr-info">
            <div className="pr-item">
              <span className="pr-label">{t('summary')}</span>
              <span className="pr-value">{intent.summary}</span>
            </div>
            {intent.motivation && (
              <div className="pr-item">
                <span className="pr-label">{t('motivation')}</span>
                <span className="pr-value">{intent.motivation}</span>
              </div>
            )}
            <div className="pr-item">
              <span className="pr-label">{t('files')}</span>
              <span className="pr-value">{intent.frontmatter.files.join(', ')}</span>
            </div>
            {hasStaleChunks && (
              <div className="pr-item">
                <span className="pr-label stale-warning">{t('warning')}</span>
                <span className="pr-value stale-warning">{t('staleWarning')}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
