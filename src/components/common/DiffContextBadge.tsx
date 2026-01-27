import { PRSwitcher } from './PRSwitcher';
import type { DiffContext } from '../../types';
import { getFileName } from '../../lib/fileUtils';
import { usePRSwitcherContext } from '../../contexts';

interface DiffContextBadgeProps {
  diffContext: DiffContext;
}

/**
 * Badge showing the current diff context (PR, branch comparison, or browse mode)
 * Includes the PR switcher dropdown for GitHub modes
 */
export function DiffContextBadge({ diffContext }: DiffContextBadgeProps) {
  const { isOpen, isLoading, prs, toggle, navigateTo, dropdownRef } = usePRSwitcherContext();
  const getLabel = () => {
    switch (diffContext.type) {
      case "browse":
        return `${diffContext.head}`;
      case "github-browse":
        return `${diffContext.head}`;
      case "branches":
        return `${diffContext.base} → ${diffContext.head}`;
      case "github-pr":
        return `PR #${diffContext.prNumber}`;
      case "github-branches":
        return `${diffContext.owner}/${diffContext.repo}: ${diffContext.base} → ${diffContext.head}`;
      default:
        return "";
    }
  };

  const getIcon = () => {
    switch (diffContext.type) {
      case "browse":
      case "github-browse":
        return "📖";
      case "branches":
      case "github-branches":
        return "🔀";
      case "github-pr":
        return "🔗";
      default:
        return "📄";
    }
  };

  const getRepoName = () => {
    if (diffContext.type === "github-pr" || diffContext.type === "github-branches" || diffContext.type === "github-browse") {
      return `${diffContext.owner}/${diffContext.repo}`;
    }
    if (diffContext.repoPath) {
      return getFileName(diffContext.repoPath);
    }
    return "";
  };

  const isPR = diffContext.type === "github-pr";
  const isGitHubBrowse = diffContext.type === "github-browse";
  const canShowPRSwitcher = isPR || isGitHubBrowse;

  return (
    <div className="diff-context-wrapper" ref={dropdownRef}>
      <div
        className={`diff-context-badge ${canShowPRSwitcher ? 'clickable' : ''}`}
        onClick={canShowPRSwitcher ? toggle : undefined}
      >
        <span className="diff-context-icon">{getIcon()}</span>
        <span className="diff-context-repo">{getRepoName()}</span>
        <span className="diff-context-separator">|</span>
        <span className="diff-context-label">{getLabel()}</span>
        {canShowPRSwitcher && (
          <span className={`diff-context-chevron ${isOpen ? 'open' : ''}`}>
            ▼
          </span>
        )}
      </div>

      {/* PR Switcher Dropdown */}
      {canShowPRSwitcher && (
        <PRSwitcher
          isOpen={isOpen}
          isLoading={isLoading}
          prs={prs}
          owner={diffContext.owner || ''}
          repo={diffContext.repo || ''}
          currentPrNumber={diffContext.prNumber}
          currentBranch={diffContext.head}
          isPRView={isPR}
          isBrowseView={isGitHubBrowse}
          onNavigate={navigateTo}
        />
      )}
    </div>
  );
}
