import { useState, useEffect } from "react";
import type { DiffMode, DirectoryEntry, BranchInfo, BranchSuggestion } from "../lib/api";
import { listDirs, parseGitHubURL, parseGitHubRepoURL, discoverBranches, discoverGitHubBranches } from "../lib/api";

type SourceType = "local" | "github";
type GitHubMode = "pr" | "branches";
type ActionMode = "browse" | "compare";

interface RepoSelectorProps {
  onLoadLocal: (repoPath: string, mode: DiffMode, base: string, head: string) => void;
  onLoadBrowse?: (repoPath: string, branch: string) => void;
  onLoadGitHub: (owner: string, repo: string, prNumber: number) => void;
  onLoadGitHubBranches?: (owner: string, repo: string, base: string, head: string) => void;
  loading: boolean;
  error: string | null;
  defaultPath?: string;
  defaultBase?: string;
  defaultHead?: string;
}

export function RepoSelector({ onLoadLocal, onLoadBrowse, onLoadGitHub, onLoadGitHubBranches, loading, error, defaultPath, defaultBase, defaultHead }: RepoSelectorProps) {
  const [sourceType, setSourceType] = useState<SourceType>("local");
  const [actionMode, setActionMode] = useState<ActionMode>("compare");

  // Local state
  const [currentPath, setCurrentPath] = useState(defaultPath || "");
  const [parentPath, setParentPath] = useState("");
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [isGitRepo, setIsGitRepo] = useState(!!defaultPath);
  const [base, setBase] = useState(defaultBase || "main");
  const [head, setHead] = useState(defaultHead || "HEAD");
  const [browseBranch, setBrowseBranch] = useState("main");
  const [browserOpen, setBrowserOpen] = useState(false);

  // Branch discovery state
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [suggestions, setSuggestions] = useState<BranchSuggestion[]>([]);
  const [, setDefaultBranch] = useState("main");
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [branchSelectorOpen, setBranchSelectorOpen] = useState(false);

  // GitHub state
  const [githubUrl, setGithubUrl] = useState("");
  const [githubMode, setGithubMode] = useState<GitHubMode>("pr");
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubBase, setGithubBase] = useState("main");
  const [githubHead, setGithubHead] = useState("");
  const [githubBranches, setGithubBranches] = useState<BranchInfo[]>([]);
  const [githubSuggestions, setGithubSuggestions] = useState<BranchSuggestion[]>([]);
  const [githubBranchSelectorOpen, setGithubBranchSelectorOpen] = useState(false);

  // Load initial directory
  useEffect(() => {
    if (sourceType === "local" && browserOpen) {
      loadDirectory();
    }
  }, [sourceType, browserOpen]);

  // Auto-discover branches when a git repo is selected
  useEffect(() => {
    if (isGitRepo && currentPath) {
      loadBranchDiscovery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGitRepo, currentPath]);

  // Parse GitHub URL and detect mode
  useEffect(() => {
    if (!githubUrl) {
      setGithubOwner("");
      setGithubRepo("");
      return;
    }

    const prParsed = parseGitHubURL(githubUrl);
    if (prParsed) {
      setGithubMode("pr");
      setGithubOwner(prParsed.owner);
      setGithubRepo(prParsed.repo);
      return;
    }

    const repoParsed = parseGitHubRepoURL(githubUrl);
    if (repoParsed) {
      setGithubMode("branches");
      setGithubOwner(repoParsed.owner);
      setGithubRepo(repoParsed.repo);
    }
  }, [githubUrl]);

  // Auto-discover GitHub branches when owner/repo change in branches mode
  useEffect(() => {
    if (githubMode === "branches" && githubOwner && githubRepo) {
      loadGitHubBranchDiscovery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubMode, githubOwner, githubRepo]);

  const loadGitHubBranchDiscovery = async () => {
    if (!githubOwner || !githubRepo) return;
    setDiscoveryLoading(true);
    try {
      const data = await discoverGitHubBranches(githubOwner, githubRepo);
      setGithubBranches(data.branches);
      setGithubSuggestions(data.suggestions);
      setGithubBase(data.defaultBranch);
      if (data.suggestions.length > 0) {
        setGithubHead(data.suggestions[0].head);
      }
    } catch (err) {
      console.error("Failed to discover GitHub branches:", err);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const loadDirectory = async (path?: string) => {
    try {
      const data = await listDirs(path);
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setDirectories(data.directories);
      setIsGitRepo(data.isGitRepo);
    } catch (err) {
      console.error("Failed to load directory:", err);
    }
  };

  const loadBranchDiscovery = async () => {
    if (!currentPath) return;
    setDiscoveryLoading(true);
    try {
      const data = await discoverBranches(currentPath);
      setBranches(data.branches);
      setSuggestions(data.suggestions);
      setDefaultBranch(data.defaultBranch);
      setBase(data.defaultBranch);
      setBrowseBranch(data.defaultBranch);
    } catch (err) {
      console.error("Failed to discover branches:", err);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const handleSelectDir = (dir: DirectoryEntry) => {
    if (dir.isGitRepo) {
      setCurrentPath(dir.path);
      setIsGitRepo(true);
      setBrowserOpen(false);
    } else {
      loadDirectory(dir.path);
    }
  };

  const handleSelectSuggestion = (suggestion: BranchSuggestion) => {
    setBase(suggestion.base);
    setHead(suggestion.head);
    setBranchSelectorOpen(false);
  };

  const handleSelectBranch = (branch: BranchInfo, asHead: boolean) => {
    if (asHead) {
      setHead(branch.name);
    } else {
      setBase(branch.name);
    }
    setBranchSelectorOpen(false);
  };

  const handleSubmitLocal = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentPath.trim()) {
      if (actionMode === "browse" && onLoadBrowse) {
        onLoadBrowse(currentPath.trim(), browseBranch.trim());
      } else {
        onLoadLocal(currentPath.trim(), "branches", base.trim(), head.trim());
      }
    }
  };

  const handleSelectBrowseBranch = (branch: BranchInfo) => {
    setBrowseBranch(branch.name);
    setBranchSelectorOpen(false);
  };

  const handleSubmitGitHub = (e: React.FormEvent) => {
    e.preventDefault();
    if (githubMode === "pr") {
      const parsed = parseGitHubURL(githubUrl);
      if (parsed) {
        onLoadGitHub(parsed.owner, parsed.repo, parsed.prNumber);
      }
    } else if (githubMode === "branches" && onLoadGitHubBranches) {
      onLoadGitHubBranches(githubOwner, githubRepo, githubBase, githubHead);
    }
  };

  const handleGitHubSelectSuggestion = (suggestion: BranchSuggestion) => {
    setGithubBase(suggestion.base);
    setGithubHead(suggestion.head);
    setGithubBranchSelectorOpen(false);
  };

  const handleGitHubSelectBranch = (branch: BranchInfo, asHead: boolean) => {
    if (asHead) {
      setGithubHead(branch.name);
    } else {
      setGithubBase(branch.name);
    }
    setGithubBranchSelectorOpen(false);
  };

  return (
    <div className="repo-selector">
      {/* Source type tabs */}
      <div className="source-tabs">
        <button
          type="button"
          className={sourceType === "local" ? "active" : ""}
          onClick={() => setSourceType("local")}
        >
          Local Repository
        </button>
        <button
          type="button"
          className={sourceType === "github" ? "active" : ""}
          onClick={() => setSourceType("github")}
        >
          GitHub PR
        </button>
      </div>

      {sourceType === "local" && (
        <form onSubmit={handleSubmitLocal}>
          {/* Path selector */}
          <div className="form-row path-row">
            <label>
              <span>Repository:</span>
              <div className="path-input-group">
                <input
                  type="text"
                  value={currentPath}
                  onChange={(e) => setCurrentPath(e.target.value)}
                  placeholder="Click Browse to select a folder"
                  readOnly
                />
                <button
                  type="button"
                  className="browse-button"
                  onClick={() => {
                    setBrowserOpen(!browserOpen);
                    if (!browserOpen) loadDirectory(currentPath || undefined);
                  }}
                >
                  {browserOpen ? "Close" : "Browse"}
                </button>
              </div>
            </label>
            {isGitRepo && currentPath && (
              <span className="git-badge">Git repo</span>
            )}
          </div>

          {/* Folder browser */}
          {browserOpen && (
            <div className="folder-browser">
              <div className="browser-header">
                <button
                  type="button"
                  className="nav-button"
                  onClick={() => loadDirectory(parentPath)}
                  disabled={currentPath === parentPath}
                >
                  ^ Parent
                </button>
                <span className="current-path">{currentPath}</span>
              </div>
              <div className="browser-list">
                {directories.length === 0 ? (
                  <div className="browser-empty">No subdirectories</div>
                ) : (
                  directories.map((dir) => (
                    <div
                      key={dir.path}
                      className={`browser-item ${dir.isGitRepo ? "is-git" : ""}`}
                      onClick={() => handleSelectDir(dir)}
                    >
                      <span className="folder-icon">{dir.isGitRepo ? "📦" : "📁"}</span>
                      <span className="folder-name">{dir.name}</span>
                      {dir.isGitRepo && <span className="git-tag">git</span>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Action mode selector */}
          {isGitRepo && (
            <div className="action-mode-selector">
              <div
                className={`action-mode-card ${actionMode === "browse" ? "active" : ""}`}
                onClick={() => setActionMode("browse")}
              >
                <div className="action-mode-icon">📖</div>
                <div className="action-mode-content">
                  <div className="action-mode-title">Browse a branch</div>
                  <div className="action-mode-desc">View code and intents on a single branch</div>
                </div>
              </div>
              <div
                className={`action-mode-card ${actionMode === "compare" ? "active" : ""}`}
                onClick={() => setActionMode("compare")}
              >
                <div className="action-mode-icon">🔀</div>
                <div className="action-mode-content">
                  <div className="action-mode-title">Compare branches</div>
                  <div className="action-mode-desc">View diff between two branches with intents</div>
                </div>
              </div>
            </div>
          )}

          {/* Browse mode: single branch selector */}
          {isGitRepo && actionMode === "browse" && (
            <>
              <div className="form-row">
                <label>
                  <span>Branch:</span>
                  <div className="branch-input-group">
                    <input
                      type="text"
                      value={browseBranch}
                      onChange={(e) => setBrowseBranch(e.target.value)}
                      placeholder="main"
                    />
                    {branches.length > 0 && (
                      <button
                        type="button"
                        className="branch-dropdown-btn"
                        onClick={() => setBranchSelectorOpen(!branchSelectorOpen)}
                      >
                        ▼
                      </button>
                    )}
                  </div>
                </label>
              </div>

              {/* Branch selector dropdown for browse */}
              {branchSelectorOpen && branches.length > 0 && (
                <div className="branch-selector-dropdown">
                  <div className="branch-selector-header">Select branch</div>
                  <div className="branch-list">
                    {branches.map((branch) => (
                      <div
                        key={branch.name}
                        className={`branch-item ${branch.isDefault ? "default" : ""} ${branch.isCurrent ? "current" : ""}`}
                        onClick={() => handleSelectBrowseBranch(branch)}
                      >
                        <div className="branch-item-main">
                          <span className="branch-name">{branch.name}</span>
                          {branch.hasIntents && (
                            <span className="intent-badge">{branch.intentCount}</span>
                          )}
                          {branch.isDefault && <span className="default-badge">default</span>}
                          {branch.isCurrent && <span className="current-badge">*</span>}
                        </div>
                        <div className="branch-item-meta">
                          <span className="branch-time">{branch.lastCommit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-row">
                <button
                  type="submit"
                  className="load-button"
                  disabled={loading || !currentPath.trim() || !isGitRepo || !onLoadBrowse}
                >
                  {loading ? "Loading..." : "Browse Branch"}
                </button>
              </div>
            </>
          )}

          {/* Compare mode: two branches */}
          {isGitRepo && actionMode === "compare" && (
            <>
              {/* Quick suggestions */}
              {suggestions.length > 0 && (
                <div className="branch-suggestions">
                  <div className="suggestions-header">
                    <span className="suggestions-title">Quick Compare</span>
                    {discoveryLoading && <span className="discovery-loading">...</span>}
                  </div>
                  <div className="suggestions-list">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className="suggestion-chip"
                        onClick={() => handleSelectSuggestion(s)}
                      >
                        <span className="suggestion-name">{s.head}</span>
                        {s.hasIntents && (
                          <span className="intent-badge" title={`${s.intentCount} intents`}>
                            {s.intentCount}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Branch inputs */}
              <div className="form-row form-row-inline branch-inputs">
                <label>
                  <span>Base:</span>
                  <div className="branch-input-group">
                    <input
                      type="text"
                      value={base}
                      onChange={(e) => setBase(e.target.value)}
                      placeholder="main"
                    />
                    {branches.length > 0 && (
                      <button
                        type="button"
                        className="branch-dropdown-btn"
                        onClick={() => setBranchSelectorOpen(!branchSelectorOpen)}
                      >
                        ▼
                      </button>
                    )}
                  </div>
                </label>
                <span className="branch-arrow">→</span>
                <label>
                  <span>Head:</span>
                  <div className="branch-input-group">
                    <input
                      type="text"
                      value={head}
                      onChange={(e) => setHead(e.target.value)}
                      placeholder="HEAD"
                    />
                  </div>
                </label>
              </div>

              {/* Branch selector dropdown */}
              {branchSelectorOpen && branches.length > 0 && (
                <div className="branch-selector-dropdown">
                  <div className="branch-selector-header">Select branch</div>
                  <div className="branch-list">
                    {branches.map((branch) => (
                      <div
                        key={branch.name}
                        className={`branch-item ${branch.isDefault ? "default" : ""} ${branch.isCurrent ? "current" : ""}`}
                        onClick={() => handleSelectBranch(branch, true)}
                      >
                        <div className="branch-item-main">
                          <span className="branch-name">{branch.name}</span>
                          {branch.hasIntents && (
                            <span className="intent-badge">{branch.intentCount}</span>
                          )}
                          {branch.isDefault && <span className="default-badge">default</span>}
                          {branch.isCurrent && <span className="current-badge">*</span>}
                        </div>
                        <div className="branch-item-meta">
                          <span className="branch-time">{branch.lastCommit}</span>
                          {branch.aheadBehind && (
                            <span className="branch-ahead-behind">
                              {branch.aheadBehind.ahead > 0 && `+${branch.aheadBehind.ahead}`}
                              {branch.aheadBehind.behind > 0 && ` -${branch.aheadBehind.behind}`}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-row">
                <button
                  type="submit"
                  className="load-button"
                  disabled={loading || !currentPath.trim() || !isGitRepo}
                >
                  {loading ? "Loading..." : "Compare Branches"}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {sourceType === "github" && (
        <form onSubmit={handleSubmitGitHub}>
          <div className="form-row">
            <label>
              <span>GitHub URL:</span>
              <input
                type="text"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/owner/repo or .../pull/123"
              />
            </label>
            {githubOwner && githubRepo && (
              <span className="git-badge">
                {githubMode === "pr" ? "PR" : "Repo"}
              </span>
            )}
          </div>

          {/* GitHub Branches mode UI */}
          {githubMode === "branches" && githubOwner && githubRepo && (
            <>
              {/* Quick suggestions */}
              {githubSuggestions.length > 0 && (
                <div className="branch-suggestions">
                  <div className="suggestions-header">
                    <span className="suggestions-title">Quick Compare</span>
                    {discoveryLoading && <span className="discovery-loading">...</span>}
                  </div>
                  <div className="suggestions-list">
                    {githubSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className="suggestion-chip"
                        onClick={() => handleGitHubSelectSuggestion(s)}
                      >
                        <span className="suggestion-name">{s.head}</span>
                        {s.hasIntents && (
                          <span className="intent-badge" title={`${s.intentCount} intents`}>
                            {s.intentCount}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Branch inputs */}
              <div className="form-row form-row-inline branch-inputs">
                <label>
                  <span>Base:</span>
                  <div className="branch-input-group">
                    <input
                      type="text"
                      value={githubBase}
                      onChange={(e) => setGithubBase(e.target.value)}
                      placeholder="main"
                    />
                    {githubBranches.length > 0 && (
                      <button
                        type="button"
                        className="branch-dropdown-btn"
                        onClick={() => setGithubBranchSelectorOpen(!githubBranchSelectorOpen)}
                      >
                        ▼
                      </button>
                    )}
                  </div>
                </label>
                <span className="branch-arrow">→</span>
                <label>
                  <span>Head:</span>
                  <div className="branch-input-group">
                    <input
                      type="text"
                      value={githubHead}
                      onChange={(e) => setGithubHead(e.target.value)}
                      placeholder="feature-branch"
                    />
                  </div>
                </label>
              </div>

              {/* Branch selector dropdown */}
              {githubBranchSelectorOpen && githubBranches.length > 0 && (
                <div className="branch-selector-dropdown">
                  <div className="branch-selector-header">Select branch</div>
                  <div className="branch-list">
                    {githubBranches.map((branch) => (
                      <div
                        key={branch.name}
                        className={`branch-item ${branch.isDefault ? "default" : ""}`}
                        onClick={() => handleGitHubSelectBranch(branch, true)}
                      >
                        <div className="branch-item-main">
                          <span className="branch-name">{branch.name}</span>
                          {branch.hasIntents && (
                            <span className="intent-badge">{branch.intentCount}</span>
                          )}
                          {branch.isDefault && <span className="default-badge">default</span>}
                        </div>
                        <div className="branch-item-meta">
                          <span className="branch-time">{branch.lastCommit}</span>
                          {branch.aheadBehind && (
                            <span className="branch-ahead-behind">
                              {branch.aheadBehind.ahead > 0 && `+${branch.aheadBehind.ahead}`}
                              {branch.aheadBehind.behind > 0 && ` -${branch.aheadBehind.behind}`}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="form-row">
            <button
              type="submit"
              className="load-button"
              disabled={
                loading ||
                (githubMode === "pr" && !parseGitHubURL(githubUrl)) ||
                (githubMode === "branches" && (!githubHead || !onLoadGitHubBranches))
              }
            >
              {loading ? "Loading..." : githubMode === "pr" ? "Load PR" : "Load Diff"}
            </button>
          </div>
        </form>
      )}

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
