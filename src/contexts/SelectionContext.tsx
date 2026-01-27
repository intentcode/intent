import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import type { FileData, TreeNode } from '../types';
import { buildFileTree } from '../hooks/useFileTree';

interface SelectionContextType {
  // Selected intent
  selectedIntentId: string | null;
  setSelectedIntentId: (id: string | null) => void;

  // Expanded folders in file tree
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
}

const SelectionContext = createContext<SelectionContextType | null>(null);

interface SelectionProviderProps {
  children: ReactNode;
  files: FileData[]; // Needed to compute all folder paths for expandAll
}

/**
 * Provider for selection-related state
 * Changes sometimes: when user clicks on intents or folders
 */
export function SelectionProvider({ children, files }: SelectionProviderProps) {
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Toggle single folder
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Expand all folders
  const expandAll = useCallback(() => {
    const tree = buildFileTree(files);
    const paths = new Set<string>();

    const collectPaths = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (!node.isFile) {
          paths.add(node.path);
          collectPaths(node.children);
        }
      }
    };

    collectPaths(tree);
    setExpandedFolders(paths);
  }, [files]);

  // Collapse all folders
  const collapseAll = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  // Auto-expand all folders when files change
  useEffect(() => {
    if (files.length > 0) {
      expandAll();
    }
  }, [files, expandAll]);

  const value = useMemo<SelectionContextType>(() => ({
    selectedIntentId,
    setSelectedIntentId,
    expandedFolders,
    toggleFolder,
    expandAll,
    collapseAll,
  }), [selectedIntentId, expandedFolders, toggleFolder, expandAll, collapseAll]);

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

/**
 * Hook to access selection context
 * @throws Error if used outside SelectionProvider
 */
export function useSelectionContext(): SelectionContextType {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelectionContext must be used within a SelectionProvider');
  }
  return context;
}
