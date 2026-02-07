/**
 * Marker parsing helpers used by PPTX export.
 *
 * These strings are embedded in shape names/descriptions to allow a later pass
 * to rebuild proper connectors.
 *
 * Keep these helpers PURE and well-tested – they are easy to accidentally break.
 */

export type EdgeMarkerInfo = { from: string; to: string; relType?: string };

export type MarkerEnd = 'none' | 'arrow' | 'triangle' | 'diamond' | 'oval';
export type LinePattern = 'solid' | 'dashed' | 'dotted';

export type EdgeIdStyleMarkerInfo = {
  edgeId: string;
  from?: string;
  to?: string;
  relType?: string;
  head?: MarkerEnd;
  tail?: MarkerEnd;
  pattern?: LinePattern;
};

export function parseNodeMarker(marker: string): string | null {
  if (!marker.startsWith('EA_NODE:')) return null;
  const v = marker.slice('EA_NODE:'.length).trim();
  return v ? v : null;
}

export function parseEdgeMarker(marker: string): EdgeMarkerInfo | null {
  if (!marker.startsWith('EA_EDGE:')) return null;
  const v = marker.slice('EA_EDGE:'.length).trim();
  const parts = v.split('|');
  const core = (parts[0] ?? '').trim();
  const relType = (parts[1] ?? '').trim() || undefined;
  const mm = core.match(/^([^\s]+)->([^\s]+)$/);
  if (!mm) return null;
  return { from: mm[1], to: mm[2], relType };
}

function asMarkerEnd(v: string | undefined): MarkerEnd | undefined {
  if (!v) return undefined;
  switch (v) {
    case 'none':
    case 'triangle':
    case 'arrow':
    case 'diamond':
    case 'oval':
      return v;
    default:
      return undefined;
  }
}

function asLinePattern(v: string | undefined): LinePattern | undefined {
  if (!v) return undefined;
  switch (v) {
    case 'solid':
    case 'dashed':
    case 'dotted':
      return v;
    default:
      return undefined;
  }
}

/**
 * Parses markers like:
 *   EA_EDGEID:123|nodeA->nodeB|Serving|h=triangle|t=none|p=dashed
 */
export function parseEdgeIdStyleMarker(marker: string): EdgeIdStyleMarkerInfo | null {
  if (!marker.startsWith('EA_EDGEID:')) return null;
  const rest = marker.slice('EA_EDGEID:'.length).trim();
  const rawParts = rest.split('|').map((p) => p.trim());

  // EdgeId must be the first segment (before the first '|'). Do not skip empty segments.
  const edgeId = rawParts[0] ?? '';
  if (!edgeId) return null;

  // Optional segments may be missing; for those we can safely ignore empty parts.
  const parts = rawParts.filter((p) => p.length > 0);

  const fromToPart = parts.find((p) => p.includes('->'));
  let from: string | undefined;
  let to: string | undefined;
  if (fromToPart) {
    const mm = fromToPart.match(/^([^\s]+)->([^\s]+)$/);
    if (mm) {
      from = mm[1];
      to = mm[2];
    }
  }

  const relType =
    parts.find(
      (p) =>
        p !== edgeId &&
        !p.includes('->') &&
        !p.startsWith('h=') &&
        !p.startsWith('t=') &&
        !p.startsWith('p=')
    ) || undefined;

  const head = asMarkerEnd(parts.find((p) => p.startsWith('h='))?.slice(2) ?? undefined);
  const tail = asMarkerEnd(parts.find((p) => p.startsWith('t='))?.slice(2) ?? undefined);
  const pattern = asLinePattern(parts.find((p) => p.startsWith('p='))?.slice(2) ?? undefined);

  return { edgeId, from, to, relType, head, tail, pattern };
}
