import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Key } from '@react-types/shared';

import { usePortalMediaQuery } from '../../hooks/usePortalMediaQuery';
import { usePersistedNumber } from '../../hooks/usePersistedNumber';
import { usePortalNavTree } from '../../hooks/usePortalNavTree';
import type { NavNode } from '../../navigation/types';
import { findNavNodeById, findPathToNavNode } from '../../indexes/navTreeSelectors';
import type { Selection } from '../../../components/model/selection';
import { usePortalStore } from '../../store/usePortalStore';

type ResizeSide = null | 'left' | 'right';

export function usePortalViewPageState() {
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

  // React's RefObject<T> already allows `current` to be null.
  const shellBodyRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState<ResizeSide>(null);

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
  }, [isResizing, leftDocked, leftWidth, rightDocked, rightWidth, setLeftWidth, setRightWidth]);

  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<Key>>(new Set());

  const viewId = id ?? '';
  const view = model && id ? model.views[id] : null;

  // When navigating between views, clear the in-view selection to avoid confusing carry-over.
  useEffect(() => {
    setSelection({ kind: 'none' });
  }, [viewId]);

  const treeData = usePortalNavTree(model, rootFolderId);

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
      if (findNavNodeById(treeData, candidate)) return candidate;
    }

    if (viewId) {
      const candidate = `view:${viewId}`;
      if (findNavNodeById(treeData, candidate)) return candidate;
    }
    return null;
  }, [selection, treeData, viewId]);

  // Auto-expand the path to the active item so it is always visible.
  useEffect(() => {
    if (!preferredSelectedNodeId) return;
    const path = findPathToNavNode(treeData, preferredSelectedNodeId);
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
      const presentInView = Boolean(view && (view.layout?.nodes ?? []).some((n) => n.elementId === eid));

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
      if (
        next.kind === 'element' ||
        next.kind === 'viewNode' ||
        next.kind === 'viewNodes' ||
        next.kind === 'relationship'
      ) {
        setRightOpen(true);
      }
    }
  };

  const showBackdrop = (isSmall && (leftOpen || rightOpen)) || (rightOverlay && rightOpen);

  const shellBodyStyle =
    {
      '--shellLeftWidth': `${Math.round(leftWidth)}px`,
      '--shellRightWidth': `${Math.round(rightWidth)}px`,
    } as CSSProperties;

  return {
    // data
    datasetMeta,
    model,
    status,
    indexes,
    treeData,
    view,
    viewId,
    // ui breakpoints
    isSmall,
    isMedium,
    rightOverlay,
    // panels
    leftOpen,
    setLeftOpen,
    rightOpen,
    setRightOpen,
    leftDocked,
    rightDocked,
    leftWidth,
    rightWidth,
    setLeftWidth,
    setRightWidth,
    DEFAULT_LEFT_WIDTH,
    DEFAULT_RIGHT_WIDTH,
    // resize
    shellBodyRef,
    isResizing,
    setIsResizing,
    shellBodyStyle,
    // nav + selection
    selection,
    expandedNodeIds,
    setExpandedNodeIds,
    preferredSelectedNodeId,
    onActivateNode,
    onSelectionChange,
    // misc
    showBackdrop,
    navigate,
  };
}
