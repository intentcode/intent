import type { DiffContext, TranslateFunction } from '../../types';
import './LoadingState.css';

interface LoadingStateProps {
  loadingContext: string | null;
  diffContext: DiffContext | null;
  t: TranslateFunction;
}

/**
 * Context-aware loading icon
 */
function LoadingIcon({ context }: { context: string | null }) {
  switch (context) {
    case 'github-pr':
    case 'github-branches':
    case 'github-browse':
      // GitHub icon
      return (
        <svg className="loading-icon github" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
        </svg>
      );
    case 'story':
      // Book icon
      return (
        <svg className="loading-icon story" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
          <path d="M8 7h8M8 11h8M8 15h4"/>
        </svg>
      );
    case 'diff':
      // Diff/compare icon
      return (
        <svg className="loading-icon diff" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5"/>
          <path d="M21 3L14 10M3 21l7-7"/>
        </svg>
      );
    case 'browse':
    default:
      // Folder icon
      return (
        <svg className="loading-icon folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          <path d="M12 11v6M9 14h6"/>
        </svg>
      );
  }
}

/**
 * Full-page loading state with context-aware message and icon
 */
export function LoadingState({ loadingContext, diffContext, t }: LoadingStateProps) {
  const getLoadingText = () => {
    switch (loadingContext) {
      case 'diff': return t('loadingDiff');
      case 'browse': return t('loadingBrowse');
      case 'story': return t('loadingStory');
      case 'github-pr': return t('loadingPR');
      case 'github-branches': return t('loadingBranches');
      case 'github-browse': return t('loadingGitHubBrowse');
      default: return t('loading');
    }
  };

  return (
    <div className="loading-page">
      <div className="loading-icon-wrapper">
        <LoadingIcon context={loadingContext} />
        <div className="loading-spinner"></div>
      </div>
      <div className="loading-text">
        {getLoadingText()}
        {diffContext?.owner && diffContext?.repo && (
          <div className="loading-repo">
            {diffContext.owner}/{diffContext.repo}
          </div>
        )}
      </div>
    </div>
  );
}
