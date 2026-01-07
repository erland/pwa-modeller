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
  const id = dt.getData(DND_ELEMENT_MIME) || dt.getData('text/plain');
  return id ? String(id) : null;
}
