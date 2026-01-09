// Drag payload for dragging an element from the tree into a view.
// NOTE: must match the MIME used by the navigator drag source.
const DND_ELEMENT_MIME = 'application/x-pwa-modeller-element-id';

export function dataTransferHasElement(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  const types = Array.from(dt.types ?? []);
  return types.includes(DND_ELEMENT_MIME) || types.includes('text/plain');
}

export function readDraggedElementId(dt: DataTransfer | null): string | null {
  if (!dt) return null;

  const raw = dt.getData(DND_ELEMENT_MIME) || dt.getData('text/plain') || dt.getData('text/pwa-modeller-legacy-id');
  if (!raw) return null;

  const s = String(raw);

  // Preferred plain-text payload format for cross-browser compatibility:
  //   pwa-modeller:element:<id>
  // (Views/folders use other kinds and should be ignored here.)
  if (s.startsWith('pwa-modeller:')) {
    const parts = s.split(':');
    if (parts.length >= 3 && parts[1] === 'element') {
      return parts.slice(2).join(':');
    }
    return null;
  }

  // Legacy fallback: plain element id (avoid misinterpreting view/folder ids).
  if (s.startsWith('element_')) return s;
  return null;
}

