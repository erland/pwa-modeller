import type { IRModel, IRView } from '../../framework/ir';

/**
 * Infer view kind (archimate/uml/bpmn) for EA XMI diagrams.
 *
 * Some EA exports stamp MDG metadata (e.g. MDGDgm) with a default diagram type even when the diagram content
 * is UML or BPMN. We therefore infer the view kind primarily from the placed elements (resolved IR nodes).
 *
 * Result is stored on `view.meta.viewKind` and consumed by applyViews().
 */
export function inferEaXmiViewKinds(views: IRView[] | undefined, elements: IRModel['elements'] | undefined): IRView[] | undefined {
  if (!views) return views;
  if (!elements || elements.length === 0) return views;

  const typeById: Record<string, string> = {};
  for (const e of elements) {
    if (typeof e?.id === 'string' && typeof (e as any).type === 'string') {
      typeById[e.id] = (e as any).type;
    }
  }

  const scoreKind = (t: string): 'archimate' | 'uml' | 'bpmn' | undefined => {
    const tt = (t ?? '').toLowerCase();
    if (tt.startsWith('bpmn.')) return 'bpmn';
    if (tt.startsWith('uml.')) return 'uml';
    if (tt.startsWith('archimate.')) return 'archimate';
    return undefined;
  };

  const decide = (counts: Record<'archimate'|'uml'|'bpmn', number>): 'archimate' | 'uml' | 'bpmn' | undefined => {
    const { archimate, uml, bpmn } = counts;
    const max = Math.max(archimate, uml, bpmn);
    if (max <= 0) return undefined;

    // If tied, prefer the more specific notations over the default ArchiMate.
    const tied: Array<'bpmn'|'uml'|'archimate'> = [];
    if (bpmn === max) tied.push('bpmn');
    if (uml === max) tied.push('uml');
    if (archimate === max) tied.push('archimate');
    return tied[0];
  };

  const next: IRView[] = [];

  for (const v of views) {
    const counts = { archimate: 0, uml: 0, bpmn: 0 } as Record<'archimate'|'uml'|'bpmn', number>;

    for (const n of v.nodes ?? []) {
      const elId = (n as any).elementId;
      if (typeof elId !== 'string') continue;
      const t = typeById[elId];
      if (!t) continue;
      const k = scoreKind(t);
      if (k) counts[k] += 1;
    }

    // Gentle hinting from EA diagram type if present (but do not override strong content signal).
    const diaType = (v.viewpoint ?? (v.meta as any)?.eaDiagramType ?? '').toString().toLowerCase();
    if (diaType.includes('bpmn')) counts.bpmn += 0.5;
    if (diaType.includes('uml')) counts.uml += 0.5;
    if (diaType.includes('archimate')) counts.archimate += 0.25;

    const inferred = decide(counts);

    if (!inferred) {
      next.push(v);
      continue;
    }

    next.push({
      ...v,
      meta: {
        ...(v.meta ?? {}),
        viewKind: inferred
      }
    });
  }

  return next;
}
