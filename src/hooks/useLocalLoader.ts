import { useState, useRef, useCallback } from "react";
import { parseDiff } from "../lib/parseDiff";
import type { DiffFile } from "../lib/parseDiff";
import { fetchDiff, fetchBrowse } from "../lib/api";
import type { DiffMode, IntentV2API } from "../lib/api";
import type { Language } from "../lib/language";
import type { FileData, DiffContext, ViewMode, AuthInfo } from "../types";
import { getFileName } from "../lib/fileUtils";

interface LocalLoaderState {
  files: FileData[];
  intentsV2: IntentV2API[];
  changedFiles: string[];
  allFileContents: Record<string, string>;
  diffContext: DiffContext | null;
  viewMode: ViewMode;
  loading: boolean;
  loadingContext: string | null;
  error: string | null;
}

interface LoadDiffParams {
  repoPath: string;
  diffMode: DiffMode;
  base: string;
  head: string;
}

interface LoadBrowseParams {
  repoPath: string;
  branch: string;
}

type LastLoadParams =
  | { type: "diff"; params: LoadDiffParams }
  | { type: "browse"; params: LoadBrowseParams }
  | { type: "story"; params: LoadBrowseParams }
  | null;

export function useLocalLoader(lang: Language) {
  const [state, setState] = useState<LocalLoaderState>({
    files: [],
    intentsV2: [],
    changedFiles: [],
    allFileContents: {},
    diffContext: null,
    viewMode: "diff",
    loading: false,
    loadingContext: null,
    error: null,
  });

  // Single ref to track last load for language reload
  const lastLoadRef = useRef<LastLoadParams>(null);

  const setPartialState = (partial: Partial<LocalLoaderState>) => {
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

  // Load diff between branches
  const loadDiff = useCallback(async (
    repoPath: string,
    diffMode: DiffMode,
    base: string,
    head: string,
    langOverride?: Language
  ) => {
    setPartialState({
      loading: true,
      loadingContext: "diff",
      error: null,
      diffContext: { type: diffMode, base, head, repoPath },
    });

    lastLoadRef.current = { type: "diff", params: { repoPath, diffMode, base, head } };

    try {
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchDiff(repoPath, diffMode, base, head, langParam);
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
        error: err instanceof Error ? err.message : "Failed to load diff",
        loading: false,
      });
    }
  }, [lang]);

  // Load browse mode - view a single branch with intents
  const loadBrowse = useCallback(async (
    repoPath: string,
    branch: string,
    langOverride?: Language
  ) => {
    setPartialState({
      loading: true,
      loadingContext: "browse",
      error: null,
      diffContext: { type: "browse", head: branch, repoPath },
      viewMode: "browse",
    });

    lastLoadRef.current = { type: "browse", params: { repoPath, branch } };

    try {
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchBrowse(repoPath, branch, langParam);

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
        loading: false,
      });
    } catch (err) {
      setPartialState({
        error: err instanceof Error ? err.message : "Failed to browse branch",
        loading: false,
      });
    }
  }, [lang]);

  // Load story mode - view intents only as a narrative
  const loadStory = useCallback(async (
    repoPath: string,
    branch: string,
    langOverride?: Language
  ) => {
    setPartialState({
      loading: true,
      loadingContext: "story",
      error: null,
      diffContext: { type: "browse", head: branch, repoPath },
      viewMode: "story",
    });

    lastLoadRef.current = { type: "story", params: { repoPath, branch } };

    try {
      const currentLang = langOverride ?? lang;
      const langParam = currentLang === "en" ? undefined : currentLang;
      const response = await fetchBrowse(repoPath, branch, langParam);

      setPartialState({
        files: [],
        intentsV2: response.intentsV2 || [],
        changedFiles: [],
        loading: false,
      });
    } catch (err) {
      setPartialState({
        error: err instanceof Error ? err.message : "Failed to load story",
        loading: false,
      });
    }
  }, [lang]);

  // Reload with new language
  const reloadWithLang = useCallback((newLang: Language) => {
    const last = lastLoadRef.current;
    if (!last) return;

    switch (last.type) {
      case "diff":
        loadDiff(last.params.repoPath, last.params.diffMode, last.params.base, last.params.head, newLang);
        break;
      case "browse":
        loadBrowse(last.params.repoPath, last.params.branch, newLang);
        break;
      case "story":
        loadStory(last.params.repoPath, last.params.branch, newLang);
        break;
    }
  }, [loadDiff, loadBrowse, loadStory]);

  // Check if this loader has active data
  const isActive = lastLoadRef.current !== null;

  // Clear state
  const clear = useCallback(() => {
    lastLoadRef.current = null;
    setState({
      files: [],
      intentsV2: [],
      changedFiles: [],
      allFileContents: {},
      diffContext: null,
      viewMode: "diff",
      loading: false,
      loadingContext: null,
      error: null,
    });
  }, []);

  // Local mode doesn't need auth
  const authInfo: AuthInfo | null = null;

  return {
    ...state,
    loadDiff,
    loadBrowse,
    loadStory,
    reloadWithLang,
    isActive,
    clear,
    authInfo,
  };
}
