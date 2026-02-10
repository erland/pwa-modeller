import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Key } from '@react-types/shared';

import '../../styles/shell.css';

import { usePortalMediaQuery } from '../hooks/usePortalMediaQuery';
import { usePersistedNumber } from '../hooks/usePersistedNumber';

import { PortalDiagramViewer } from '../components/PortalDiagramViewer';
import { PortalInspectorPanel } from '../components/PortalInspectorPanel';
import { PortalNavigationTree } from '../components/PortalNavigationTree';
import { usePortalNavTree } from '../hooks/usePortalNavTree';
import type { NavNode } from '../navigation/types';
import type { Selection } from '../../components/model/selection';
import { usePortalStore } from '../store/usePortalStore';

export default function PortalViewPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { datasetMeta, model, status, indexes, rootFolderId } = usePortalStore();

  const isSmall = usePortalMediaQuery('(max-width: 720px)');
  const isMedium = usePortalMediaQuery('(max-width: 1100px)');
  const rightOverlay = !isSmall && isMedium;

  // Persisted sidebar widths (dock mode only)
  const DEFAULT_LEFT_WIDTH = 320;
  const DEFAULT_RIGHT_WIDTH = 360;
  const MIN_LEFT_WIDTH = 220;
  const MIN_RIGHT_WIDTH = 260;
  const MIN_MAIN_WIDTH = 360;

  const [leftWidth, setLeftWidth] = usePersistedNumber('portalLeftWidthPx', DEFAULT_LEFT_WIDTH);

  const [rightWidth, setRightWidth] = usePersistedNumber('portalRightWidthPx', DEFAULT_RIGHT_WIDTH);

  const [leftOpen, setLeftOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    const v = window.localStorage.getItem('portalLeftOpen');
    if (v === 'true') return true;
    if (v === 'false') return false;
    // Default: open on desktop-ish.
    return window.innerWidth > 900;
  });
  const [rightOpen, setRightOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    const v = window.localStorage.getItem('portalRightOpen');
    if (v === 'true') return true;
    if (v === 'false') return false;
    return window.innerWidth > 1100;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('portalLeftOpen', String(Boolean(leftOpen)));
  }, [leftOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('portalRightOpen', String(Boolean(rightOpen)));
  }, [rightOpen]);

  // When entering small screens, close drawers by default.
  useEffect(() => {
    if (isSmall) {
      setLeftOpen(false);
      setRightOpen(false);
    }
  }, [isSmall]);

  // On medium screens, prefer hiding the inspector by default.
  useEffect(() => {
    if (!isSmall && isMedium) {
      setRightOpen(false);
    }
  }, [isSmall, isMedium]);

  const shellBodyRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState<null | 'left' | 'right'>(null);

  const leftDocked = leftOpen && !isSmall;
  const rightDocked = rightOpen && !isSmall && !isMedium;

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (ev: PointerEvent) => {
      const el = shellBodyRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();

      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

      if (isResizing === 'left') {
        const rightW = rightDocked ? rightWidth : 0;
        const maxLeft = Math.max(MIN_LEFT_WIDTH, rect.width - rightW - MIN_MAIN_WIDTH);
        const next = clamp(ev.clientX - rect.left, MIN_LEFT_WIDTH, maxLeft);
        setLeftWidth(next);
      } else {
        const leftW = leftDocked ? leftWidth : 0;
        const maxRight = Math.max(MIN_RIGHT_WIDTH, rect.width - leftW - MIN_MAIN_WIDTH);
        const next = clamp(rect.right - ev.clientX, MIN_RIGHT_WIDTH, maxRight);
        setRightWidth(next);
      }
    };

    const onUp = () => setIsResizing(null);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isResizing, leftDocked, rightDocked, leftWidth, rightWidth]);

  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<Key>>(new Set());

  const viewId = id ?? '';
  const view = model && id ? model.views[id] : null;

  // When navigating between views, clear the in-view selection to avoid confusing carry-over.
  useEffect(() => {
    setSelection({ kind: 'none' });
  }, [viewId]);
  const treeData = usePortalNavTree(model, rootFolderId);

  function findNodeById(nodes: NavNode[], nodeId: string): NavNode | null {
    for (const n of nodes) {
      if (n.id === nodeId) return n;
      if (n.children) {
        const hit = findNodeById(n.children, nodeId);
        if (hit) return hit;
      }
    }
    return null;
  }

  function findPathToNode(nodes: NavNode[], nodeId: string, acc: string[] = []): string[] | null {
    for (const n of nodes) {
      if (n.id === nodeId) return acc;
      if (n.children && n.children.length) {
        const hit = findPathToNode(n.children, nodeId, [...acc, n.id]);
        if (hit) return hit;
      }
    }
    return null;
  }

  const preferredSelectedNodeId = useMemo(() => {
    // Keep the tree selection aligned with what the user is focused on.
    // - If the diagram selection identifies an element, prefer that.
    // - Otherwise fall back to the current view.
    const elementId =
      selection.kind === 'element'
        ? selection.elementId
        : selection.kind === 'viewNode'
          ? selection.elementId
          : selection.kind === 'viewNodes'
            ? selection.elementIds[0]
            : null;

    if (elementId) {
      const candidate = `element:${elementId}`;
      if (findNodeById(treeData, candidate)) return candidate;
    }

    if (viewId) {
      const candidate = `view:${viewId}`;
      if (findNodeById(treeData, candidate)) return candidate;
    }
    return null;
  }, [selection, treeData, viewId]);

  // Auto-expand the path to the active item so it is always visible.
  useEffect(() => {
    if (!preferredSelectedNodeId) return;
    const path = findPathToNode(treeData, preferredSelectedNodeId);
    if (!path || !path.length) return;
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      for (const k of path) next.add(k);
      return next;
    });
  }, [preferredSelectedNodeId, treeData]);

  const onActivateNode = (node: NavNode) => {
    if (node.kind === 'view') {
      const vid = node.payloadRef.viewId;
      if (vid) navigate(`/portal/v/${encodeURIComponent(vid)}`);
      return;
    }
    if (node.kind === 'element') {
      const eid = node.payloadRef.elementId;
      if (!eid) return;

      // If the element is present in the current view, select/highlight it in-place.
      const presentInView = Boolean(
        view && (view.layout?.nodes ?? []).some((n) => n.elementId === eid)
      );

      if (presentInView && viewId) {
        setSelection({ kind: 'viewNode', viewId, elementId: eid });
        if (!rightOpen) setRightOpen(true);
        return;
      }

      // Otherwise navigate to the element fact sheet page.
      navigate(`/portal/e/${encodeURIComponent(eid)}`);
    }
  };

  const onSelectionChange = (next: Selection) => {
    setSelection(next);
    // Auto-show the inspector when the user selects something inspectable.
    if (!rightOpen) {
      if (next.kind === 'element' || next.kind === 'viewNode' || next.kind === 'viewNodes' || next.kind === 'relationship') {
        setRightOpen(true);
      }
    }
  };

  const showBackdrop = (isSmall && (leftOpen || rightOpen)) || (rightOverlay && rightOpen);

  return (
    <div className={['shell', isResizing ? 'isResizing' : null].filter(Boolean).join(' ')} style={{ width: '100%', minHeight: 0 }}>
      <div
        ref={shellBodyRef}
        style={
          {
            '--shellLeftWidth': `${Math.round(leftWidth)}px`,
            '--shellRightWidth': `${Math.round(rightWidth)}px`
          } as CSSProperties
        }
        className={[
          'shellBody',
          leftDocked ? 'isLeftDockedOpen' : null,
          rightDocked ? 'isRightDockedOpen' : null
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Left: navigation */}
        <aside
          className={['shellSidebar', 'shellSidebarLeft', leftOpen ? 'isOpen' : null].filter(Boolean).join(' ')}
          aria-label="Portal navigation"
        >
          <div className="shellSidebarHeader">
            <div style={{ minWidth: 0 }}>
              <div className="shellSidebarTitle">Navigation</div>
              <div style={{ fontSize: 12, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {datasetMeta?.title?.trim() || (status === 'loading' ? 'Loading…' : 'No dataset loaded')}
              </div>
            </div>
            <button type="button" className="shellIconButton" aria-label="Close navigation" onClick={() => setLeftOpen(false)}>
              ✕
            </button>
          </div>
          <div className="shellSidebarContent" style={{ padding: 0 }}>
            <div className="navigator" style={{ border: 'none', background: 'transparent', height: '100%', minHeight: 0 }}>
              <div className="navTreeWrap" style={{ minHeight: 0 }}>
                <PortalNavigationTree
                  treeData={treeData}
                  selectedNodeId={preferredSelectedNodeId}
                  expandedNodeIds={expandedNodeIds}
                  onExpandedNodeIdsChange={setExpandedNodeIds}
                  onActivateNode={onActivateNode}
                  activeViewId={viewId}
                  showFilter
                />
              </div>
            </div>
          </div>
          {leftDocked ? (
            <div
              className="shellResizer shellResizerLeft"
              role="separator"
              aria-label="Resize navigation"
              title="Drag to resize (double-click to reset)"
              onDoubleClick={() => setLeftWidth(DEFAULT_LEFT_WIDTH)}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setIsResizing('left');
              }}
            />
          ) : null}
        </aside>

        {/* Main */}
        <main className="shellMain" style={{ minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ marginTop: 0, marginBottom: 4 }}>View</h2>
              <div style={{ opacity: 0.7 }}>{view ? `“${view.name}”` : id ? `“${id}”` : '(missing param)'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="shellIconButton"
                aria-label="Toggle navigation"
                onClick={() => {
                  setLeftOpen((v) => !v);
                  if (isSmall) setRightOpen(false);
                }}
                title={leftOpen ? 'Hide navigation' : 'Show navigation'}
              >
                ☰
              </button>
              <button
                type="button"
                className="shellIconButton"
                aria-label="Toggle inspector"
                onClick={() => {
                  setRightOpen((v) => !v);
                  if (isSmall) setLeftOpen(false);
                }}
                title={rightOpen ? 'Hide inspector' : 'Show inspector'}
              >
                ⚙
              </button>
            </div>
          </div>

          {!datasetMeta || !model ? (
            <div
              style={{
                padding: 12,
                border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
                borderRadius: 12,
              }}
            >
              <strong>{status === 'loading' ? 'Loading dataset…' : 'No dataset loaded.'}</strong>
              <div style={{ marginTop: 8, opacity: 0.85 }}>
                Go to the portal home to configure a <code>latest.json</code> URL, then return here.
              </div>
            </div>
          ) : !id ? (
            <div
              style={{
                padding: 12,
                border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
                borderRadius: 12,
              }}
            >
              <strong>Pick a view from the navigation tree.</strong>
            </div>
          ) : !view ? (
            <div
              style={{
                padding: 12,
                border: '1px solid var(--borderColor, rgba(0,0,0,0.12))',
                borderRadius: 12,
              }}
            >
              <strong>View not found.</strong>
              <div style={{ marginTop: 8, opacity: 0.85 }}>
                The dataset is loaded, but it does not contain a view with id <code>{viewId}</code>.
              </div>
            </div>
          ) : (
            <div style={{ minHeight: 0 }}>
              <div style={{ opacity: 0.8, marginBottom: 10 }}>
                <span style={{ fontWeight: 700 }}>{view.name}</span>
                <span style={{ marginLeft: 8 }}>·</span>
                <span style={{ marginLeft: 8, opacity: 0.75 }}>
                  Nodes: {(view.layout?.nodes?.length ?? 0)} · Connections: {(view.connections ?? []).length}
                </span>
              </div>

              <PortalDiagramViewer
                model={model}
                view={view}
                viewId={viewId}
                selection={selection}
                onSelectionChange={onSelectionChange}
              />
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Link to="/portal">Back to portal home</Link>
          </div>
        </main>

        {/* Right: inspector */}
        <aside
          className={['shellSidebar', 'shellSidebarRight', rightOpen ? 'isOpen' : null].filter(Boolean).join(' ')}
          aria-label="Portal inspector"
        >
          <div className="shellSidebarHeader">
            <div className="shellSidebarTitle">Inspector</div>
            <button type="button" className="shellIconButton" aria-label="Close inspector" onClick={() => setRightOpen(false)}>
              ✕
            </button>
          </div>
          <div className="shellSidebarContent">
            {model ? (
              <PortalInspectorPanel
                model={model}
                selection={selection}
                indexes={indexes}
                onOpenFactSheet={(elementId) => {
                  // Keep left nav state as-is; switch the main workspace to the fact sheet.
                  navigate(`/portal/e/${encodeURIComponent(elementId)}`);
                }}
              />
            ) : null}
          </div>
          {rightDocked ? (
            <div
              className="shellResizer shellResizerRight"
              role="separator"
              aria-label="Resize inspector"
              title="Drag to resize (double-click to reset)"
              onDoubleClick={() => setRightWidth(DEFAULT_RIGHT_WIDTH)}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setIsResizing('right');
              }}
            />
          ) : null}
        </aside>

        {showBackdrop ? (
          <div
            className="shellBackdrop"
            aria-hidden="true"
            onClick={() => {
              if (isSmall) {
                setLeftOpen(false);
                setRightOpen(false);
                return;
              }
              if (rightOverlay) {
                setRightOpen(false);
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
