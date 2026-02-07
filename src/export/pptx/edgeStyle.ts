import type { PptxEdgeMeta } from './pptxPostProcessMeta';

export type PptxEndType = 'none' | 'arrow' | 'triangle' | 'diamond' | 'oval';
export type PptxLinePattern = 'solid' | 'dashed' | 'dotted';
export type LnDashValue = 'solid' | 'dash' | 'dot';

export type MarkerEdgeStyle = {
  pattern?: PptxLinePattern;
  head?: PptxEndType;
  tail?: PptxEndType;
};

export type ResolvedEdgeStyle = {
  dash: LnDashValue;
  head: PptxEndType;
  tail: PptxEndType;
};

/**
 * Resolve connector style using a strict precedence:
 * 1) explicit values on edge meta (linePattern, pptxHeadEnd/pptxTailEnd)
 * 2) marker-provided style (EA_EDGEID:…|pattern:…|head:…|tail:…)
 * 3) legacy meta flag `dashed` (treated as 'dashed')
 * 4) defaults: solid + no ends
 */
export function resolveEdgeStyle(edgeMeta?: PptxEdgeMeta | null, marker?: MarkerEdgeStyle | null): ResolvedEdgeStyle {
  const pat: PptxLinePattern =
    (edgeMeta?.linePattern ??
      marker?.pattern ??
      (edgeMeta?.dashed ? 'dashed' : 'solid')) as PptxLinePattern;

  const dash: LnDashValue = pat === 'dashed' ? 'dash' : pat === 'dotted' ? 'dot' : 'solid';

  const head = (edgeMeta?.pptxHeadEnd ?? marker?.head ?? 'none') as ResolvedEdgeStyle['head'];
  const tail = (edgeMeta?.pptxTailEnd ?? marker?.tail ?? 'none') as ResolvedEdgeStyle['tail'];

  return { dash, head, tail };
}
