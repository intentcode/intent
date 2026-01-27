import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import type { FileData } from '../types';
import { getFilePath, isIntentFile } from '../lib/fileUtils';

interface FilesContextType {
  // Raw files from loader
  files: FileData[];
  // Files after filtering .intent/
  filteredFiles: FileData[];
  // Filter state
  hideIntentFiles: boolean;
  toggleHideIntentFiles: () => void;
}

const FilesContext = createContext<FilesContextType | null>(null);

interface FilesProviderProps {
  children: ReactNode;
  files: FileData[];
}

/**
 * Provider for file-related state
 * Changes rarely: only when files load or filter toggles
 */
export function FilesProvider({ children, files }: FilesProviderProps) {
  const [hideIntentFiles, setHideIntentFiles] = useState(true);

  // Filter out .intent/ files when toggle is on
  const filteredFiles = useMemo(() => {
    if (!hideIntentFiles) return files;
    return files.filter(file => !isIntentFile(getFilePath(file)));
  }, [files, hideIntentFiles]);

  const toggleHideIntentFiles = () => {
    setHideIntentFiles(prev => !prev);
  };

  const value = useMemo<FilesContextType>(() => ({
    files,
    filteredFiles,
    hideIntentFiles,
    toggleHideIntentFiles,
  }), [files, filteredFiles, hideIntentFiles]);

  return (
    <FilesContext.Provider value={value}>
      {children}
    </FilesContext.Provider>
  );
}

/**
 * Hook to access files context
 * @throws Error if used outside FilesProvider
 */
export function useFilesContext(): FilesContextType {
  const context = useContext(FilesContext);
  if (!context) {
    throw new Error('useFilesContext must be used within a FilesProvider');
  }
  return context;
}
