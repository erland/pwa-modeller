// Drag payload for dragging an element from the tree into a view.
// NOTE: must match the MIME used by the navigator drag source.
const DND_ELEMENT_MIME = 'application/x-pwa-modeller-element-id';

export function dataTransferHasElement(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  const types = Array.from((dt as any).types ?? []);
  if (types.includes(DND_ELEMENT_MIME)) return true;

  // Many browsers (and some iOS/Safari versions) only reliably expose 'text/plain' during DnD.
  if (types.includes('text/plain')) {
    const s = String(dt.getData('text/plain') || '');
    // If we can detect our prefixed payload, only treat element drags as droppable on the canvas.
    if (s.startsWith('pwa-modeller:')) {
      return s.startsWith('pwa-modeller:element:');
    }
    // If empty or unrecognized, fall back to allowing it (legacy behavior).
    return true;
  }

  return false;
}

export function readDraggedElementId(dt: DataTransfer | null): string | null {
  if (!dt) return null;

  // If the dedicated element MIME is present, it should be a raw element id.
  const typed = dt.getData(DND_ELEMENT_MIME);
  if (typed) return String(typed);

  const raw = dt.getData('text/plain') || dt.getData('text/pwa-modeller-legacy-id');
  if (!raw) return null;

  const s = String(raw);

  // Cross-browser plain-text payload format:
  //   pwa-modeller:<kind>:<id>
  if (s.startsWith('pwa-modeller:')) {
    const parts = s.split(':');
    if (parts.length >= 3 && parts[1] === 'element') {
      return parts.slice(2).join(':');
    }
    return null; // view/folder drags are not elements
  }

  // Legacy fallback: plain element id.
  return s;
}
