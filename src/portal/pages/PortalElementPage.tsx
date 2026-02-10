import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Key } from '@react-types/shared';

import '../../styles/shell.css';

import { usePortalStore } from '../store/usePortalStore';
import { getElementFactSheetData, resolveElementIdFromExternalId } from '../indexes/portalIndexes';

import { PortalNavigationTree } from '../components/PortalNavigationTree';
import type { NavNode } from '../navigation/types';
import { usePortalNavTree } from '../hooks/usePortalNavTree';
import { findNavNodeById, findPathToNavNode } from '../indexes/navTreeSelectors';

import { usePortalMediaQuery } from '../hooks/usePortalMediaQuery';
import { usePersistedNumber } from '../hooks/usePersistedNumber';
import { Card } from '../components/factsheet/FactSheetPrimitives';
import { ElementFactSheetHeader } from '../components/factsheet/ElementFactSheetHeader';
import { ElementSummaryCard } from '../components/factsheet/ElementSummaryCard';
import { ElementUmlMembersCards } from '../components/factsheet/ElementUmlMembersCards';
import { ElementRelationshipsCard } from '../components/factsheet/ElementRelationshipsCard';
import { ElementUsedInViewsCard } from '../components/factsheet/ElementUsedInViewsCard';
import { ElementIdentifiersCard } from '../components/factsheet/ElementIdentifiersCard';
import { ElementOtherInfoCard } from '../components/factsheet/ElementOtherInfoCard';
import { copyText } from '../utils/copyText';
import { isUmlClassifierType } from '../utils/umlFormatters';
import { readUmlClassifierMembers } from '../../domain/uml/members';

type PortalElementPageProps = { mode: 'internalId' } | { mode: 'externalId' };

export default function PortalElementPage(props: PortalElementPageProps) {
  const params = useParams();
  const navigate = useNavigate();
  const { datasetMeta, model, indexes, rootFolderId, status } = usePortalStore();
  const [copied, setCopied] = useState<string | null>(null);

  const isSmall = usePortalMediaQuery('(max-width: 720px)');
  // For the element fact sheet we intentionally do NOT show the inspector; the fact sheet occupies the whole workspace.
  // Persisted sidebar widths (dock mode only)
  const DEFAULT_LEFT_WIDTH = 320;
  const MIN_LEFT_WIDTH = 220;
  const MIN_MAIN_WIDTH = 360;

  const [leftWidth, setLeftWidth] = usePersistedNumber('portalLeftWidthPx', DEFAULT_LEFT_WIDTH);

  const [leftOpen, setLeftOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    const v = window.localStorage.getItem('portalLeftOpen');
    if (v === 'true') return true;
    if (v === 'false') return false;
    return window.innerWidth > 900;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('portalLeftOpen', String(Boolean(leftOpen)));
  }, [leftOpen]);

  // When entering small screens, close the drawer by default.
  useEffect(() => {
    if (isSmall) setLeftOpen(false);
  }, [isSmall]);

  const shellBodyRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const leftDocked = leftOpen && !isSmall;

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (ev: PointerEvent) => {
      const el = shellBodyRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
      const maxLeft = Math.max(MIN_LEFT_WIDTH, rect.width - MIN_MAIN_WIDTH);
      const next = clamp(ev.clientX - rect.left, MIN_LEFT_WIDTH, maxLeft);
      setLeftWidth(next);
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isResizing]);

  const treeData = usePortalNavTree(model, rootFolderId);

  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<Key>>(new Set());

  const resolvedElementId = useMemo(() => {
    if (!datasetMeta || !model || !indexes) return null;
    if (props.mode === 'internalId') return params.id ?? null;
    const ext = params.externalId ?? '';
    return ext ? resolveElementIdFromExternalId(indexes, ext) : null;
  }, [datasetMeta, indexes, model, params.externalId, params.id, props.mode]);

  const data = useMemo(() => {
    if (!datasetMeta || !model || !indexes || !resolvedElementId) return null;
    return getElementFactSheetData(model, indexes, resolvedElementId);
  }, [datasetMeta, indexes, model, resolvedElementId]);

  const internalLink = useMemo(() => {
    if (!data) return '';
    return `${location.origin}${location.pathname}#/portal/e/${encodeURIComponent(data.elementId)}`;
  }, [data]);

  const bestExternalIdKey = useMemo(() => {
    if (!data?.externalIdKeys?.length) return '';
    return data.externalIdKeys[0];
  }, [data]);

  const externalLink = useMemo(() => {
    if (!bestExternalIdKey) return '';
    return `${location.origin}${location.pathname}#/portal/e/ext/${encodeURIComponent(bestExternalIdKey)}`;
  }, [bestExternalIdKey]);

  const onCopy = useCallback(async (kind: string, value: string) => {
    const ok = await copyText(value);
    setCopied(ok ? kind : 'copy-failed');
    window.setTimeout(() => setCopied(null), 1200);
  }, []);

  const elementDisplayName = data?.element?.name || '(unnamed)';
  const elementType = data ? String(data.element?.type ?? '') : '';
  const elementKind = data?.element?.kind;
  const elementLayer = data?.element?.layer;

  const umlMembers = useMemo(() => {
    if (!data) return null;
    if (!isUmlClassifierType(String(data.element?.type ?? ''))) return null;
    const m = readUmlClassifierMembers(data.element, { includeEmptyNames: false });
    return m;
  }, [data]);

  const selectedNodeId = useMemo(() => {
    if (!resolvedElementId) return null;
    const candidate = `element:${resolvedElementId}`;
    return findNavNodeById(treeData, candidate) ? candidate : null;
  }, [resolvedElementId, treeData]);

  // Auto-expand the path to the selected element so it is always visible.
  useEffect(() => {
    if (!selectedNodeId) return;
    const path = findPathToNavNode(treeData, selectedNodeId);
    if (!path || !path.length) return;
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      for (const k of path) next.add(k);
      return next;
    });
  }, [selectedNodeId, treeData]);

  const onActivateNode = (node: NavNode) => {
    if (node.kind === 'view') {
      const vid = node.payloadRef.viewId;
      if (vid) navigate(`/portal/v/${encodeURIComponent(vid)}`);
      return;
    }
    if (node.kind === 'element') {
      const eid = node.payloadRef.elementId;
      if (eid) navigate(`/portal/e/${encodeURIComponent(eid)}`);
    }
  };

  const showBackdrop = isSmall && leftOpen;

  return (
    <div className={['shell', isResizing ? 'isResizing' : null].filter(Boolean).join(' ')} style={{ width: '100%', minHeight: 0 }}>
      <div
        ref={shellBodyRef}
        style={
          {
            '--shellLeftWidth': `${Math.round(leftWidth)}px`,
          } as CSSProperties
        }
        className={['shellBody', leftDocked ? 'isLeftDockedOpen' : null].filter(Boolean).join(' ')}
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
                  selectedNodeId={selectedNodeId}
                  expandedNodeIds={expandedNodeIds}
                  onExpandedNodeIdsChange={setExpandedNodeIds}
                  onActivateNode={onActivateNode}
                  activeViewId={undefined}
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
                setIsResizing(true);
              }}
            />
          ) : null}
        </aside>

        {/* Main */}
        <main className="shellMain" style={{ minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ marginTop: 0, marginBottom: 4 }}>Fact sheet</h2>
              <div style={{ opacity: 0.7 }}>{data ? `“${elementDisplayName}”` : resolvedElementId ? `“${resolvedElementId}”` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="shellIconButton"
                aria-label="Toggle navigation"
                onClick={() => setLeftOpen((v) => !v)}
                title={leftOpen ? 'Hide navigation' : 'Show navigation'}
              >
                ☰
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            {data ? (
              <ElementFactSheetHeader
                elementDisplayName={elementDisplayName}
                elementType={elementType}
                elementKind={elementKind}
                elementLayer={elementLayer}
                internalLink={internalLink}
                bestExternalIdKey={bestExternalIdKey}
                externalLink={externalLink}
                copied={copied}
                onCopy={onCopy}
              />
            ) : null}

      {!datasetMeta ? (
        <Card>
          <strong>No dataset loaded.</strong>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Use <em>Change dataset</em> in the top bar to point the portal to a hosted <code>latest.json</code>.
          </div>
        </Card>
      ) : !model || !indexes ? (
        <Card>
          <strong>Dataset is loading…</strong>
        </Card>
      ) : !resolvedElementId ? (
        <Card>
          <strong>Element not found.</strong>
          {props.mode === 'externalId' ? (
            <div style={{ marginTop: 6, opacity: 0.85 }}>
              No match for externalId <code>{params.externalId}</code>.
            </div>
          ) : (
            <div style={{ marginTop: 6, opacity: 0.85 }}>
              No match for id <code>{params.id}</code>.
            </div>
          )}
        </Card>
      ) : !data ? (
        <Card>
          <strong>Element not found in model.</strong>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, alignItems: 'start' }}>
          {/* Main column */}
          <div style={{ display: 'grid', gap: 12 }}>
            <ElementSummaryCard documentation={data.element.documentation} />
            <ElementUmlMembersCards umlMembers={umlMembers} />
            <ElementRelationshipsCard relations={data.relations} />
            <ElementUsedInViewsCard usedInViews={data.usedInViews} />
          </div>

          {/* Sidebar */}
          <div style={{ display: 'grid', gap: 12 }}>
            <ElementIdentifiersCard elementId={data.elementId} externalIdKeys={data.externalIdKeys} onCopy={onCopy} />
            <ElementOtherInfoCard taggedValues={data.element.taggedValues} attrs={data.element.attrs} />
          </div>
        </div>
      )}
          </div>
        </main>

        {showBackdrop ? (
          <div className="shellBackdrop" aria-hidden="true" onClick={() => setLeftOpen(false)} />
        ) : null}
      </div>
    </div>
  );
}
