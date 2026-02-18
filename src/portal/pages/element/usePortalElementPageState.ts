import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Key } from '@react-types/shared';

import { usePortalStore } from '../../store/usePortalStore';
import { getElementFactSheetData, resolveElementIdFromExternalId } from '../../indexes/portalIndexes';
import { usePortalNavTree } from '../../hooks/usePortalNavTree';
import type { NavNode } from '../../navigation/types';
import { findNavNodeById, findPathToNavNode } from '../../indexes/navTreeSelectors';
import { usePortalMediaQuery } from '../../hooks/usePortalMediaQuery';
import { usePersistedNumber } from '../../hooks/usePersistedNumber';
import { copyText } from '../../utils/copyText';
import { isUmlClassifierType } from '../../utils/umlFormatters';
import { readUmlClassifierMembers } from '../../../domain/uml/members';

export type PortalElementPageProps = { mode: 'internalId' } | { mode: 'externalId' };

export function usePortalElementPageState(props: PortalElementPageProps) {
  const params = useParams();
  const navigate = useNavigate();
  const { datasetMeta, model, indexes, rootFolderId, status } = usePortalStore();
  const [copied, setCopied] = useState<string | null>(null);

  const isSmall = usePortalMediaQuery('(max-width: 720px)');

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

  // React's RefObject<T> already allows `current` to be null.
  const shellBodyRef = useRef<HTMLDivElement>(null);
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
  }, [isResizing, setLeftWidth]);

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
    return readUmlClassifierMembers(data.element, { includeEmptyNames: false });
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

  const shellBodyStyle =
    {
      '--shellLeftWidth': `${Math.round(leftWidth)}px`,
    } as CSSProperties;

  return {
    datasetMeta,
    model,
    indexes,
    rootFolderId,
    status,
    params,
    navigate,
    // view model
    treeData,
    expandedNodeIds,
    setExpandedNodeIds,
    selectedNodeId,
    onActivateNode,
    resolvedElementId,
    data,
    internalLink,
    bestExternalIdKey,
    externalLink,
    copied,
    onCopy,
    elementDisplayName,
    elementType,
    elementKind,
    elementLayer,
    umlMembers,
    // shell
    isSmall,
    leftOpen,
    setLeftOpen,
    leftDocked,
    leftWidth,
    setLeftWidth,
    DEFAULT_LEFT_WIDTH,
    shellBodyRef,
    isResizing,
    setIsResizing,
    shellBodyStyle,
    showBackdrop,
    mode: props.mode,
  };
}
