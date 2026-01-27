import type { DiffContext, TranslateFunction } from '../../types';
import './EmptyState.css';

type EmptyStateType =
  | 'welcome'           // Home mode, waiting for repo selection
  | 'no-changes'        // Diff mode, branches are identical
  | 'no-intents'        // Browse/story mode, no intents found
  | 'no-intent-banner'  // PR has files but no intent documentation
  | 'story-empty';      // Story mode, no intents to display

interface EmptyStateProps {
  type: EmptyStateType;
  diffContext?: DiffContext | null;
  learnMoreUrl?: string;
  t: TranslateFunction;
}

/**
 * Universal empty state component for all providers (local, GitHub, GitLab)
 */
export function EmptyState({ type, diffContext, learnMoreUrl, t }: EmptyStateProps) {
  // Welcome state - home mode
  if (type === 'welcome') {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📂</div>
        <div className="empty-state-title">Select a repository</div>
        <div className="empty-state-hint">
          Browse for a git repository, then choose the branches to compare
        </div>
      </div>
    );
  }

  // Story mode empty
  if (type === 'story-empty') {
    return (
      <div className="story-empty">
        <div className="story-empty-icon">📭</div>
        <p>{t('noIntentsForStory')}</p>
      </div>
    );
  }

  // No changes found (diff mode)
  if (type === 'no-changes') {
    const getMessage = () => {
      switch (diffContext?.type) {
        case 'browse':
        case 'github-browse':
          return 'No intents found';
        case 'branches':
        case 'github-branches':
          return `Branches ${diffContext.base} and ${diffContext.head} are identical.`;
        case 'github-pr':
          return 'This PR has no file changes.';
        default:
          return 'No changes found';
      }
    };

    return (
      <div className="empty-state no-diff">
        <div className="no-diff-icon">📭</div>
        <div className="no-diff-title">
          {diffContext?.type === 'browse' || diffContext?.type === 'github-browse'
            ? 'No intents found'
            : 'No changes found'}
        </div>
        <div className="no-diff-hint">{getMessage()}</div>
      </div>
    );
  }

  // No intent banner (PR without documentation)
  if (type === 'no-intent-banner') {
    return (
      <div className="no-intent-banner">
        <div className="no-intent-icon">📝</div>
        <div className="no-intent-content">
          <div className="no-intent-title">{t('noIntentTitle')}</div>
          <div className="no-intent-desc">{t('noIntentDesc')}</div>
          <div className="no-intent-hint">{t('noIntentHint')}</div>
        </div>
        {learnMoreUrl && (
          <a
            href={learnMoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="no-intent-link"
          >
            {t('createIntent')} →
          </a>
        )}
      </div>
    );
  }

  // No intents found (browse mode)
  if (type === 'no-intents') {
    return (
      <div className="empty-state no-diff">
        <div className="no-diff-icon">📭</div>
        <div className="no-diff-title">No intents found</div>
        <div className="no-diff-hint">
          This repository doesn't have any intent documentation yet.
        </div>
      </div>
    );
  }

  return null;
}
