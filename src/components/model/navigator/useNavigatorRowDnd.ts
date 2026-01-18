import type * as React from 'react';

import type { NavNode } from './types';
import { DND_ELEMENT_MIME, DND_FOLDER_MIME, DND_VIEW_MIME } from './types';
import { dndLog } from './dndUtils';

type Result = {
  draggable: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
};

export function useNavigatorRowDnd(node: NavNode): Result {
  const draggable =
    (node.kind === 'element' && Boolean(node.elementId))
    || (node.kind === 'view' && Boolean(node.viewId))
    || (node.kind === 'folder' && Boolean(node.folderId) && Boolean(node.canRename));

  const onDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    try {
      window.dispatchEvent(new CustomEvent('modelNavigator:dragstart'));
    } catch {
      // ignore
    }

    const dragId =
      (node.kind === 'element' && node.elementId)
      || (node.kind === 'view' && node.viewId)
      || (node.kind === 'folder' && node.folderId)
      || null;

    dndLog('tree dragstart (before setData)', {
      key: node.key,
      kind: node.kind,
      id: dragId,
      types: Array.from(e.dataTransfer?.types ?? []),
    });

    const payload =
      node.kind === 'element' && node.elementId
        ? { mime: DND_ELEMENT_MIME, id: node.elementId, effectAllowed: 'copyMove' as const }
        : node.kind === 'view' && node.viewId
          ? { mime: DND_VIEW_MIME, id: node.viewId, effectAllowed: 'move' as const }
          : node.kind === 'folder' && node.folderId && node.canRename
            ? { mime: DND_FOLDER_MIME, id: node.folderId, effectAllowed: 'move' as const }
            : null;

    if (!payload) return;

    try {
      e.dataTransfer.setData(payload.mime, payload.id);
      e.dataTransfer.setData('text/plain', `pwa-modeller:${node.kind}:${payload.id}`);
      // Also set legacy plain id for consumers that expect it (best-effort).
      try {
        e.dataTransfer.setData('text/pwa-modeller-legacy-id', payload.id);
      } catch {
        // ignore
      }
      // Elements can be copied into a view and moved into a folder. Views/folders are move-only.
      e.dataTransfer.effectAllowed = payload.effectAllowed;

      try {
        const ghost = document.createElement('div');
        ghost.textContent = node.label;
        ghost.style.position = 'fixed';
        ghost.style.top = '0';
        ghost.style.left = '0';
        ghost.style.padding = '6px 10px';
        ghost.style.borderRadius = '10px';
        ghost.style.background = 'rgba(0,0,0,0.75)';
        ghost.style.color = 'white';
        ghost.style.fontSize = '12px';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '999999';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 10, 10);
        setTimeout(() => ghost.remove(), 0);
      } catch {
        // ignore
      }

      dndLog('tree dragstart (after setData)', {
        key: node.key,
        id: payload.id,
        mime: payload.mime,
        types: Array.from(e.dataTransfer?.types ?? []),
      });
    } catch {
      // Ignore (some test environments may not fully implement DataTransfer)
    }
  };

  const onDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    try {
      window.dispatchEvent(new CustomEvent('modelNavigator:dragend'));
    } catch {
      // ignore
    }
    const dragId =
      (node.kind === 'element' && node.elementId)
      || (node.kind === 'view' && node.viewId)
      || (node.kind === 'folder' && node.folderId)
      || null;

    const mime =
      node.kind === 'element' && node.elementId
        ? DND_ELEMENT_MIME
        : node.kind === 'view' && node.viewId
          ? DND_VIEW_MIME
          : node.kind === 'folder' && node.folderId && node.canRename
            ? DND_FOLDER_MIME
            : undefined;

    const dt = e.dataTransfer;
    dndLog('tree dragend', {
      key: node.key,
      kind: node.kind,
      id: dragId,
      mime,
      dropEffect: dt?.dropEffect || undefined,
      effectAllowed: dt?.effectAllowed || undefined,
    });
  };

  return { draggable, onDragStart, onDragEnd };
}
