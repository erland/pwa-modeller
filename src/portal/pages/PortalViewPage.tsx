import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Key } from '@react-types/shared';

import { PortalDiagramViewer } from '../components/PortalDiagramViewer';
import { PortalInspectorPanel } from '../components/PortalInspectorPanel';
import { PortalNavigationTree } from '../components/PortalNavigationTree';
import { buildPortalNavTree } from '../navigation/buildPortalNavTree';
import type { NavNode } from '../navigation/types';
import type { Selection } from '../../components/model/selection';
import { usePortalStore } from '../store/usePortalStore';

export default function PortalViewPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { datasetMeta, model, status, indexes, rootFolderId } = usePortalStore();

  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<Key>>(new Set());

  const viewId = id ?? '';
  const view = model && id ? model.views[id] : null;

  // When navigating between views, clear the in-view selection to avoid confusing carry-over.
  useEffect(() => {
    setSelection({ kind: 'none' });
  }, [viewId]);

  const treeData = useMemo(() => {
    if (!model) return [];
    // Step 6: include elements to support element navigation + cross-highlighting.
    return buildPortalNavTree({ model, rootFolderId, includeElements: true });
  }, [model, rootFolderId]);

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
        return;
      }

      // Otherwise navigate to the element fact sheet page.
      navigate(`/portal/e/${encodeURIComponent(eid)}`);
    }
  };

  return (
    <div style={{ width: '100%', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'stretch',
          minHeight: 0,
          flexWrap: 'wrap'
        }}
      >
        {/* Left: navigation */}
        <div
          style={{
            width: 320,
            maxWidth: '100%',
            minHeight: 0,
            flex: '0 0 auto'
          }}
        >
          <div className="navigator" style={{ height: '100%', minHeight: 0 }}>
            <div className="navigatorHeader">
              <div className="navigatorModelName">Navigation</div>
              <div className="navigatorMeta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {datasetMeta?.title?.trim() || (status === 'loading' ? 'Loading…' : 'No dataset loaded')}
              </div>
            </div>
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

        {/* Right: main view + inspector */}
        <div style={{ flex: 1, minWidth: 320, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ marginTop: 0, marginBottom: 4 }}>View</h2>
            <div style={{ opacity: 0.7 }}>{view ? `“${view.name}”` : id ? `“${id}”` : '(missing param)'}</div>
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

              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'stretch',
                  minHeight: 0,
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: 1, minWidth: 320, minHeight: 0 }}>
                  <PortalDiagramViewer
                    model={model}
                    view={view}
                    viewId={viewId}
                    selection={selection}
                    onSelectionChange={setSelection}
                  />
                </div>

                <div style={{ width: 360, maxWidth: '100%', minHeight: 0 }}>
                  <PortalInspectorPanel model={model} selection={selection} indexes={indexes} />
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Link to="/portal">Back to portal home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
