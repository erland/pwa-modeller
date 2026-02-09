import { useMemo, useState } from 'react';
import type { Key } from '@react-types/shared';
import { Button, Tree, TreeItem, TreeItemContent } from 'react-aria-components';

import type { NavNode } from '../navigation/types';

import '../../styles/navigator.css';

type Props = {
  treeData: NavNode[];

  /** Optional controlled selection. Uses node.id (e.g. "folder:<id>"). */
  selectedNodeId?: string | null;
  onSelectedNodeIdChange?: (nodeId: string | null) => void;

  /** Optional controlled expansion. Keys are node.id values. */
  expandedNodeIds?: Set<Key>;
  onExpandedNodeIdsChange?: (expanded: Set<Key>) => void;

  /** Called when a row is activated (click/keyboard selection). */
  onActivateNode?: (node: NavNode) => void;

  /** Optional: show a tiny hint badge when a view node matches this id. */
  activeViewId?: string;

  /** Optional: show a filter input above the tree. */
  showFilter?: boolean;
};

function iconForNode(n: NavNode): string {
  switch (n.kind) {
    case 'folder':
      return '📁';
    case 'view':
      return '🗺️';
    case 'element':
      return '🔷';
  }
}

function nodeMatchesQuery(node: NavNode, q: string): boolean {
  if (!q) return true;
  const s = (node.label ?? '').toLowerCase();
  return s.includes(q);
}

function filterTree(nodes: NavNode[], q: string): NavNode[] {
  if (!q) return nodes;
  const out: NavNode[] = [];
  for (const n of nodes) {
    const kids = n.children ? filterTree(n.children, q) : [];
    if (nodeMatchesQuery(n, q) || kids.length) {
      out.push({ ...n, children: kids.length ? kids : undefined });
    }
  }
  return out;
}

function isExpandable(n: NavNode): boolean {
  return !!n.children && n.children.length > 0;
}

function collectExpandableKeysInSubtree(n: NavNode): string[] {
  const keys: string[] = [];
  if (isExpandable(n)) keys.push(n.id);
  if (n.children) {
    for (const c of n.children) keys.push(...collectExpandableKeysInSubtree(c));
  }
  return keys;
}

function findNodeById(nodes: NavNode[], id: string): NavNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const hit = findNodeById(n.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

export function PortalNavigationTree(props: Props) {
  const {
    treeData,
    onActivateNode,
    activeViewId,
    showFilter = true,
    selectedNodeId,
    onSelectedNodeIdChange,
    expandedNodeIds,
    onExpandedNodeIdsChange,
  } = props;

  const [filter, setFilter] = useState('');
  const [uncontrolledSelected, setUncontrolledSelected] = useState<string | null>(null);
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState<Set<Key>>(new Set());

  const sel = selectedNodeId !== undefined ? selectedNodeId : uncontrolledSelected;
  const exp = expandedNodeIds !== undefined ? expandedNodeIds : uncontrolledExpanded;

  const setSel = (next: string | null) => {
    if (selectedNodeId === undefined) setUncontrolledSelected(next);
    onSelectedNodeIdChange?.(next);
  };
  const setExp = (next: Set<Key> | ((prev: Set<Key>) => Set<Key>)) => {
    const computed = typeof next === 'function' ? next(exp) : next;
    if (expandedNodeIds === undefined) setUncontrolledExpanded(computed);
    onExpandedNodeIdsChange?.(computed);
  };

  const filteredTree = useMemo(() => filterTree(treeData, filter.trim().toLowerCase()), [treeData, filter]);

  const toggleExpanded = (nodeId: string) => {
    setExp((prev) => {
      const isExpanding = !prev.has(nodeId);
      if (!isExpanding) {
        const next = new Set(prev);
        next.delete(nodeId);
        const node = findNodeById(filteredTree, nodeId) ?? findNodeById(treeData, nodeId);
        if (node) {
          for (const k of collectExpandableKeysInSubtree(node)) next.delete(k);
        }
        return next;
      }
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
  };

  const handleSelectionChange = (keys: unknown) => {
    const arr = Array.from(keys as Set<Key>);
    const first = (arr[0] ?? null) as string | null;
    setSel(first);
    if (!first) return;
    const node = findNodeById(treeData, first);
    if (node) onActivateNode?.(node);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {showFilter ? (
        <div style={{ marginBottom: 8 }}>
          <input
            className="textInput"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter navigation tree"
          />
        </div>
      ) : null}

      <Tree
        aria-label="Portal navigation"
        selectionMode="single"
        selectedKeys={sel ? new Set([sel]) : new Set()}
        onSelectionChange={handleSelectionChange}
        expandedKeys={exp}
        onExpandedChange={(keys) => setExp(new Set(keys as Iterable<Key>))}
        className="navAriaTree"
        renderEmptyState={() => <div className="navEmpty">No items</div>}
      >
        {filteredTree.map((n) => (
          <PortalTreeItem
            key={n.id}
            node={n}
            depth={0}
            expandedKeys={exp}
            toggleExpanded={toggleExpanded}
            activeViewId={activeViewId}
          />
        ))}
      </Tree>
    </div>
  );
}

function PortalTreeItem(props: {
  node: NavNode;
  depth: number;
  expandedKeys: Set<Key>;
  toggleExpanded: (id: string) => void;
  activeViewId?: string;
}) {
  const { node, depth, expandedKeys, toggleExpanded, activeViewId } = props;
  const hasChildren = !!node.children && node.children.length > 0;
  const isExpanded = hasChildren && expandedKeys.has(node.id);
  const icon = iconForNode(node);
  const title = node.label;

  const isActiveView =
    node.kind === 'view' &&
    !!activeViewId &&
    (node.payloadRef?.viewId === activeViewId || node.payloadRef?.elementId === activeViewId);

  return (
    <TreeItem id={node.id} textValue={node.label}>
      <TreeItemContent>
        <div
          className="navTreeRow"
          data-kind={node.kind}
          data-nodeid={node.id}
          data-folderid={node.kind === 'folder' ? node.payloadRef.folderId : undefined}
          data-viewid={node.kind === 'view' ? node.payloadRef.viewId : undefined}
          data-elementid={node.kind === 'element' ? node.payloadRef.elementId : undefined}
          title={title}
          onDoubleClick={(e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('[data-chevron="1"]')) return;
            if (hasChildren) {
              e.preventDefault();
              toggleExpanded(node.id);
            }
          }}
        >
          {depth > 0 ? (
            <>
              <span className="navTreeIndent" aria-hidden style={{ width: depth * 12 }} />
              <span className="navTreeConnector" aria-hidden />
            </>
          ) : null}

          {hasChildren ? (
            <Button
              slot="chevron"
              className="navTreeChevronButton"
              data-chevron="1"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
              onPress={() => toggleExpanded(node.id)}
            >
              <span className="navTreeChevron" aria-hidden>
                {isExpanded ? '▾' : '▸'}
              </span>
            </Button>
          ) : (
            <span className="navTreeChevronSpacer" aria-hidden />
          )}

          <span className="navTreeIcon" aria-hidden>
            {icon}
          </span>

          <span className="navTreeLabel">{node.label}</span>

          {isActiveView ? <span className="navTreeSecondary">active</span> : null}
        </div>
      </TreeItemContent>

      {hasChildren
        ? node.children!.map((c) => (
            <PortalTreeItem
              key={c.id}
              node={c}
              depth={depth + 1}
              expandedKeys={expandedKeys}
              toggleExpanded={toggleExpanded}
              activeViewId={activeViewId}
            />
          ))
        : null}
    </TreeItem>
  );
}
