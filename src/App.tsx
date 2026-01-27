import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { DiffFileViewer } from "./components/DiffViewer";
import { RepoSelector } from "./components/RepoSelector";
import {
  ProjectOverview,
  IntentRecap,
  LoadingState,
  ErrorState,
  EmptyState,
  Sidebar,
  DiffContextBadge,
} from "./components/common";
import { FilesProvider, SelectionProvider, PRSwitcherProvider, StoryModeProvider, useFilesContext, useSelectionContext } from "./contexts";
import { fetchConfig } from "./lib/api";
import type { AppConfig } from "./lib/api";
import { getCurrentUser, loginWithGitHub, logout } from "./lib/auth";
import type { User } from "./lib/auth";
import { TRANSLATIONS, LANGUAGES, setStoredLanguage } from "./lib/language";
import type { Language } from "./lib/language";
import { useLocalLoader, useGitHubLoader, useScrollIndicator, useVirtualHunks } from "./hooks";
import { isRangeInDiff, scrollToChunk } from "./lib/diffUtils";
import {
  getFileName,
  getFilePath,
  classifyFile,
  getFileStatusText,
  getChunksForFile,
  type EnrichedChunk,
} from "./lib/fileUtils";
import type { FileData, ViewMode, AppMode, IntentV2API, DiffContext, RepoInfo, AuthInfo } from "./types";
import "./App.css";

interface AppProps {
  mode?: AppMode;
  lang?: Language;
  onLangChange?: (lang: Language) => void;
}

// Props for the inner content component that uses contexts
interface AppContentProps {
  // Data from loaders
  files: FileData[];
  filteredIntentsV2: IntentV2API[];
  changedFiles: string[];
  repoInfo: RepoInfo | null;
  diffContext: DiffContext | null;
  viewMode: ViewMode;
  loading: boolean;
  loadingContext: string | null;
  error: string | null;
  authInfo: AuthInfo | null;
  // UI state and handlers
  mode: AppMode | undefined;
  lang: Language;
  setLang: (lang: Language) => void;
  user: User | null;
  appConfig: AppConfig | null;
  diffRequested: boolean;
  setDiffRequested: (v: boolean) => void;
  expandChunkAnchor: string | null;
  setExpandChunkAnchor: (v: string | null) => void;
  currentVisibleFile: string | null;
  setCurrentVisibleFile: (v: string | null) => void;
  // Loader functions
  local: ReturnType<typeof useLocalLoader>;
  github: ReturnType<typeof useGitHubLoader>;
  // Callbacks
  t: (key: string) => string;
}

function App({ mode, lang: propLang = "en", onLangChange }: AppProps) {
  const params = useParams<{ owner?: string; repo?: string; prNumber?: string; base?: string; head?: string; branch?: string }>();

  // Data loaders - separate for Local and GitHub
  const local = useLocalLoader(propLang);
  const github = useGitHubLoader(propLang);

  // Derived state from active loader
  const files = github.isActive ? github.files : local.files;
  const intentsV2 = github.isActive ? github.intentsV2 : local.intentsV2;
  const changedFiles = github.isActive ? github.changedFiles : local.changedFiles;
  const allFileContents = github.isActive ? github.allFileContents : local.allFileContents;
  const repoInfo = github.repoInfo; // Only GitHub has repoInfo
  const diffContext = github.isActive ? github.diffContext : local.diffContext;
  const viewMode = github.isActive ? github.viewMode : local.viewMode;
  const loading = github.loading || local.loading;
  const loadingContext = github.loadingContext || local.loadingContext;
  const error = github.error || local.error;
  const authInfo = github.isActive ? github.authInfo : local.authInfo;

  // Language handling
  const lang = propLang;
  const setLang = (newLang: Language) => {
    if (onLangChange) {
      onLangChange(newLang);
    }
    setStoredLanguage(newLang);
  };

  // UI state (not related to data loading)
  // Note: selectedIntentId, expandedFolders, hideIntentFiles are now managed by contexts
  const [expandChunkAnchor, setExpandChunkAnchor] = useState<string | null>(null);
  const [diffRequested, setDiffRequested] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [currentVisibleFile, setCurrentVisibleFile] = useState<string | null>(null);
  const isFirstRender = useRef(true);
  const urlLoadedRef = useRef(false);

  // Fetch current user and config on mount
  useEffect(() => {
    getCurrentUser().then(setUser);
    fetchConfig().then(setAppConfig);
  }, []);

  // Auto-load from URL params (GitHub only - local uses RepoSelector)
  useEffect(() => {
    if (urlLoadedRef.current) return;

    const { owner, repo, prNumber, base, head, branch } = params;

    if (mode === "github-pr" && owner && repo && prNumber) {
      urlLoadedRef.current = true;
      setDiffRequested(true);
      local.clear(); // Clear local loader when switching to GitHub
      github.loadPR(owner, repo, parseInt(prNumber, 10));
    } else if (mode === "github-compare" && owner && repo && base && head) {
      urlLoadedRef.current = true;
      setDiffRequested(true);
      local.clear();
      github.loadBranches(owner, repo, base, head);
    } else if (mode === "github-browse" && owner && repo) {
      urlLoadedRef.current = true;
      setDiffRequested(true);
      local.clear();
      github.loadBrowse(owner, repo, branch || "main");
    }
  }, [mode, params, github, local]);

  // Reload when language changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (loading) return;

    if (github.isActive) {
      github.reloadWithLang(lang);
    } else if (local.isActive) {
      local.reloadWithLang(lang);
    }
  }, [lang]);

  // Translation helper
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;

  // Filter intents and mark chunks as in-diff or context
  // Show intent if it has at least one chunk in the diff
  // Keep ALL chunks of that intent (for context display)
  const filteredIntentsV2 = useMemo(() => {
    // In browse or story mode, show all intents without filtering
    if (viewMode === "browse" || viewMode === "story") return intentsV2;
    if (files.length === 0) return intentsV2;

    return intentsV2.filter(intent => {
      // Check if at least one chunk is in the diff
      return intent.resolvedChunks.some(chunk => {
        if (!chunk.resolved || !chunk.resolvedFile) return false;
        return isRangeInDiff(files, chunk.resolvedFile, chunk.resolved.startLine, chunk.resolved.endLine);
      });
    });
  }, [intentsV2, files, viewMode]);

  // Virtual hunks for context chunks (chunks not in diff but intent is shown)
  const { filesWithVirtualHunks } = useVirtualHunks({
    files,
    intents: filteredIntentsV2,
    allFileContents,
    viewMode,
  });

  // Wrap content with providers so AppContent can use contexts
  return (
    <FilesProvider files={filesWithVirtualHunks}>
      <SelectionProvider files={filesWithVirtualHunks}>
        <PRSwitcherProvider
          owner={diffContext?.owner}
          repo={diffContext?.repo}
          currentPrNumber={diffContext?.prNumber}
        >
          <StoryModeProvider>
            <AppContent
              files={files}
              filteredIntentsV2={filteredIntentsV2}
              changedFiles={changedFiles}
              repoInfo={repoInfo}
              diffContext={diffContext}
              viewMode={viewMode}
              loading={loading}
              loadingContext={loadingContext}
              error={error}
              authInfo={authInfo}
              mode={mode}
              lang={lang}
              setLang={setLang}
              user={user}
              appConfig={appConfig}
              diffRequested={diffRequested}
              setDiffRequested={setDiffRequested}
              expandChunkAnchor={expandChunkAnchor}
              setExpandChunkAnchor={setExpandChunkAnchor}
              currentVisibleFile={currentVisibleFile}
              setCurrentVisibleFile={setCurrentVisibleFile}
              local={local}
              github={github}
              t={t}
            />
          </StoryModeProvider>
        </PRSwitcherProvider>
      </SelectionProvider>
    </FilesProvider>
  );
}

/**
 * AppContent - Inner component that uses contexts for shared state
 * This allows us to use hooks from FilesContext and SelectionContext
 */
function AppContent({
  files,
  filteredIntentsV2,
  changedFiles,
  repoInfo,
  diffContext,
  viewMode,
  loading,
  loadingContext,
  error,
  authInfo,
  mode,
  lang,
  setLang,
  user,
  appConfig,
  diffRequested,
  setDiffRequested,
  expandChunkAnchor,
  setExpandChunkAnchor,
  currentVisibleFile,
  setCurrentVisibleFile,
  local,
  github,
  t,
}: AppContentProps) {
  // Get shared state from contexts
  const { filteredFiles } = useFilesContext();
  const { selectedIntentId, setSelectedIntentId } = useSelectionContext();
  // Compute selected intent from context state
  const selectedIntent = useMemo(() => {
    if (!selectedIntentId) return null;
    return filteredIntentsV2.find(i => i.frontmatter.id === selectedIntentId) || null;
  }, [selectedIntentId, filteredIntentsV2]);

  // Memoize translations object to prevent re-renders of DiffFileViewer
  const diffViewerTranslations = useMemo(() => ({
    new: t('new'),
    existing: t('existing'),
    context: t('context'),
    notInDiff: t('notInDiff'),
    modified: t('modified'),
    deepDive: t('deepDive'),
    toastCopied: t('toastCopied'),
    toastError: t('toastError'),
    promptTitle: t('promptTitle'),
    promptDisclaimer: t('promptDisclaimer'),
    promptContext: t('promptContext'),
    promptFile: t('promptFile'),
    promptIntent: t('promptIntent'),
    promptChunkToExplore: t('promptChunkToExplore'),
    promptAnchor: t('promptAnchor'),
    promptTitleLabel: t('promptTitleLabel'),
    promptDescription: t('promptDescription'),
    promptDecisions: t('promptDecisions'),
    promptSourceCode: t('promptSourceCode'),
    promptLines: t('promptLines'),
    promptCodeNotAvailable: t('promptCodeNotAvailable'),
    promptQuestion: t('promptQuestion'),
    promptQuestionPlaceholder: t('promptQuestionPlaceholder'),
    deepDiveTooltip: t('deepDiveTooltip'),
    stale: t('stale'),
    obsolete: t('obsolete'),
  }), [t]);

  // Memoize chunks for all files - only recalculate when files/intents change
  // This prevents creating new arrays on every render when selectedIntentId changes
  const chunksPerFile = useMemo(() => {
    const map = new Map<string, EnrichedChunk[]>();
    filteredFiles.forEach(file => {
      const chunks = getChunksForFile(file, filteredIntentsV2, null);
      map.set(file.filename, chunks);
    });
    return map;
  }, [filteredFiles, filteredIntentsV2]);

  // Memoized callback for StoryMode chunk clicks (prevents memo invalidation)
  const handleStoryChunkClick = useCallback((anchor: string) => {
    setExpandChunkAnchor(anchor);
    setTimeout(() => setExpandChunkAnchor(null), 100);
  }, [setExpandChunkAnchor]);

  // Scroll indicator markers (calculated by hook)
  const scrollIndicatorMarkers = useScrollIndicator({
    intents: filteredIntentsV2,
    selectedIntentId,
  });

  // Scroll to top button - show when scrolled down on long pages
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const SCROLL_TO_TOP_THRESHOLD = 400;
  const SCROLL_DELTA = 50; // pixels minimum before recalculating

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentY = window.scrollY;

      // Only check if we've scrolled more than SCROLL_DELTA pixels
      if (Math.abs(currentY - lastScrollY) < SCROLL_DELTA) return;

      lastScrollY = currentY;
      const shouldShow = currentY > SCROLL_TO_TOP_THRESHOLD;
      setShowScrollToTop(prev => prev !== shouldShow ? shouldShow : prev);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Track currently visible file using IntersectionObserver
  useEffect(() => {
    if (filteredFiles.length === 0) return;

    let lastFilename: string | null = null;

    const observerOptions = {
      root: null,
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0,
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      requestAnimationFrame(() => {
        const visibleEntries = entries.filter(entry => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          const topmost = visibleEntries.reduce((prev, curr) => {
            return prev.boundingClientRect.top < curr.boundingClientRect.top ? prev : curr;
          });
          const filename = topmost.target.getAttribute('data-filename');
          if (filename && filename !== lastFilename) {
            lastFilename = filename;
            setCurrentVisibleFile(filename);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    filteredFiles.forEach(file => {
      const el = document.getElementById(`file-${file.filename}`);
      if (el) {
        el.setAttribute('data-filename', file.filename);
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, [filteredFiles, setCurrentVisibleFile]);

  return (
    <div className="app">
      <header className="flex items-center justify-between gap-4 px-4 py-3 bg-secondary border-b">
        <div className="flex items-center gap-4">
          <a href="/home" className="flex items-center gap-2 no-underline">
            <img src="/intent_logo.png" alt="Intent" className="logo-icon" />
            <h1 className="text-lg font-semibold text-primary m-0">Intent</h1>
          </a>
          {mode !== "home" && (
            <a href="/home" className="nav-home-link">
              ← Home
            </a>
          )}
        </div>
        <span className="text-muted text-base">Intent-based code review</span>
        <div className="flex items-center gap-4">
          {github.getGitHubUrl() && (
            <a
              href={github.getGitHubUrl()!}
              target="_blank"
              rel="noopener noreferrer"
              className="github-link"
            >
              View on GitHub ↗
            </a>
          )}
          <div className="lang-selector">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                className={lang === l.code ? "active" : ""}
                onClick={() => setLang(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="auth-section">
            {user ? (
              <div className="user-menu">
                <img src={user.avatar} alt={user.login} className="user-avatar" />
                <span className="user-name">{user.login}</span>
                <button onClick={logout} className="logout-btn">Logout</button>
              </div>
            ) : (
              <button onClick={() => loginWithGitHub(window.location.pathname)} className="login-btn">
                Login with GitHub
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Only show RepoSelector in home mode */}
      {mode === "home" && (
        <RepoSelector
          onLoadLocal={(repoPath, diffMode, base, head) => {
            setDiffRequested(true);
            github.clear();
            local.loadDiff(repoPath, diffMode, base, head);
          }}
          onLoadBrowse={(repoPath, branch) => {
            setDiffRequested(true);
            github.clear();
            local.loadBrowse(repoPath, branch);
          }}
          onLoadStory={(repoPath, branch) => {
            setDiffRequested(true);
            github.clear();
            local.loadStory(repoPath, branch);
          }}
          onLoadGitHub={(owner, repo, prNumber) => {
            setDiffRequested(true);
            local.clear();
            github.loadPR(owner, repo, prNumber);
          }}
          onLoadGitHubBranches={(owner, repo, base, head) => {
            setDiffRequested(true);
            local.clear();
            github.loadBranches(owner, repo, base, head);
          }}
          loading={loading}
          error={error}
          defaultPath={appConfig?.defaultRepoPath ?? ""}
          localOnly={true}
        />
      )}

      {/* Show diff context badge when a diff was requested (not in browse mode which has ProjectOverview) */}
      {diffContext && !loading && viewMode !== "browse" && (
        <div className="diff-context-container">
          <DiffContextBadge diffContext={diffContext} />
        </div>
      )}

      {/* Error states */}
      {!loading && (
        <ErrorState
          error={error}
          authInfo={authInfo}
          onRetry={() => window.location.reload()}
          t={t}
          lang={lang}
        />
      )}

      {/* Empty state for home mode */}
      {files.length === 0 && !loading && !diffRequested && mode === "home" && (
        <EmptyState type="welcome" t={t} />
      )}

      {/* Empty state for GitHub modes */}
      {filteredFiles.length === 0 && !loading && diffRequested && !error && filteredIntentsV2.length === 0 && (
        <EmptyState type="no-changes" diffContext={diffContext} t={t} />
      )}

      {/* Show intents even without code diff - Browse Mode */}
      {filteredFiles.length === 0 && !loading && diffRequested && !error && filteredIntentsV2.length > 0 && (
        <>
          {/* Zone 1: ProjectOverview - Always visible (includes StoryMode) */}
          <ProjectOverview
            repoInfo={repoInfo}
            intents={filteredIntentsV2}
            diffContext={diffContext}
            t={t}
            onChunkClick={handleStoryChunkClick}
          />

          {/* Zone 2: Diff content */}
          <div>
            <IntentRecap intents={filteredIntentsV2} t={t} />

            <main className="app-main">
              <Sidebar
                intents={filteredIntentsV2}
                changedFiles={[]}
                currentVisibleFile={null}
                onFileClick={() => {}}
                mode="browse"
                t={t}
              />

              <div className="files-content">
                {filteredIntentsV2.map((intent, i) => {
                  const intentChunks = intent.resolvedChunks.filter(c => c.resolved?.content);
                  return (
                    <div key={i} id={`intent-file-${i}`}>
                      <DiffFileViewer
                        filename={intent.frontmatter.files[0] || 'unknown'}
                        resolvedChunks={intentChunks}
                        intentTitle={intent.title}
                        onLinkClick={scrollToChunk}
                        expandChunkAnchor={expandChunkAnchor && intentChunks.some(c => c.anchor === expandChunkAnchor) ? expandChunkAnchor : undefined}
                        translations={diffViewerTranslations}
                      />
                    </div>
                  );
                })}
              </div>
            </main>
          </div>
        </>
      )}

      {files.length === 0 && loading && (
        <LoadingState
          loadingContext={loadingContext}
          diffContext={diffContext}
          t={t}
        />
      )}

      {filteredFiles.length > 0 && (
        <>
          {/* Zone 1: ProjectOverview - Always visible when there are intents (includes StoryMode) */}
          {filteredIntentsV2.length > 0 && (
            <ProjectOverview
              repoInfo={repoInfo}
              intents={filteredIntentsV2}
              diffContext={diffContext}
              t={t}
              onChunkClick={handleStoryChunkClick}
            />
          )}

          {/* No intent banner for PRs without documentation */}
          {filteredIntentsV2.length === 0 && (mode === "github-pr" || diffContext?.type === "github-pr") && (
            <EmptyState
              type="no-intent-banner"
              learnMoreUrl="https://github.com/anthropics/intent#creating-intents"
              t={t}
            />
          )}

          {/* Zone 2: Diff content */}
          <div>
            <main className="app-main">
            <Sidebar
              intents={filteredIntentsV2}
              changedFiles={changedFiles}
              currentVisibleFile={currentVisibleFile}
              onFileClick={(filename) => {
                const el = document.getElementById(`file-${filename}`);
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              mode="diff"
              t={t}
            />

            <div className="files-content">
              {/* Selected Intent Header */}
              {selectedIntent && (
                <div className="selected-intent-header">
                  <div className="selected-intent-top">
                    <div className="selected-intent-badge">
                      <span className="intent-id">#{selectedIntent.frontmatter.id}</span>
                      {selectedIntent.frontmatter.risk && (
                        <span className={`risk-badge risk-${selectedIntent.frontmatter.risk}`}>
                          {selectedIntent.frontmatter.risk}
                        </span>
                      )}
                      {selectedIntent.frontmatter.date && (
                        <span className="intent-date">{selectedIntent.frontmatter.date}</span>
                      )}
                    </div>
                    <button
                      className="close-intent-btn"
                      onClick={() => setSelectedIntentId(null)}
                    >
                      ✕
                    </button>
                  </div>
                  <h2 className="selected-intent-title">{selectedIntent.title}</h2>
                  {selectedIntent.summary && (
                    <div className="selected-intent-section">
                      <h4>{t('summary')}</h4>
                      <p>{selectedIntent.summary}</p>
                    </div>
                  )}
                  {selectedIntent.motivation && (
                    <div className="selected-intent-section">
                      <h4>{t('motivation')}</h4>
                      <p>{selectedIntent.motivation}</p>
                    </div>
                  )}
                  {selectedIntent.frontmatter.tags && selectedIntent.frontmatter.tags.length > 0 && (
                    <div className="selected-intent-tags">
                      {selectedIntent.frontmatter.tags.map((tag, i) => (
                        <span key={i} className="tag-pill">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {filteredFiles.map((file, i) => {
                const filePath = getFilePath(file);
                const { isBinary, isEmpty } = classifyFile(file);
                // Get stable chunk references from memoized Map
                // selectedIntentId is passed separately to DiffFileViewer for highlight calculation
                const fileChunks = chunksPerFile.get(file.filename) || [];

                if (!filePath || filePath.trim() === '') return null;

                // Binary or empty files - show simple header
                if (isBinary || isEmpty) {
                  const displayName = getFileName(filePath);
                  const { text: statusText, className: statusClass } = getFileStatusText(file, lang);

                  return (
                    <div key={i} id={`file-${displayName}`} className="diff-viewer binary-file">
                      <div className="diff-header">
                        <span className="diff-filename">{displayName || filePath}</span>
                        <span className={`binary-badge ${statusClass}`}>{statusText}</span>
                      </div>
                    </div>
                  );
                }

                // Normal files - show full diff viewer
                return (
                  <div key={i} id={`file-${file.filename}`}>
                    <DiffFileViewer
                      file={file.diff}
                      filename={file.filename}
                      onLinkClick={scrollToChunk}
                      fullFileContent={file.fullFileContent}
                      resolvedChunks={fileChunks}
                      selectedIntentId={selectedIntentId}
                      viewMode={viewMode === "story" ? "browse" : viewMode}
                      expandChunkAnchor={expandChunkAnchor && fileChunks.some(c => c.anchor === expandChunkAnchor) ? expandChunkAnchor : undefined}
                      translations={diffViewerTranslations}
                    />
                  </div>
                );
              })}
            </div>
          </main>
          </div>
        </>
      )}

      {/* Global Scroll Indicator */}
      {scrollIndicatorMarkers.length > 0 && (
        <div className="global-scroll-indicator">
          {scrollIndicatorMarkers.map((marker) => (
            <div
              key={marker.id}
              className={`global-scroll-marker ${!marker.isHighlighted ? 'dimmed' : ''}`}
              style={{
                top: `${marker.top}%`,
                height: `${Math.max(marker.height, 0.5)}%`,
              }}
              onClick={() => {
                const el = document.getElementById(`chunk-${marker.filename}-${marker.anchor}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('chunk-highlight');
                  setTimeout(() => el.classList.remove('chunk-highlight'), 2000);
                }
              }}
              title={`${marker.anchor} (${marker.filename})`}
            />
          ))}
        </div>
      )}

      {/* Scroll to top button */}
      {showScrollToTop && (
        <button
          className="scroll-to-top-btn"
          onClick={scrollToTop}
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          ↑
        </button>
      )}
    </div>
  );
}

export default App;
