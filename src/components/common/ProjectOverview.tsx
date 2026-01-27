import type { IntentV2API, RepoInfo, DiffContext, TranslateFunction } from '../../types';
import { PRSwitcher } from './PRSwitcher';
import { StoryMode } from '../StoryMode';
import { usePRSwitcherContext, useStoryModeContext } from '../../contexts';
import { getFileName } from '../../lib/fileUtils';
import './ProjectOverview.css';

interface ProjectOverviewProps {
  repoInfo: RepoInfo | null;
  intents: IntentV2API[];
  diffContext: DiffContext | null;
  t: TranslateFunction;
  onChunkClick: (anchor: string) => void;
}

/**
 * Project overview header showing repo info, intent stats, risk overview, and branch info
 * Works for both GitHub and local repositories
 * Always visible - StoryMode toggle is handled via context
 */
export function ProjectOverview({
  repoInfo,
  intents,
  diffContext,
  t,
  onChunkClick,
}: ProjectOverviewProps) {
  const { isOpen, isLoading, prs, toggle, navigateTo, dropdownRef } = usePRSwitcherContext();
  const { showStoryMode, toggleStoryMode } = useStoryModeContext();

  const filesCount = new Set(intents.flatMap(i => i.frontmatter.files)).size;
  const highRiskCount = intents.filter(i => i.frontmatter.risk === 'high').length;
  const mediumRiskCount = intents.filter(i => i.frontmatter.risk === 'medium').length;
  const lowRiskCount = intents.filter(i => i.frontmatter.risk === 'low').length;
  const hasRisks = intents.some(i => i.frontmatter.risk);

  // Determine if this is a GitHub or local context
  const isGitHub = diffContext?.owner && diffContext?.repo;
  const isLocal = diffContext?.repoPath && !isGitHub;

  // Get display name for local repos
  const localRepoName = isLocal ? getFileName(diffContext.repoPath!) : null;

  return (
    <div className="project-overview">
      <div className="project-overview-header">
        <div className="project-overview-info">
          {/* Title - different for local vs GitHub */}
          {isLocal ? (
            <h2 className="project-overview-title">
              <span className="local-icon">📁</span> {localRepoName}
            </h2>
          ) : (
            <h2 className="project-overview-title">{t('projectOverview')}</h2>
          )}

          {/* Description - only for GitHub repos with description */}
          {!isLocal && (repoInfo?.description || intents[0]?.summary) && (
            <p className="project-overview-description">
              {repoInfo?.description || intents[0]?.summary}
            </p>
          )}

          <div className="project-overview-meta">
            {/* GitHub-only: Stars */}
            {repoInfo?.stars !== undefined && repoInfo.stars > 0 && (
              <span className="meta-item meta-stars">
                <span className="meta-icon-styled">★</span>
                <span className="meta-value">{repoInfo.stars.toLocaleString()}</span>
              </span>
            )}

            {/* GitHub-only: Language */}
            {repoInfo?.language && (
              <span className="meta-item meta-language">
                <span className="meta-dot"></span>
                <span className="meta-value">{repoInfo.language}</span>
              </span>
            )}

            {/* Both: Intent count */}
            <span className="meta-item meta-intents">
              <span className="meta-badge">{intents.length}</span>
              <span className="meta-value">{t('intentsCount')}</span>
            </span>

            {/* Both: Files count */}
            <span className="meta-item meta-files">
              <span className="meta-badge">{filesCount}</span>
              <span className="meta-value">{t('filesDocumented')}</span>
            </span>
          </div>

          {/* Risk Overview - both modes */}
          {hasRisks && (
            <div className="project-overview-risk">
              {highRiskCount > 0 && (
                <span className="risk-item risk-high">
                  <span className="risk-count">{highRiskCount}</span>
                  <span className="risk-label">{t('highRisk')}</span>
                </span>
              )}
              {mediumRiskCount > 0 && (
                <span className="risk-item risk-medium">
                  <span className="risk-count">{mediumRiskCount}</span>
                  <span className="risk-label">{t('mediumRisk')}</span>
                </span>
              )}
              {lowRiskCount > 0 && (
                <span className="risk-item risk-low">
                  <span className="risk-count">{lowRiskCount}</span>
                  <span className="risk-label">{t('lowRisk')}</span>
                </span>
              )}
            </div>
          )}

          {/* Branch Info - both modes, but PR Switcher only for GitHub */}
          {diffContext && diffContext.head && (
            <div
              className="project-overview-branch-wrapper"
              ref={isGitHub ? dropdownRef : undefined}
            >
              <div
                className={`project-overview-branch ${isGitHub ? 'clickable' : ''}`}
                onClick={isGitHub ? toggle : undefined}
              >
                <span className="branch-icon">⎇</span>
                <span className="branch-name">{diffContext.head}</span>
                {isGitHub && (
                  <>
                    <span className="branch-repo">{diffContext.owner}/{diffContext.repo}</span>
                    <span className={`branch-chevron ${isOpen ? 'open' : ''}`}>▼</span>
                  </>
                )}
              </div>
              {isGitHub && (
                <PRSwitcher
                  isOpen={isOpen}
                  isLoading={isLoading}
                  prs={prs}
                  owner={diffContext.owner!}
                  repo={diffContext.repo!}
                  currentBranch={diffContext.head}
                  isBrowseView={true}
                  onNavigate={navigateTo}
                  className="branch-dropdown"
                />
              )}
            </div>
          )}
        </div>

        {/* Story Mode Toggle Button */}
        {intents.length > 0 && (
          <button
            className={`story-mode-btn ${showStoryMode ? 'active' : ''}`}
            onClick={toggleStoryMode}
          >
            {showStoryMode ? (
              <>✕ {t('exitStoryMode')}</>
            ) : (
              <>📚 {t('viewStoryMode')}</>
            )}
          </button>
        )}
      </div>

      {/* Story Mode Content - shown when toggle is active */}
      {showStoryMode && intents.length > 0 && (
        <StoryMode
          intents={intents}
          onChunkClick={onChunkClick}
          t={t}
        />
      )}
    </div>
  );
}
