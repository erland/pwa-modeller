import type { IRModel, IRView } from '../../framework/ir';

/**
 * Infer view kind (archimate/uml/bpmn) for EA XMI diagrams.
 *
 * Some EA exports stamp MDG metadata (e.g. MDGDgm) with a default diagram type even when the diagram content
 * is UML or BPMN. We therefore infer the view kind primarily from the placed elements (resolved IR nodes).
 *
 * Result is stored on `view.meta.viewKind` and consumed by applyViews().
 */
export function inferEaXmiViewKinds(
  views: IRView[] | undefined,
  elements: IRModel['elements'] | undefined,
  relationships: IRModel['relationships'] | undefined
): IRView[] | undefined {
  if (!views) return views;
  const hasElements = !!elements && elements.length > 0;
  const hasRels = !!relationships && relationships.length > 0;
  if (!hasElements && !hasRels) return views;

  // EA XMI IR elements/relationships normally have an explicit `kind` field (archimate/uml/bpmn).
  // The `type` field is not reliable for kind inference because ArchiMate types are e.g. "ApplicationComponent"
  // (no "archimate." prefix), whereas UML/BPMN often use prefixed types.
  const kindByElementId: Record<string, 'archimate' | 'uml' | 'bpmn'> = {};
  const typeByElementId: Record<string, string> = {};
  for (const e of elements ?? []) {
    const id = typeof e?.id === 'string' ? e.id : undefined;
    if (!id) continue;
    const k = (e as any).kind;
    if (k === 'archimate' || k === 'uml' || k === 'bpmn') kindByElementId[id] = k;
    if (typeof (e as any).type === 'string') typeByElementId[id] = (e as any).type;
  }

  const kindByRelationshipId: Record<string, 'archimate' | 'uml' | 'bpmn'> = {};
  const typeByRelationshipId: Record<string, string> = {};
  for (const r of relationships ?? []) {
    const id = typeof r?.id === 'string' ? r.id : undefined;
    if (!id) continue;
    const k = (r as any).kind;
    if (k === 'archimate' || k === 'uml' || k === 'bpmn') kindByRelationshipId[id] = k;
    if (typeof (r as any).type === 'string') typeByRelationshipId[id] = (r as any).type;
  }

  const scoreKindFromType = (t: string): 'archimate' | 'uml' | 'bpmn' | undefined => {
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
    let evidence = 0;

    for (const n of v.nodes ?? []) {
      const elId = (n as any).elementId;
      if (typeof elId !== 'string') continue;
      const k = kindByElementId[elId] ?? scoreKindFromType(typeByElementId[elId] ?? '');
      if (!k) continue;
      counts[k] += 1;
      evidence += 1;
    }

    for (const c of v.connections ?? []) {
      const relId = (c as any).relationshipId;
      if (typeof relId !== 'string') continue;
      const k = kindByRelationshipId[relId] ?? scoreKindFromType(typeByRelationshipId[relId] ?? '');
      if (!k) continue;
      counts[k] += 1;
      evidence += 1;
    }


    // Gentle hinting from EA diagram type if present (but do not override strong content signal).
    if (evidence > 0) {
      const diaType = ((v.meta as any)?.eaDiagramType ?? v.viewpoint ?? '').toString().toLowerCase();
      if (diaType.includes('bpmn')) counts.bpmn += 0.5;
      if (diaType.includes('uml')) counts.uml += 0.5;
      if (diaType.includes('archimate')) counts.archimate += 0.25;
    }


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
