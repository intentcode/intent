import type { OpenPR } from '../../lib/api';
import './PRSwitcher.css';

interface PRSwitcherProps {
  isOpen: boolean;
  isLoading: boolean;
  prs: OpenPR[];
  owner: string;
  repo: string;
  currentPrNumber?: number;
  currentBranch?: string;
  isPRView?: boolean;
  isBrowseView?: boolean;
  onNavigate: (prNumber: number) => void;
  className?: string;
}

/**
 * Dropdown component for switching between open PRs
 * Shows current context (PR or branch) and list of available PRs
 */
export function PRSwitcher({
  isOpen,
  isLoading,
  prs,
  owner,
  repo,
  currentPrNumber,
  currentBranch,
  isPRView = false,
  isBrowseView = false,
  onNavigate,
  className = '',
}: PRSwitcherProps) {
  if (!isOpen) return null;

  const handleBrowseMain = (e: React.MouseEvent) => {
    e.preventDefault();
    window.location.href = `/${owner}/${repo}`;
  };

  const isOnMainBranch = currentBranch && ['main', 'master'].includes(currentBranch);

  return (
    <div className={`pr-switcher-dropdown ${className}`}>
      <div className="pr-switcher-header">
        <span className="pr-switcher-title">Open Pull Requests</span>
        <span className="pr-switcher-repo">{owner}/{repo}</span>
      </div>

      {/* Browse main branch link - only show when viewing a PR */}
      {isPRView && (
        <a
          href={`/${owner}/${repo}`}
          className="pr-switcher-browse-main"
          onClick={handleBrowseMain}
        >
          <span className="browse-main-icon">📖</span>
          <span className="browse-main-text">Browse main branch</span>
          <span className="browse-main-arrow">→</span>
        </a>
      )}

      {/* Current branch indicator when browsing (only if not on main/master) */}
      {isBrowseView && currentBranch && !isOnMainBranch && (
        <div className="pr-switcher-current-branch">
          <span className="current-branch-icon">📖</span>
          <span className="current-branch-text">Browsing: {currentBranch}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="pr-switcher-loading">
          <div className="pr-switcher-spinner"></div>
          <span>Loading PRs...</span>
        </div>
      ) : prs.length === 0 ? (
        <div className="pr-switcher-empty">No open PRs</div>
      ) : (
        <div className="pr-switcher-list">
          {prs.map((pr) => {
            const isCurrent = pr.number === currentPrNumber;
            return (
              <div
                key={pr.number}
                className={`pr-switcher-item ${isCurrent ? 'active' : ''}`}
                onClick={() => !isCurrent && onNavigate(pr.number)}
              >
                <img
                  src={pr.authorAvatar}
                  alt={pr.author}
                  className="pr-switcher-avatar"
                />
                <div className="pr-switcher-info">
                  <div className="pr-switcher-item-header">
                    <span className="pr-switcher-number">#{pr.number}</span>
                    {pr.draft && <span className="pr-switcher-draft">Draft</span>}
                    {isCurrent && <span className="pr-switcher-current">Current</span>}
                  </div>
                  <div className="pr-switcher-item-title">{pr.title}</div>
                  <div className="pr-switcher-item-meta">
                    <span className="pr-switcher-branch">{pr.head}</span>
                    <span className="pr-switcher-arrow">→</span>
                    <span className="pr-switcher-branch">{pr.base}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
