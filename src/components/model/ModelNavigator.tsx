import type * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Tree,
  TreeItem,
  TreeItemContent
} from 'react-aria-components';
import type { Key } from '@react-types/shared';

import type { ArchimateLayer, ElementType, Folder, Model, RelationshipType } from '../../domain';
import {
  ARCHIMATE_LAYERS,
  ELEMENT_TYPES_BY_LAYER,
  RELATIONSHIP_TYPES,
  VIEWPOINTS,
  createElement,
  createRelationship,
  createView
} from '../../domain';
import { getAllowedRelationshipTypes, validateRelationship } from '../../domain/config/archimatePalette';
import { modelStore, useModelStore } from '../../store';
import '../../styles/navigator.css';
import { Dialog } from '../dialog/Dialog';
import { FolderNameDialog } from './FolderNameDialog';
import type { Selection } from './selection';

type Props = {
  selection: Selection;
  onSelect: (selection: Selection) => void;
};

// Drag payload for dragging an element from the tree into a view.
const DND_ELEMENT_MIME = 'application/x-pwa-modeller-element-id';

type NavNodeKind = 'folder' | 'element' | 'view' | 'relationship' | 'section';
type NavNode = {
  key: string;
  kind: NavNodeKind;
  label: string;
  secondary?: string; // rendered as a compact badge (e.g. counts)
  tooltip?: string;
  children?: NavNode[];
  scope?: 'elements' | 'views' | 'relationships' | 'other';
  // Actions
  canCreateFolder?: boolean;
  canCreateElement?: boolean;
  canCreateView?: boolean;
  canCreateRelationship?: boolean;
  canDelete?: boolean;
  canRename?: boolean;
  // IDs
  folderId?: string;
  elementId?: string;
  viewId?: string;
  relationshipId?: string;
};

function sortByName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function findFolderByKind(model: Model, kind: Folder['kind']): Folder {
  const found = Object.values(model.folders).find((f) => f.kind === kind);
  if (!found) throw new Error(`Missing required folder kind: ${kind}`);
  return found;
}

function makeKey(kind: NavNodeKind, id: string): string {
  return `${kind}:${id}`;
}



function makeSection(
  id: string,
  label: string,
  secondary: string,
  children: NavNode[],
  scope: NavNode['scope'] = 'other'
): NavNode {
  return {
    key: makeKey('section', id),
    kind: 'section',
    label,
    secondary,
    children,
    scope
  };
}

function scopeForFolder(model: Model, roots: { elementsRoot: Folder; viewsRoot: Folder }, folderId: string): 'elements' | 'views' | 'other' {
  let cur: Folder | undefined = model.folders[folderId];
  while (cur) {
    if (cur.id === roots.elementsRoot.id) return 'elements';
    if (cur.id === roots.viewsRoot.id) return 'views';
    if (!cur.parentId) return 'other';
    cur = model.folders[cur.parentId];
  }
  return 'other';
}

function elementOptionLabel(model: Model, elementId: string): string {
  const el = model.elements[elementId];
  if (!el) return elementId;
  return `${el.name || '(unnamed)'} (${el.type})`;
}
function parseKey(key: string): { kind: NavNodeKind; id: string } | null {
  const idx = key.indexOf(':');
  if (idx < 0) return null;
  const kind = key.slice(0, idx) as NavNodeKind;
  const id = key.slice(idx + 1);
  if (!id) return null;
  if (!['folder', 'element', 'view', 'relationship', 'section'].includes(kind)) return null;
  return { kind, id };
}

function selectionToKey(selection: Selection): string | null {
  switch (selection.kind) {
    case 'folder':
      return makeKey('folder', selection.folderId);
    case 'element':
      return makeKey('element', selection.elementId);
    case 'relationship':
      return makeKey('relationship', selection.relationshipId);
    case 'view':
      return makeKey('view', selection.viewId);
    case 'viewNode':
      // In the navigator we highlight the parent view.
      return makeKey('view', selection.viewId);
    case 'model':
    default:
      return null;
  }
}

function iconFor(node: NavNode): string {
  switch (node.kind) {
    case 'folder':
      return '📁';
    case 'view':
      return '🗺️';
    case 'element':
      return '⬛';
    case 'relationship':
      return '🔗';
    case 'section':
    default:
      return '▦';
  }
}

function toggleExpandedKey(current: Set<Key>, key: Key): Set<Key> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function ModelNavigator({ selection, onSelect }: Props) {
  const model = useModelStore((s) => s.model);
  const isDirty = useModelStore((s) => s.isDirty);
  const fileName = useModelStore((s) => s.fileName);

  const [searchQuery, setSearchQuery] = useState('');
  const searchTerm = searchQuery.trim().toLowerCase();

  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);

  // Create dialogs
  const [createElementOpen, setCreateElementOpen] = useState(false);
  const [createElementFolderId, setCreateElementFolderId] = useState<string | null>(null);
  const [elementNameDraft, setElementNameDraft] = useState('');
  const [elementLayerDraft, setElementLayerDraft] = useState<ArchimateLayer>(ARCHIMATE_LAYERS[1]);
  const [elementTypeDraft, setElementTypeDraft] = useState<ElementType>(() => {
    const types = ELEMENT_TYPES_BY_LAYER[ARCHIMATE_LAYERS[1]];
    return (types?.[0] ?? 'BusinessActor') as ElementType;
  });

  const [createViewOpen, setCreateViewOpen] = useState(false);
  const [createViewFolderId, setCreateViewFolderId] = useState<string | null>(null);
  const [viewNameDraft, setViewNameDraft] = useState('');
  const [viewViewpointDraft, setViewViewpointDraft] = useState<string>(VIEWPOINTS[0]?.id ?? 'layered');

  const [createRelationshipOpen, setCreateRelationshipOpen] = useState(false);
  const [relationshipNameDraft, setRelationshipNameDraft] = useState('');
  const [relationshipDescriptionDraft, setRelationshipDescriptionDraft] = useState('');
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [relationshipTypeDraft, setRelationshipTypeDraft] = useState<RelationshipType>(
    (RELATIONSHIP_TYPES[2] ?? 'Association') as RelationshipType
  );

  // Expansion state (default: expand everything, keeps the tree explorer-like)
  const [expandedKeys, setExpandedKeys] = useState<Set<Key>>(new Set());

  // Inline rename state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const roots = useMemo(() => {
    if (!model) return null;
    const elementsRoot = findFolderByKind(model, 'elements');
    const viewsRoot = findFolderByKind(model, 'views');
    return { elementsRoot, viewsRoot };
  }, [model]);

  const elementIdsInOrder = useMemo(() => {
    if (!model) return [] as string[];
    // Keep insertion order for predictable defaults.
    return Object.keys(model.elements);
  }, [model]);

  // Keep element type selection valid when layer changes.
  useEffect(() => {
    const opts = ELEMENT_TYPES_BY_LAYER[elementLayerDraft] ?? [];
    if (opts.length === 0) return;
    if (!opts.includes(elementTypeDraft)) setElementTypeDraft(opts[0]);
  }, [elementLayerDraft, elementTypeDraft]);

  const allowedRelationshipTypes = useMemo(() => {
    if (!model) return RELATIONSHIP_TYPES as RelationshipType[];
    const s = model.elements[sourceId];
    const t = model.elements[targetId];
    if (!s || !t) return RELATIONSHIP_TYPES as RelationshipType[];
    const allowed = getAllowedRelationshipTypes(s.type, t.type);
    return (allowed.length > 0 ? allowed : RELATIONSHIP_TYPES) as RelationshipType[];
  }, [model, sourceId, targetId]);

  // Keep relationship type valid for the chosen endpoints.
  useEffect(() => {
    if (!allowedRelationshipTypes.includes(relationshipTypeDraft)) {
      setRelationshipTypeDraft(allowedRelationshipTypes[0] ?? ('Association' as RelationshipType));
    }
  }, [allowedRelationshipTypes, relationshipTypeDraft]);

  const relationshipRuleError = useMemo(() => {
    if (!model) return null;
    const s = model.elements[sourceId];
    const t = model.elements[targetId];
    if (!s || !t) return null;
    const res = validateRelationship(s.type, t.type, relationshipTypeDraft);
    return res.allowed ? null : res.reason;
  }, [model, sourceId, targetId, relationshipTypeDraft]);

  const treeData = useMemo<NavNode[] | null>(() => {
    if (!model || !roots) return null;

    const buildFolder = (folderId: string, scope: 'elements' | 'views'): NavNode => {
      const folder = model.folders[folderId];
      const isRootFolder = folder.kind === 'elements' || folder.kind === 'views' || folder.kind === 'root';

      const childFolders = folder.folderIds.map((id) => model.folders[id]).filter(Boolean).sort(sortByName);
      const childFolderNodes = childFolders.map((f) => buildFolder(f.id, scope));

      const elementLeaves =
        scope === 'elements'
          ? folder.elementIds
              .map((id) => model.elements[id])
              .filter(Boolean)
              .sort(sortByName)
              .map<NavNode>((el) => ({
                key: makeKey('element', el.id),
                kind: 'element',
                label: el.name || '(unnamed)',
                tooltip: `${el.name || '(unnamed)'} (${el.type})`,
                canRename: true,
                elementId: el.id
              }))
          : [];

      const viewLeaves =
        scope === 'views'
          ? folder.viewIds
              .map((id) => model.views[id])
              .filter(Boolean)
              .sort(sortByName)
              .map<NavNode>((v) => ({
                key: makeKey('view', v.id),
                kind: 'view',
                label: v.name || '(unnamed)',
                tooltip: `${v.name || '(unnamed)'} (${v.viewpointId})`,
                canRename: true,
                viewId: v.id
              }))
          : [];

      const children: NavNode[] = [...childFolderNodes, ...elementLeaves, ...viewLeaves];
      const immediateCount =
        childFolders.length + (scope === 'elements' ? folder.elementIds.length : folder.viewIds.length);

      return {
        key: makeKey('folder', folderId),
        kind: 'folder',
        label: folder.name,
        // keep the tree readable in a narrow sidebar: show a compact count badge
        secondary: String(immediateCount),
        tooltip:
          scope === 'elements'
            ? `${folder.name} — ${folder.elementIds.length} elements, ${childFolders.length} folders`
            : `${folder.name} — ${folder.viewIds.length} views, ${childFolders.length} folders`,
        children,
        scope,
        folderId,
        canCreateFolder: true,
        canCreateElement: scope === 'elements',
        canCreateView: scope === 'views',
        canRename: !isRootFolder,
        canDelete: !isRootFolder
      };
    };

    const relationships = Object.values(model.relationships)
      .filter(Boolean)
      .sort((a, b) => {
        const byType = a.type.localeCompare(b.type, undefined, { sensitivity: 'base' });
        if (byType !== 0) return byType;
        return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
      })
      .map<NavNode>((r) => {
        const src = model.elements[r.sourceElementId]?.name ?? r.sourceElementId;
        const tgt = model.elements[r.targetElementId]?.name ?? r.targetElementId;
        const label = r.name ? `${r.type}: ${r.name}` : r.type;
        return {
          key: makeKey('relationship', r.id),
          kind: 'relationship',
          label,
          tooltip: `${label} — ${src} → ${tgt}`,
          // Keep the tree compact; full details are shown via tooltip + properties panel.
          relationshipId: r.id
        };
      });

    const rootsNodes: NavNode[] = [
      buildFolder(roots.elementsRoot.id, 'elements'),
      buildFolder(roots.viewsRoot.id, 'views'),
      {
        ...makeSection('relationships', 'Relationships', String(relationships.length), relationships, 'relationships'),
        canCreateRelationship: true
      }
    ];

    if (!searchTerm) return rootsNodes;

    const match = (text: string | undefined | null) => (text ?? '').toLowerCase().includes(searchTerm);
    const elements = Object.values(model.elements)
      .filter((el) => match(el.name) || match(el.type))
      .sort(sortByName)
      .slice(0, 30)
      .map<NavNode>((el) => ({
        key: makeKey('element', el.id),
        kind: 'element',
        label: el.name || '(unnamed)',
        tooltip: `${el.name || '(unnamed)'} (${el.type})`,
        canRename: true,
        elementId: el.id
      }));

    const views = Object.values(model.views)
      .filter((v) => match(v.name) || match(v.viewpointId))
      .sort(sortByName)
      .slice(0, 30)
      .map<NavNode>((v) => ({
        key: makeKey('view', v.id),
        kind: 'view',
        label: v.name || '(unnamed)',
        tooltip: `${v.name || '(unnamed)'} (${v.viewpointId})`,
        canRename: true,
        viewId: v.id
      }));

    const rels = Object.values(model.relationships)
      .filter((r) => match(r.name) || match(r.type))
      .slice(0, 30)
      .map<NavNode>((r) => {
        const src = model.elements[r.sourceElementId]?.name ?? r.sourceElementId;
        const tgt = model.elements[r.targetElementId]?.name ?? r.targetElementId;
        const label = r.name ? `${r.type}: ${r.name}` : r.type;
        return {
          key: makeKey('relationship', r.id),
          kind: 'relationship',
          label,
          tooltip: `${label} — ${src} → ${tgt}`,
          relationshipId: r.id
        };
      });

    const folders = Object.values(model.folders)
      .filter((f) => match(f.name) || match(f.kind))
      .sort(sortByName)
      .slice(0, 30)
      .map<NavNode>((f) => ({
        key: makeKey('folder', f.id),
        kind: 'folder',
        label: f.name,
        tooltip: `${f.name} (folder)`,
        folderId: f.id
      }));

    
return [
  makeSection(
    'search',
    'Search results',
    String(elements.length + views.length + rels.length + folders.length),
    [
      ...(elements.length ? [makeSection('search-elements', 'Elements', String(elements.length), elements)] : []),
      ...(views.length ? [makeSection('search-views', 'Views', String(views.length), views)] : []),
      ...(rels.length ? [makeSection('search-relationships', 'Relationships', String(rels.length), rels)] : []),
      ...(folders.length ? [makeSection('search-folders', 'Folders', String(folders.length), folders)] : [])
    ]
  )
];
  }, [model, roots, searchTerm]);

  // Expand all nodes that have children when the tree data changes.
  // This keeps the navigator behaving like a typical explorer tree (open by default).
  useEffect(() => {
    if (!treeData) return;
    const keys = new Set<Key>();
    const stack: NavNode[] = [...treeData];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.children && n.children.length > 0) {
        keys.add(n.key);
        stack.push(...n.children);
      }
    }
    setExpandedKeys(keys);
  }, [model?.id, searchTerm, treeData]);

  const selectedKey = selectionToKey(selection);

  function openCreateFolder(parentFolderId: string) {
    setCreateFolderParentId(parentFolderId);
  }

  function openCreateElement(targetFolderId?: string) {
    if (!roots) return;
    setCreateElementFolderId(targetFolderId ?? roots.elementsRoot.id);
    setElementNameDraft('');
    const defaultLayer = ARCHIMATE_LAYERS[1];
    setElementLayerDraft(defaultLayer);
    const opts = ELEMENT_TYPES_BY_LAYER[defaultLayer] ?? [];
    setElementTypeDraft((opts[0] ?? 'BusinessActor') as ElementType);
    setCreateElementOpen(true);
  }

  function openCreateView(targetFolderId?: string) {
    if (!roots) return;
    setCreateViewFolderId(targetFolderId ?? roots.viewsRoot.id);
    setViewNameDraft('');
    setViewViewpointDraft(VIEWPOINTS[0]?.id ?? 'layered');
    setCreateViewOpen(true);
  }

  function openCreateRelationship(prefillSourceElementId?: string) {
    if (!model) return;
    setRelationshipNameDraft('');
    setRelationshipDescriptionDraft('');

    const ids = elementIdsInOrder;
    const validSource = prefillSourceElementId && ids.includes(prefillSourceElementId) ? prefillSourceElementId : ids[0];
    const validTarget = ids.find((id) => id !== validSource) ?? validSource ?? '';

    setSourceId(validSource ?? '');
    setTargetId(validTarget ?? '');
    // Type will be normalized by the allowedRelationshipTypes effect.
    setRelationshipTypeDraft((RELATIONSHIP_TYPES[2] ?? 'Association') as RelationshipType);
    setCreateRelationshipOpen(true);
  }

  function clearEditing() {
    setEditingKey(null);
    setEditingValue('');
  }

  function startEditing(node: NavNode) {
    if (!node.canRename) return;
    setEditingKey(node.key);
    setEditingValue(node.label);
    // focus after next render
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 0);
  }

  function commitEditing() {
    if (!model) return;
    if (!editingKey) return;
    const nextName = editingValue.trim();
    if (!nextName) {
      clearEditing();
      return;
    }

    const parsed = parseKey(editingKey);
    if (!parsed) {
      clearEditing();
      return;
    }

    try {
      if (parsed.kind === 'folder') {
        modelStore.renameFolder(parsed.id, nextName);
      } else if (parsed.kind === 'element') {
        modelStore.updateElement(parsed.id, { name: nextName });
      } else if (parsed.kind === 'view') {
        modelStore.updateView(parsed.id, { name: nextName });
      }
    } catch {
      // If rename fails (e.g. root folder), just exit edit mode.
    } finally {
      clearEditing();
    }
  }

  function handleSelectionChange(keys: unknown) {
    // react-aria-components uses Set<Key> for single selection.
    const set = keys as Set<Key>;
    const first = set?.values?.().next?.().value as string | undefined;
    if (!first) {
      onSelect({ kind: 'model' });
      return;
    }
    const parsed = parseKey(first);
    if (!parsed) {
      onSelect({ kind: 'model' });
      return;
    }
    switch (parsed.kind) {
      case 'folder':
        onSelect({ kind: 'folder', folderId: parsed.id });
        return;
      case 'element':
        onSelect({ kind: 'element', elementId: parsed.id });
        return;
      case 'view':
        onSelect({ kind: 'view', viewId: parsed.id });
        return;
      case 'relationship':
        onSelect({ kind: 'relationship', relationshipId: parsed.id });
        return;
      case 'section':
      default:
        onSelect({ kind: 'model' });
        return;
    }
  }

  function findNodeByKey(nodes: NavNode[] | null, key: string): NavNode | null {
    if (!nodes) return null;
    const stack: NavNode[] = [...nodes];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.key === key) return n;
      if (n.children) stack.push(...n.children);
    }
    return null;
  }

  if (!model || !roots || !treeData) {
    return (
      <div className="navigator">
        <div className="navigatorHeader">
          <div className="navigatorModelName">No model loaded</div>
          <div className="navigatorMeta">Use New/Open in the header to begin.</div>
        </div>
      </div>
    );
  }

  function renderNode(node: NavNode, depth = 0): React.ReactNode {
    const isEditing = editingKey === node.key;
    const icon = iconFor(node);
    const hasChildren = !!node.children && node.children.length > 0;
    const isExpanded = hasChildren && expandedKeys.has(node.key);
    const showBadge = !!node.secondary && (node.kind === 'folder' || node.kind === 'section');
    const title = node.tooltip ?? node.label;

    // Single "Create…" button (Explorer/Finder-like) with a menu for all create actions
    // relevant to this node.
    const canShowCreateMenu =
      Boolean(node.canCreateFolder && node.folderId) ||
      Boolean(node.canCreateElement && node.folderId) ||
      Boolean(node.canCreateView && node.folderId) ||
      Boolean(node.canCreateRelationship);

    const actions = (
      <span className="navTreeActions" aria-label="Node actions">
        {canShowCreateMenu ? (
          <MenuTrigger>
            <Button className="miniButton" aria-label="Create…">＋</Button>
            <Popover className="navMenuPopover">
              <Menu
                className="navMenu"
                onAction={(key) => {
                  const k = String(key);
                  if (k === 'folder' && node.folderId) {
                    openCreateFolder(node.folderId);
                  } else if (k === 'element' && node.folderId) {
                    openCreateElement(node.folderId);
                  } else if (k === 'view' && node.folderId) {
                    openCreateView(node.folderId);
                  } else if (k === 'relationship') {
                    const prefill = selection.kind === 'element' ? selection.elementId : undefined;
                    openCreateRelationship(prefill);
                  }
                }}
              >
                {node.canCreateFolder && node.folderId ? <MenuItem className="navMenuItem" id="folder">Folder…</MenuItem> : null}
                {node.canCreateElement && node.folderId ? <MenuItem className="navMenuItem" id="element">Element…</MenuItem> : null}
                {node.canCreateView && node.folderId ? <MenuItem className="navMenuItem" id="view">View…</MenuItem> : null}
                {node.canCreateRelationship ? <MenuItem className="navMenuItem" id="relationship">Relationship…</MenuItem> : null}
              </Menu>
            </Popover>
          </MenuTrigger>
        ) : null}

        {node.canRename ? (
          <button
            type="button"
            className="miniButton"
            aria-label="Rename"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              startEditing(node);
            }}
          >
            ✎
          </button>
        ) : null}

        {node.canDelete && node.folderId ? (
          <button
            type="button"
            className="miniButton"
            aria-label="Delete folder"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              const ok = window.confirm('Delete this folder? Contents will be moved to its parent folder.');
              if (!ok) return;
              modelStore.deleteFolder(node.folderId!);
              if (selection.kind === 'folder' && selection.folderId === node.folderId) {
                onSelect({ kind: 'model' });
              }
            }}
          >
            🗑
          </button>
        ) : null}
      </span>
    );

    return (
      <TreeItem id={node.key} textValue={node.label} key={node.key}>
        <TreeItemContent>
          <div
            className="navTreeRow"
            data-kind={node.kind}
            data-nodekey={node.key}
            title={title}
            draggable={node.kind === 'element' && Boolean(node.elementId)}
            onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
              if (node.kind !== 'element' || !node.elementId) return;
              // Ensure the element is selected when starting a drag (helps with keyboard-only drop flows later).
              handleSelectionChange(new Set([node.key]));
              try {
                e.dataTransfer.setData(DND_ELEMENT_MIME, node.elementId);
                // Fallback to plain text for debugging / other drop targets.
                e.dataTransfer.setData('text/plain', node.elementId);
                e.dataTransfer.effectAllowed = 'copy';
              } catch {
                // Ignore (some test environments may not fully implement DataTransfer)
              }
            }}
            onClick={(e: React.MouseEvent) => {
              const target = e.target as HTMLElement | null;
              // Don't steal clicks from expand button or inline action buttons.
              if (target && (target.closest('[data-chevron="1"]') || target.closest('.navTreeActions'))) {
                return;
              }
              // Ensure mouse click selects the item (Explorer/Finder behavior).
              e.preventDefault();
              e.stopPropagation();
              handleSelectionChange(new Set([node.key]));
            }}
            onDoubleClick={(e: React.MouseEvent) => {
              if (!hasChildren && !node.canRename) return;
              e.preventDefault();
              e.stopPropagation();
              if (hasChildren) {
                setExpandedKeys((prev) => toggleExpandedKey(prev, node.key));
              } else {
                startEditing(node);
              }
            }}
          >
            {depth > 0 ? (
              <>
                <span className="navTreeIndent" aria-hidden style={{ width: depth * 14 }} />
                <span className="navTreeConnector" aria-hidden />
              </>
            ) : null}

            {hasChildren ? (
              // React Aria requires an explicit chevron button for expandable items for accessibility.
              // See: Tree docs "Collapse and expand button".
              <Button
                slot="chevron"
                className="navTreeChevronButton"
                data-chevron="1"
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
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

            {isEditing ? (
              <input
                ref={editInputRef}
                className="textInput navInlineRename"
                aria-label="Rename"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitEditing();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    clearEditing();
                  }
                }}
                onBlur={() => commitEditing()}
              />
            ) : (
              <span className="navTreeLabel">{node.label}</span>
            )}

            {showBadge ? <span className="navTreeSecondary">{node.secondary}</span> : null}
            {actions}
          </div>
        </TreeItemContent>

        {hasChildren ? node.children!.map((c) => renderNode(c, depth + 1)) : null}
      </TreeItem>
    );
  }

  return (
    <div className="navigator">
      <div className="navigatorHeader">
        <div className="navigatorModelName">
          {model.metadata.name}
          {isDirty ? ' *' : ''}
        </div>
        <div className="navigatorMeta">{fileName ? `File: ${fileName}` : 'Not saved yet'}</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="textInput"
            aria-label="Search model"
            placeholder="Search elements, relationships, views…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery.trim() && (
            <button type="button" className="miniButton" aria-label="Clear model search" onClick={() => setSearchQuery('')}>
              ✕
            </button>
          )}

          <MenuTrigger>
            <Button className="miniButton" aria-label="Create…">＋</Button>
            <Popover className="navMenuPopover">
              <Menu
                className="navMenu"
                onAction={(key) => {
                  const k = String(key);
                  const selectedFolderId = selection.kind === 'folder' ? selection.folderId : null;
                  const selectedScope = selectedFolderId ? scopeForFolder(model, roots, selectedFolderId) : 'other';

                  if (k === 'folder') {
                    openCreateFolder(selectedFolderId ?? roots.elementsRoot.id);
                  } else if (k === 'element') {
                    const folderId = selectedFolderId && selectedScope === 'elements' ? selectedFolderId : roots.elementsRoot.id;
                    openCreateElement(folderId);
                  } else if (k === 'view') {
                    const folderId = selectedFolderId && selectedScope === 'views' ? selectedFolderId : roots.viewsRoot.id;
                    openCreateView(folderId);
                  } else if (k === 'relationship') {
                    const prefill = selection.kind === 'element' ? selection.elementId : undefined;
                    openCreateRelationship(prefill);
                  }
                }}
              >
                <MenuItem className="navMenuItem" id="folder">Folder…</MenuItem>
                <MenuItem className="navMenuItem" id="element">Element…</MenuItem>
                <MenuItem className="navMenuItem" id="view">View…</MenuItem>
                <MenuItem className="navMenuItem" id="relationship">Relationship…</MenuItem>
              </Menu>
            </Popover>
          </MenuTrigger>
        </div>
        <p className="navHint">Tip: Click to select, use ←/→ to collapse/expand, and F2 (or ✎) to rename.</p>
      </div>

      
<div
  className="navTreeWrap"
  onKeyDown={(e) => {
    if (e.key === 'F2') {
      const key = selectedKey;
      if (!key) return;
      const node = findNodeByKey(treeData, key);
      if (node) startEditing(node);
    }
  }}
>
      <Tree
        aria-label="Model navigator"
        selectionMode="single"
        // Keep selection controlled by the Workspace selection state.
        selectedKeys={selectedKey ? new Set([selectedKey]) : new Set()}
        onSelectionChange={handleSelectionChange}
        expandedKeys={expandedKeys}
        onExpandedChange={(keys) => setExpandedKeys(new Set(keys as Iterable<Key>))}
        className="navAriaTree"
        renderEmptyState={() => <div className="navEmpty">No items</div>}      >
        {treeData.map((n) => renderNode(n, 0))}
      </Tree>
      </div>

      <FolderNameDialog
        isOpen={createFolderParentId !== null}
        title="Create folder"
        confirmLabel="Create"
        onCancel={() => setCreateFolderParentId(null)}
        onConfirm={(name) => {
          if (!createFolderParentId) return;
          modelStore.createFolder(createFolderParentId, name);
          setCreateFolderParentId(null);
        }}
      />

      <Dialog
        title="Create element"
        isOpen={createElementOpen}
        onClose={() => setCreateElementOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => setCreateElementOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              disabled={!model || elementNameDraft.trim().length === 0}
              onClick={() => {
                if (!model) return;
                const created = createElement({
                  name: elementNameDraft.trim(),
                  layer: elementLayerDraft,
                  type: elementTypeDraft
                });
                modelStore.addElement(created, createElementFolderId ?? undefined);
                setCreateElementOpen(false);
                onSelect({ kind: 'element', elementId: created.id });
              }}
            >
              Create
            </button>
          </div>
        }
      >
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Element name"
                value={elementNameDraft}
                onChange={(e) => setElementNameDraft(e.target.value)}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Layer</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Layer"
                value={elementLayerDraft}
                onChange={(e) => setElementLayerDraft(e.target.value as ArchimateLayer)}
              >
                {ARCHIMATE_LAYERS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Type</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Type"
                value={elementTypeDraft}
                onChange={(e) => setElementTypeDraft(e.target.value as ElementType)}
              >
                {(ELEMENT_TYPES_BY_LAYER[elementLayerDraft] ?? []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        title="Create view"
        isOpen={createViewOpen}
        onClose={() => setCreateViewOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => setCreateViewOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              disabled={!model || viewNameDraft.trim().length === 0}
              onClick={() => {
                if (!model) return;
                const created = createView({ name: viewNameDraft.trim(), viewpointId: viewViewpointDraft });
                modelStore.addView(created, createViewFolderId ?? undefined);
                setCreateViewOpen(false);
                onSelect({ kind: 'view', viewId: created.id });
              }}
            >
              Create
            </button>
          </div>
        }
      >
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="View name"
                value={viewNameDraft}
                onChange={(e) => setViewNameDraft(e.target.value)}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Viewpoint</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Viewpoint"
                value={viewViewpointDraft}
                onChange={(e) => setViewViewpointDraft(e.target.value)}
              >
                {VIEWPOINTS.map((vp) => (
                  <option key={vp.id} value={vp.id}>
                    {vp.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        title="Create relationship"
        isOpen={createRelationshipOpen}
        onClose={() => setCreateRelationshipOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
            {relationshipRuleError ? <span className="panelHint" style={{ color: '#ffb3b3' }}>{relationshipRuleError}</span> : null}
            <button type="button" className="shellButton" onClick={() => setCreateRelationshipOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              disabled={!model || !sourceId || !targetId || sourceId === targetId || Boolean(relationshipRuleError)}
              onClick={() => {
                if (!model) return;
                const created = createRelationship({
                  sourceElementId: sourceId,
                  targetElementId: targetId,
                  type: relationshipTypeDraft,
                  name: relationshipNameDraft.trim() || undefined,
                  description: relationshipDescriptionDraft.trim() || undefined
                });
                modelStore.addRelationship(created);
                setCreateRelationshipOpen(false);
                onSelect({ kind: 'relationship', relationshipId: created.id });
              }}
            >
              Create
            </button>
          </div>
        }
      >
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Type</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Relationship type"
                value={relationshipTypeDraft}
                onChange={(e) => setRelationshipTypeDraft(e.target.value as RelationshipType)}
              >
                {allowedRelationshipTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Relationship name"
                value={relationshipNameDraft}
                onChange={(e) => setRelationshipNameDraft(e.target.value)}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Description</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Relationship description"
                value={relationshipDescriptionDraft}
                onChange={(e) => setRelationshipDescriptionDraft(e.target.value)}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Source</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select className="selectInput" aria-label="Source" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                {elementIdsInOrder.map((id) => (
                  <option key={id} value={id}>
                    {elementOptionLabel(model, id)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Target</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select className="selectInput" aria-label="Target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                {elementIdsInOrder.map((id) => (
                  <option key={id} value={id}>
                    {elementOptionLabel(model, id)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}