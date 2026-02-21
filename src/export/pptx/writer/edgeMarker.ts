import type { PptxEdgeIR } from '../ir/types';

export type EncodedEdgeMarker = {
  altText: string;
  pattern: 'solid' | 'dashed' | 'dotted';
  head: string;
  tail: string;
};

/**
 * Canonical encoding for edge markers used by PPTX post-processing.
 *
 * Format (kept stable for backward compatibility):
 *   EA_EDGEID:<edgeId>|<fromId>-><toId>|<relType>|h=<head>|t=<tail>|p=<pattern>
 */
export function encodeEdgeMarker(edge: PptxEdgeIR): EncodedEdgeMarker {
  const head = edge.pptxHeadEnd ?? 'none';
  const tail = edge.pptxTailEnd ?? 'none';
  const pattern = (edge.linePattern ?? (edge.dashed ? 'dashed' : 'solid')) as EncodedEdgeMarker['pattern'];
  const altText = `EA_EDGEID:${edge.id}|${edge.fromId ?? ''}->${edge.toId ?? ''}|${edge.relType ?? ''}|h=${head}|t=${tail}|p=${pattern}`;
  return { altText, head, tail, pattern };
}
