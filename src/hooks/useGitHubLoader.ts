import { useState, useRef, useCallback } from "react";
import { parseDiff } from "../lib/parseDiff";
import type { DiffFile } from "../lib/parseDiff";
import {
  fetchGitHubPR,
  fetchGitHubBranchesDiff,
  fetchGitHubBrowse,
  AuthRequiredError,
  AppNotInstalledError,
} from "../lib/api";
import type { IntentV2API, RepoInfo } from "../lib/api";
import type { Language } from "../lib/language";
import type { FileData, DiffContext, ViewMode, AuthInfo } from "../types";
import { loginWithGitHub } from "../lib/auth";
import { getFileName } from "../lib/fileUtils";

interface AppInstallError {
  message: string;
  installUrl: string;
  owner: string;
}

interface GitHubLoaderState {
  files: FileData[];
  intentsV2: IntentV2API[];
  changedFiles: string[];
  allFileContents: Record<string, string>;
  repoInfo: RepoInfo | null;
  diffContext: DiffContext | null;
  viewMode: ViewMode;
  loading: boolean;
  loadingContext: string | null;
  error: string | null;
  needsAuth: boolean;
  appInstallError: AppInstallError | null;
}

interface LoadPRParams {
  owner: string;
  repo: string;
  prNumber: number;
}

interface LoadBranchesParams {
  owner: string;
  repo: string;
  base: string;
  head: string;
}

interface LoadBrowseParams {
  owner: string;
  repo: string;
  branch: string;
}

type LastLoadParams =
  | { type: "pr"; params: LoadPRParams }
  | { type: "branches"; params: LoadBranchesParams }
  | { type: "browse"; params: LoadBrowseParams }
  | null;

export function useGitHubLoader(lang: Language) {
  const [state, setState] = useState<GitHubLoaderState>({
    files: [],
    intentsV2: [],
    changedFiles: [],
    allFileContents: {},
    repoInfo: null,
    diffContext: null,
    viewMode: "diff",
    loading: false,
    loadingContext: null,
    error: null,
    needsAuth: false,
    appInstallError: null,
  });

  // Single ref to track last load for language reload
  const lastLoadRef = useRef<LastLoadParams>(null);
  // Track current view mode for browse reload
  const currentViewModeRef = useRef<ViewMode>("browse");

  const setPartialState = (partial: Partial<GitHubLoaderState>) => {
    setState(prev => ({ ...prev, ...partial }));
  };

  // Parse diff files into FileData array
  const parseDiffToFileData = (
    diffFiles: DiffFile[],
    fileContents?: Record<string, string>
  ): FileData[] => {
    return diffFiles.map((diffFile) => {
      const filePath = diffFile.newPath || diffFile.oldPath || "";
      const filename = getFileName(filePath);
      const fullFileContent = fileContents?.[filePath];
      return { diff: diffFile, filename, fullFileContent };
    });
  };

  // Handle GitHub-specific errors
  const handleGitHubError = (err: unknown, defaultMessage: string) => {
    if (err instanceof AppNotInstalledError) {
      setPartialState({
        appInstallError: {
          message: err.message,
          installUrl: err.installUrl,
          owner: err.owner,
        },
        needsAuth: false,
        error: null,
        loading: false,
      });
    } else if (err instanceof AuthRequiredError) {
      setPartialState({
        needsAuth: true,
        appInstallError: null,
        error: err.message,
        loading: false,
      });
    } else {
      setPartialState({
        needsAuth: false,
        appInstallError: null,
        error: err instanceof Error ? err.message : defaultMessage,
        loading: false,
      });
    }
  };

  // Load from GitHub PR
  const loadPR = useCallback(async (
    owner: string,
    repo: string,
    prNumber: number,
    langOverride?: Language
  ) => {
    setPartialState({
      loading: true,
      loadingContext: "github-pr",
      error: null,
      appInstallError: null,
      diffContext: { type: "github-pr", owner, repo, prNumber },
    });

    lastLoadRef.current = { type: "pr", params: { owner, repo, prNumber } };

    try {
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchGitHubPR(owner, repo, prNumber, langParam);
      const diffFiles = parseDiff(response.diff);

      setPartialState({
        files: parseDiffToFileData(diffFiles, response.fileContents),
        intentsV2: response.intentsV2 || [],
        changedFiles: response.changedFiles || [],
        allFileContents: response.fileContents || {},
        viewMode: "diff",
        loading: false,
      });
    } catch (err) {
      handleGitHubError(err, "Failed to load GitHub PR");
    }
  }, [lang]);

  // Load from GitHub branches comparison
  const loadBranches = useCallback(async (
    owner: string,
    repo: string,
    base: string,
    head: string,
    langOverride?: Language
  ) => {
    setPartialState({
      loading: true,
      loadingContext: "github-branches",
      error: null,
      diffContext: { type: "github-branches", base, head, owner, repo },
    });

    lastLoadRef.current = { type: "branches", params: { owner, repo, base, head } };

    try {
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchGitHubBranchesDiff(owner, repo, base, head, langParam);
      const diffFiles = parseDiff(response.diff);

      setPartialState({
        files: parseDiffToFileData(diffFiles, response.fileContents),
        intentsV2: response.intentsV2 || [],
        changedFiles: response.changedFiles || [],
        allFileContents: response.fileContents || {},
        viewMode: "diff",
        loading: false,
      });
    } catch (err) {
      setPartialState({
        error: err instanceof Error ? err.message : "Failed to load GitHub branches diff",
        loading: false,
      });
    }
  }, [lang]);

  // Load from GitHub browse mode
  const loadBrowse = useCallback(async (
    owner: string,
    repo: string,
    branch: string,
    langOverride?: Language,
    preserveViewMode?: boolean
  ) => {
    const newViewMode = preserveViewMode ? currentViewModeRef.current : "browse";

    setPartialState({
      loading: true,
      loadingContext: "github-browse",
      error: null,
      diffContext: { type: "github-browse", head: branch, owner, repo },
      viewMode: newViewMode,
    });

    lastLoadRef.current = { type: "browse", params: { owner, repo, branch } };
    currentViewModeRef.current = newViewMode;

    try {
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchGitHubBrowse(owner, repo, branch, langParam);

      // Create file data for each file in intents
      const files: FileData[] = response.files.map((filePath) => {
        const filename = getFileName(filePath);
        const fullFileContent = response.fileContents?.[filePath];
        const diff: DiffFile = {
          oldPath: filePath,
          newPath: filePath,
          hunks: [],
        };
        return { diff, filename, fullFileContent };
      });

      setPartialState({
        files,
        intentsV2: response.intentsV2 || [],
        changedFiles: response.files || [],
        repoInfo: response.repoInfo || null,
        loading: false,
      });
    } catch (err) {
      setPartialState({
        error: err instanceof Error ? err.message : "Failed to browse GitHub repository",
        loading: false,
      });
    }
  }, [lang]);

  // Set view mode (for switching between browse/story)
  const setViewMode = useCallback((mode: ViewMode) => {
    currentViewModeRef.current = mode;
    setPartialState({ viewMode: mode });
  }, []);

  // Reload with new language
  const reloadWithLang = useCallback((newLang: Language) => {
    const last = lastLoadRef.current;
    if (!last) return;

    switch (last.type) {
      case "pr":
        loadPR(last.params.owner, last.params.repo, last.params.prNumber, newLang);
        break;
      case "branches":
        loadBranches(last.params.owner, last.params.repo, last.params.base, last.params.head, newLang);
        break;
      case "browse":
        // Preserve view mode (story or browse) when reloading for language change
        loadBrowse(last.params.owner, last.params.repo, last.params.branch, newLang, true);
        break;
    }
  }, [loadPR, loadBranches, loadBrowse]);

  // Check if this loader has active data
  const isActive = lastLoadRef.current !== null;

  // Clear state
  const clear = useCallback(() => {
    lastLoadRef.current = null;
    currentViewModeRef.current = "browse";
    setState({
      files: [],
      intentsV2: [],
      changedFiles: [],
      allFileContents: {},
      repoInfo: null,
      diffContext: null,
      viewMode: "diff",
      loading: false,
      loadingContext: null,
      error: null,
      needsAuth: false,
      appInstallError: null,
    });
  }, []);

  // Get GitHub URL from current context
  const getGitHubUrl = useCallback((): string | null => {
    const { diffContext } = state;
    if (!diffContext) return null;
    const { owner, repo, prNumber, base, head } = diffContext;
    if (owner && repo) {
      if (prNumber) {
        return `https://github.com/${owner}/${repo}/pull/${prNumber}`;
      }
      if (base && head) {
        return `https://github.com/${owner}/${repo}/compare/${base}...${head}`;
      }
      return `https://github.com/${owner}/${repo}`;
    }
    return null;
  }, [state.diffContext]);

  // Build provider-agnostic auth info
  const authInfo: AuthInfo | null = (state.needsAuth || state.appInstallError) ? {
    needsAuth: state.needsAuth,
    providerName: 'GitHub',
    providerIcon: 'github',
    loginAction: () => loginWithGitHub(window.location.pathname),
    loginLabel: {
      en: 'Login with GitHub',
      fr: 'Se connecter avec GitHub',
      es: 'Iniciar sesión con GitHub',
      de: 'Mit GitHub anmelden',
    },
    loginDesc: {
      en: 'This repository may be private. Please login with GitHub to access it.',
      fr: 'Ce dépôt est peut-être privé. Connectez-vous avec GitHub pour y accéder.',
      es: 'Este repositorio puede ser privado. Inicie sesión con GitHub para acceder.',
      de: 'Dieses Repository ist möglicherweise privat. Bitte melden Sie sich mit GitHub an.',
    },
    installError: state.appInstallError ? {
      title: {
        en: 'GitHub App Installation Required',
        fr: 'Installation de l\'application GitHub requise',
        es: 'Se requiere instalación de la aplicación GitHub',
        de: 'GitHub App Installation erforderlich',
      },
      message: state.appInstallError.message,
      hint: {
        en: 'Click the button below to install the app. You\'ll be able to select which repositories to grant access to.',
        fr: 'Cliquez sur le bouton ci-dessous pour installer l\'application. Vous pourrez ensuite sélectionner les dépôts auxquels accorder l\'accès.',
        es: 'Haga clic en el botón de abajo para instalar la aplicación. Podrá seleccionar a qué repositorios otorgar acceso.',
        de: 'Klicken Sie auf die Schaltfläche unten, um die App zu installieren. Sie können dann auswählen, welchen Repositories Zugriff gewährt werden soll.',
      },
      actionUrl: state.appInstallError.installUrl,
      actionLabel: {
        en: 'Install on GitHub',
        fr: 'Installer sur GitHub',
        es: 'Instalar en GitHub',
        de: 'Auf GitHub installieren',
      },
      icon: 'github',
    } : null,
  } : null;

  return {
    ...state,
    loadPR,
    loadBranches,
    loadBrowse,
    setViewMode,
    reloadWithLang,
    isActive,
    clear,
    authInfo,
    getGitHubUrl,
  };
}
