import { memo, useMemo } from 'react';
import type { IntentV2API, TranslateFunction, TreeNode } from '../../types';
import { buildFileTree } from '../../hooks/useFileTree';
import { useFilesContext, useSelectionContext } from '../../contexts';
import './Sidebar.css';

interface SidebarProps {
  // Data from parent (not in context)
  intents: IntentV2API[];
  changedFiles: string[];
  // Visibility tracking (changes too often for context)
  currentVisibleFile: string | null;
  onFileClick: (filename: string) => void;
  // Mode and translations
  mode: 'browse' | 'diff';
  t: TranslateFunction;
}

/**
 * Sidebar with file tree and intent list
 * Uses FilesContext and SelectionContext for shared state
 * Memoized to prevent unnecessary re-renders
 */
export const Sidebar = memo(function Sidebar({
  intents,
  changedFiles,
  currentVisibleFile,
  onFileClick,
  mode,
  t,
}: SidebarProps) {
  // Get file state from context
  const { filteredFiles, hideIntentFiles, toggleHideIntentFiles } = useFilesContext();

  // Get selection state from context
  const {
    selectedIntentId,
    setSelectedIntentId,
    expandedFolders,
    toggleFolder,
    expandAll,
    collapseAll,
  } = useSelectionContext();

  // Memoize tree building - expensive O(n log n) operation
  const tree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);

  const countFiles = (nodes: TreeNode[]): number => {
    return nodes.reduce((acc, node) => {
      if (node.isFile) return acc + 1;
      return acc + countFiles(node.children);
    }, 0);
  };

  const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.path);
    const indent = depth * 16;

    if (node.isFile) {
      const isCurrent = currentVisibleFile === node.name;
      return (
        <div
          key={node.path}
          className={`tree-file ${node.isNew ? "added" : "modified"} ${isCurrent ? "current" : ""}`}
          style={{ paddingLeft: `${indent + 20}px` }}
          onClick={() => onFileClick(node.name)}
        >
          <span className={`tree-file-badge ${node.isNew ? "badge-added" : "badge-modified"}`}>
            {node.isNew ? "+" : "M"}
          </span>
          <span className="tree-file-name">{node.name}</span>
          {isCurrent && <span className="tree-file-current-indicator">●</span>}
        </div>
      );
    }

    const fileCount = countFiles(node.children);
    return (
      <div key={node.path} className="tree-folder">
        <div
          className={`tree-folder-header ${isExpanded ? 'expanded' : ''}`}
          style={{ paddingLeft: `${indent}px` }}
          onClick={() => toggleFolder(node.path)}
        >
          <span className={`tree-chevron ${isExpanded ? 'expanded' : ''}`}>▶</span>
          <span className="tree-folder-icon">📁</span>
          <span className="tree-folder-name">{node.name}</span>
          <span className="tree-folder-count">{fileCount}</span>
        </div>
        {isExpanded && (
          <div className="tree-folder-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="files-sidebar">
      {/* File tree header */}
      <div className="sidebar-title-row">
        <span className="sidebar-title">
          {mode === 'browse' ? t('documentedFiles') : t('modifiedFiles')}
        </span>
        {mode === 'diff' && (
          <div className="tree-actions">
            <button
              className={`tree-action-btn intent-toggle ${hideIntentFiles ? 'hidden' : 'visible'}`}
              onClick={toggleHideIntentFiles}
              data-tooltip={hideIntentFiles ? t('showIntentFiles') : t('hideIntentFiles')}
            >
              <span className="toggle-icon">{hideIntentFiles ? '📄' : '📝'}</span>
            </button>
            <button
              className="tree-action-btn"
              onClick={expandAll}
              data-tooltip={t('expandAll')}
            >
              ▼
            </button>
            <button
              className="tree-action-btn"
              onClick={collapseAll}
              data-tooltip={t('collapseAll')}
            >
              ▶
            </button>
          </div>
        )}
      </div>

      {/* File tree */}
      <div className="file-tree">
        {mode === 'browse' ? (
          // Browse mode: simple list of documented files
          intents.map((intent, i) => (
            intent.frontmatter.files.map((file, j) => (
              <div
                key={`${i}-${j}`}
                className="tree-file documented"
                onClick={() => {
                  const el = document.getElementById(`intent-file-${i}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <span className="tree-file-icon">📄</span>
                {file.split('/').pop()}
              </div>
            ))
          ))
        ) : (
          // Diff mode: full tree
          tree.map((node) => renderNode(node, 0))
        )}
      </div>

      {/* Intents list (diff mode only) */}
      {mode === 'diff' && intents.length > 0 && (
        <div className="sidebar-intents">
          <div className="sidebar-title">
            Intents ({intents.length})
            {selectedIntentId && (
              <button
                className="clear-selection-btn"
                onClick={() => setSelectedIntentId(null)}
                title="Clear selection"
              >
                ✕
              </button>
            )}
          </div>
          <div className="intents-list">
            {intents.map((intent) => {
              const isSelected = selectedIntentId === intent.frontmatter.id;
              const linkedFiles = [...new Set(
                intent.resolvedChunks
                  .filter(c => c.resolved && c.resolvedFile)
                  .map(c => c.resolvedFile!)
                  .filter(f => changedFiles.some(cf => cf.includes(f) || f.includes(cf)))
              )];
              const totalChunks = intent.resolvedChunks.filter(c => c.resolved).length;
              const staleCount = intent.resolvedChunks.filter(c =>
                c.resolved !== null && c.hashMatch === false
              ).length;

              return (
                <div
                  key={intent.frontmatter.id}
                  className={`intent-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedIntentId(isSelected ? null : intent.frontmatter.id)}
                >
                  <div className="intent-item-header">
                    <span className="intent-item-id">#{intent.frontmatter.id}</span>
                    {intent.frontmatter.risk && (
                      <span className={`risk-dot risk-${intent.frontmatter.risk}`} title={intent.frontmatter.risk} />
                    )}
                    {staleCount > 0 && (
                      <span className="stale-dot" title={`${staleCount} ${t('stale').toLowerCase()}`} />
                    )}
                  </div>
                  <div className="intent-item-title">{intent.title}</div>
                  <div className="intent-item-meta">
                    {totalChunks} chunk{totalChunks !== 1 ? 's' : ''}
                    {staleCount > 0 && <span className="meta-stale"> · {staleCount} {t('stale').toLowerCase()}</span>}
                  </div>
                  {linkedFiles.length > 0 && (
                    <div className="intent-item-files">
                      {linkedFiles.map((f, idx) => (
                        <span key={idx} className="intent-file-tag">{f.split('/').pop()}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
