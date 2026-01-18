import { DND_ELEMENT_MIME, DND_FOLDER_MIME, DND_VIEW_MIME } from './types';

const DND_DEBUG = typeof window !== 'undefined' && window.localStorage?.getItem('pwaModellerDndDebug') === '1';

export function dndLog(...args: unknown[]) {
  if (!DND_DEBUG) return;
  console.log('[PWA Modeller DND]', ...args);
}

export type DragKind = 'element' | 'view' | 'folder';

export function parsePlainTextPayload(dt: DataTransfer): { kind: DragKind; id: string } | null {
  try {
    const raw = dt.getData('text/plain');
    if (!raw) return null;
    const s = String(raw);

    if (s.startsWith('pwa-modeller:')) {
      const parts = s.split(':');
      if (parts.length >= 3) {
        const kind = parts[1];
        const id = parts.slice(2).join(':');
        if ((kind === 'element' || kind === 'view' || kind === 'folder') && id) {
          return { kind, id };
        }
      }
      return null;
    }

    // Legacy fallback: infer kind based on id prefix.
    if (s.startsWith('element_')) return { kind: 'element', id: s };
    if (s.startsWith('view_')) return { kind: 'view', id: s };
    if (s.startsWith('folder_')) return { kind: 'folder', id: s };
  } catch {
    // ignore
  }
  return null;
}

export function parseDraggedElementId(dt: DataTransfer | null): string | null {
  if (!dt) return null;
  try {
    const id = dt.getData(DND_ELEMENT_MIME);
    if (id) return id;
  } catch {
    // ignore
  }
  const p = parsePlainTextPayload(dt);
  return p?.kind === 'element' ? p.id : null;
}

export function parseDraggedViewId(dt: DataTransfer | null): string | null {
  if (!dt) return null;
  try {
    const id = dt.getData(DND_VIEW_MIME);
    if (id) return id;
  } catch {
    // ignore
  }
  const p = parsePlainTextPayload(dt);
  return p?.kind === 'view' ? p.id : null;
}

export function parseDraggedFolderId(dt: DataTransfer | null): string | null {
  if (!dt) return null;
  try {
    const id = dt.getData(DND_FOLDER_MIME);
    if (id) return id;
  } catch {
    // ignore
  }
  const p = parsePlainTextPayload(dt);
  return p?.kind === 'folder' ? p.id : null;
}

export function isMaybeSupportedDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  try {
    const types = Array.from(dt.types ?? []);
    // Note: some browsers restrict getData() during dragover, but types are still visible.
    return (
      types.includes(DND_ELEMENT_MIME)
      || types.includes(DND_VIEW_MIME)
      || types.includes(DND_FOLDER_MIME)
      || types.includes('text/plain')
    );
  } catch {
    return false;
  }
}
