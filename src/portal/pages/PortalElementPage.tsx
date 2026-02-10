import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Key } from '@react-types/shared';

import '../../styles/shell.css';

import { usePortalStore } from '../store/usePortalStore';
import { getElementFactSheetData, resolveElementIdFromExternalId } from '../indexes/portalIndexes';

import { PortalNavigationTree } from '../components/PortalNavigationTree';
import type { NavNode } from '../navigation/types';
import { usePortalNavTree } from '../hooks/usePortalNavTree';

import { formatElementTypeLabel, formatRelationshipTypeLabel } from '../../components/ui/typeLabels';
import { usePortalMediaQuery } from '../hooks/usePortalMediaQuery';
import { usePersistedNumber } from '../hooks/usePersistedNumber';
import { Card, Pill, SmallButton } from '../components/factsheet/FactSheetPrimitives';
import { copyText } from '../utils/copyText';
import { readTaggedValue } from '../utils/taggedValues';
import { isUmlClassifierType, formatUmlAttribute, formatUmlOperation } from '../utils/umlFormatters';
import { safeJsonStringify } from '../utils/safeJsonStringify';
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
  const elementTypeLabel = data ? formatElementTypeLabel({ type: elementType }) : '';
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
    return findNodeById(treeData, candidate) ? candidate : null;
  }, [resolvedElementId, treeData]);

  // Auto-expand the path to the selected element so it is always visible.
  useEffect(() => {
    if (!selectedNodeId) return;
    const path = findPathToNode(treeData, selectedNodeId);
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
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            <Link to="/portal">Portal</Link>
            <span style={{ opacity: 0.6 }}> / </span>
            <span>Element</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{data ? elementDisplayName : 'Element'}</h2>
            {data ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Pill>
                  {elementTypeLabel || 'Unknown'}
                </Pill>
                {elementKind ? <Pill>{elementKind}</Pill> : null}
                {elementLayer ? <Pill>{elementLayer}</Pill> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {data ? (
            <>
              <SmallButton title="Copy internal link" onClick={() => onCopy('internal-link', internalLink)}>
                Copy link
              </SmallButton>
              {bestExternalIdKey ? (
                <SmallButton title="Copy externalId link" onClick={() => onCopy('external-link', externalLink)}>
                  Copy externalId link
                </SmallButton>
              ) : null}
            </>
          ) : null}
          {copied ? <span style={{ fontSize: 12, opacity: 0.75 }}>{copied === 'copy-failed' ? 'Copy failed' : 'Copied'}</span> : null}
        </div>
      </div>

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
            <Card title="Summary">
              {data.element.documentation ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{data.element.documentation}</div>
              ) : (
                <div style={{ opacity: 0.7 }}>(No description)</div>
              )}
            </Card>

            {umlMembers && umlMembers.attributes.length ? (
              <Card title="Attributes">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {umlMembers.attributes.map((a, idx) => (
                    <li key={`${a.name}-${idx}`} style={{ marginBottom: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                      {formatUmlAttribute(a)}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {umlMembers && umlMembers.operations.length ? (
              <Card title="Operations">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {umlMembers.operations.map((o, idx) => (
                    <li key={`${o.name}-${idx}`} style={{ marginBottom: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                      {formatUmlOperation(o)}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card title="Relationships">
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Outgoing</div>
                  {data.relations.outgoing.length ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {data.relations.outgoing.map((g) => (
                        <div key={`out-${g.relType}`}>
                          <div style={{ opacity: 0.85, marginBottom: 4 }}>
                            {formatRelationshipTypeLabel({ type: g.relType })} <span style={{ opacity: 0.7 }}>· {g.items.length}</span>
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {g.items.map((it) => (
                              <li key={it.id} style={{ marginBottom: 4 }}>
                                {it.otherElementId ? (
                                  <Link to={`/portal/e/${encodeURIComponent(it.otherElementId)}`}>{it.otherElementName || it.otherElementId}</Link>
                                ) : (
                                  <span style={{ opacity: 0.7 }}>(non-element endpoint)</span>
                                )}
                                <span style={{ opacity: 0.75 }}> — </span>
                                <span style={{ opacity: 0.85 }}>
                                  {formatRelationshipTypeLabel({ type: it.type })}
                                  {it.name ? <span style={{ opacity: 0.85 }}> · {it.name}</span> : null}
                                </span>
                                {it.documentation ? (
                                  <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2, whiteSpace: 'pre-wrap' }}>{it.documentation}</div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ opacity: 0.7 }}>(none)</div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--borderColor, rgba(0,0,0,0.12))', paddingTop: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Incoming</div>
                  {data.relations.incoming.length ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {data.relations.incoming.map((g) => (
                        <div key={`in-${g.relType}`}>
                          <div style={{ opacity: 0.85, marginBottom: 4 }}>
                            {formatRelationshipTypeLabel({ type: g.relType })} <span style={{ opacity: 0.7 }}>· {g.items.length}</span>
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {g.items.map((it) => (
                              <li key={it.id} style={{ marginBottom: 4 }}>
                                {it.otherElementId ? (
                                  <Link to={`/portal/e/${encodeURIComponent(it.otherElementId)}`}>{it.otherElementName || it.otherElementId}</Link>
                                ) : (
                                  <span style={{ opacity: 0.7 }}>(non-element endpoint)</span>
                                )}
                                <span style={{ opacity: 0.75 }}> — </span>
                                <span style={{ opacity: 0.85 }}>
                                  {formatRelationshipTypeLabel({ type: it.type })}
                                  {it.name ? <span style={{ opacity: 0.85 }}> · {it.name}</span> : null}
                                </span>
                                {it.documentation ? (
                                  <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2, whiteSpace: 'pre-wrap' }}>{it.documentation}</div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ opacity: 0.7 }}>(none)</div>
                  )}
                </div>
              </div>
            </Card>

            <Card title="Used in views">
              {data.usedInViews.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {data.usedInViews.map((v) => (
                    <li key={v.id}>
                      <Link to={`/portal/v/${encodeURIComponent(v.id)}`}>{v.name}</Link> <span style={{ opacity: 0.7 }}>({v.kind})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ opacity: 0.7 }}>(none)</div>
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div style={{ display: 'grid', gap: 12 }}>
            <Card
              title="Identifiers"
              right={
                <SmallButton title="Copy internal id" onClick={() => onCopy('id', data.elementId)}>
                  Copy id
                </SmallButton>
              }
            >
              <div style={{ display: 'grid', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Internal id</div>
                  <code style={{ wordBreak: 'break-all' }}>{data.elementId}</code>
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>External ids</div>
                  {data.externalIdKeys.length ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {data.externalIdKeys.map((k) => (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <Link to={`/portal/e/ext/${encodeURIComponent(k)}`} style={{ wordBreak: 'break-all' }}>
                            {k}
                          </Link>
                          <SmallButton title="Copy external id" onClick={() => onCopy('externalId', k)}>
                            Copy
                          </SmallButton>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ opacity: 0.7 }}>(none)</div>
                  )}
                </div>
              </div>
            </Card>

            <Card title="Other information">
              <div style={{ display: 'grid', gap: 10 }}>
                {Array.isArray(data.element.taggedValues) && data.element.taggedValues.length ? (
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Tagged values</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {data.element.taggedValues
                        .map((tv) => readTaggedValue(tv))
                        .filter(Boolean)
                        .map((tv, idx) => {
                          const t = tv as { label: string; type?: string; value: string };
                          return (
                            <div
                              key={`${t.label}-${idx}`}
                              style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 2fr', gap: 10, alignItems: 'baseline' }}
                            >
                              <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', opacity: 0.9 }}>
                                {t.label}
                                {t.type ? <span style={{ opacity: 0.7 }}> ({t.type})</span> : null}
                              </div>
                              <div style={{ wordBreak: 'break-word' }}>{t.value}</div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <div style={{ opacity: 0.7 }}>(No tagged values)</div>
                )}

                {data.element.attrs != null ? (
                  <details>
                    <summary style={{ cursor: 'pointer', opacity: 0.85 }}>Raw attributes</summary>
                    <pre style={{ marginTop: 8, padding: 10, borderRadius: 10, border: '1px solid var(--borderColor, rgba(0,0,0,0.12))', overflow: 'auto' }}>
                      {safeJsonStringify(data.element.attrs)}
                    </pre>
                  </details>
                ) : null}
              </div>
            </Card>
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
