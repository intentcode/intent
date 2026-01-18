import { useState, useEffect, useCallback, useMemo } from 'react';

export interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  isNew?: boolean;
  children: TreeNode[];
}

interface FileData {
  filename: string;
  diff: {
    oldPath?: string;
    newPath?: string;
  };
}

interface UseFileTreeReturn {
  tree: TreeNode[];
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  isExpanded: (path: string) => boolean;
}

/**
 * Builds a hierarchical file tree from a flat list of files
 * Collapses single-child folders (e.g., src/components -> src/components)
 * Sorts folders first, then files, alphabetically
 */
function buildFileTree(files: FileData[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const filePath = file.diff.newPath || file.diff.oldPath || file.filename;
    if (!filePath || filePath.trim() === '') continue;

    const parts = filePath.split('/').filter(p => p.length > 0);
    if (parts.length === 0) continue;

    const isNew = file.diff?.oldPath === "/dev/null" || !file.diff?.oldPath;

    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      let existing = currentLevel.find(n => n.name === part);
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          isFile,
          isNew: isFile ? isNew : undefined,
          children: [],
        };
        currentLevel.push(existing);
      }
      currentLevel = existing.children;
    }
  }

  // Collapse folders with single folder child
  const collapseNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.map(node => {
      if (!node.isFile) {
        node.children = collapseNodes(node.children);
        while (node.children.length === 1 && !node.children[0].isFile) {
          const child = node.children[0];
          node.name = `${node.name}/${child.name}`;
          node.path = child.path;
          node.children = child.children;
        }
      }
      return node;
    });
  };

  // Sort: folders first, then files, alphabetically
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .map(n => ({ ...n, children: sortNodes(n.children) }))
      .sort((a, b) => {
        if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  };

  return sortNodes(collapseNodes(root));
}

/**
 * Collects all folder paths from a tree
 */
function collectFolderPaths(nodes: TreeNode[]): Set<string> {
  const paths = new Set<string>();

  const collect = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (!node.isFile) {
        paths.add(node.path);
        collect(node.children);
      }
    }
  };

  collect(nodes);
  return paths;
}

/**
 * Hook for managing file tree state
 * Handles building tree, folder expansion/collapse
 */
export function useFileTree(files: FileData[]): UseFileTreeReturn {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Memoize tree building
  const tree = useMemo(() => buildFileTree(files), [files]);

  // Auto-expand all folders when files change
  useEffect(() => {
    if (files.length > 0) {
      const allPaths = collectFolderPaths(tree);
      setExpandedFolders(allPaths);
    }
  }, [files, tree]);

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

  const expandAll = useCallback(() => {
    const allPaths = collectFolderPaths(tree);
    setExpandedFolders(allPaths);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  const isExpanded = useCallback((path: string) => {
    return expandedFolders.has(path);
  }, [expandedFolders]);

  return {
    tree,
    expandedFolders,
    toggleFolder,
    expandAll,
    collapseAll,
    isExpanded,
  };
}

// Re-export buildFileTree for testing
export { buildFileTree };
