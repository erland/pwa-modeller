import type { ImportReport } from '../importReport';
import { addWarning } from '../importReport';
import type { IRModel, IRTaggedValue } from '../framework/ir';

import type {
  ArchimateLayer,
  ElementType,
  ExternalIdRef,
  Model,
  ModelKind,
  RelationshipType,
  TaggedValue
} from '../../domain';
import { createId } from '../../domain';
import { ELEMENT_TYPES_BY_LAYER, RELATIONSHIP_TYPES } from '../../domain/config/archimatePalette';
import { VIEWPOINTS } from '../../domain/config/viewpoints';

const KNOWN_ELEMENT_TO_LAYER: Map<string, ArchimateLayer> = (() => {
  const m = new Map<string, ArchimateLayer>();
  for (const [layer, types] of Object.entries(ELEMENT_TYPES_BY_LAYER) as Array<[ArchimateLayer, ElementType[]]>) {
    for (const t of types) m.set(t, layer);
  }
  return m;
})();

const KNOWN_REL_TYPES: Set<string> = new Set<string>(RELATIONSHIP_TYPES as unknown as string[]);
const KNOWN_VIEWPOINT_IDS: Set<string> = new Set<string>(VIEWPOINTS.map((v) => v.id));

export function pushWarning(report: ImportReport, message: string): void {
  addWarning(report, message, { code: 'apply-import' });
}

export function toExternalIds(
  irIds: Array<{ system?: string; id: string; kind?: string }> | undefined,
  sourceSystem: string,
  originalIrId: string
): ExternalIdRef[] | undefined {
  const out: ExternalIdRef[] = [];

  for (const ref of irIds ?? []) {
    out.push({
      system: (ref.system && ref.system.trim().length > 0 ? ref.system : sourceSystem).trim(),
      id: ref.id
    });
  }

  // Preserve the original IR id as a stable external reference (unless already present).
  if (!out.some((x) => x.system === sourceSystem && x.id === originalIrId)) {
    out.push({ system: sourceSystem, id: originalIrId });
  }

  return out.length ? out : undefined;
}

export function toTaggedValues(ir: IRTaggedValue[] | undefined, sourceSystem: string): TaggedValue[] | undefined {
  if (!ir || ir.length === 0) return undefined;
  const out: TaggedValue[] = [];
  for (const tv of ir) {
    const key = tv.key?.trim();
    if (!key) continue;
    out.push({
      id: createId('tv'),
      ns: sourceSystem,
      key,
      value: (tv.value ?? '').toString()
    });
  }
  return out.length ? out : undefined;
}

export function resolveElementType(
  type: string
): { kind: 'known'; type: ElementType; layer: ArchimateLayer } | { kind: 'unknown' } {
  const layer = KNOWN_ELEMENT_TO_LAYER.get(type);
  if (layer) return { kind: 'known', type: type as ElementType, layer };
  return { kind: 'unknown' };
}

export function resolveRelationshipType(type: string): { kind: 'known'; type: RelationshipType } | { kind: 'unknown' } {
  if (KNOWN_REL_TYPES.has(type)) return { kind: 'known', type: type as RelationshipType };
  return { kind: 'unknown' };
}

export function guessLayerFromTypeString(type: string): ArchimateLayer {
  const t = type.toLowerCase();
  if (t.includes('strategy')) return 'Strategy';
  if (t.includes('business')) return 'Business';
  if (t.includes('application')) return 'Application';
  if (t.includes('technology')) return 'Technology';
  if (t.includes('physical')) return 'Physical';
  if (t.includes('implementation') || t.includes('migration')) return 'ImplementationMigration';
  if (t.includes('motivation')) return 'Motivation';
  // Safe default.
  return 'Business';
}

export function resolveViewpointId(viewpoint: string | undefined): string {
  const raw = (viewpoint ?? '').trim();
  if (!raw) return 'layered';

  // If importer already provided a built-in viewpoint id, accept it.
  if (KNOWN_VIEWPOINT_IDS.has(raw)) return raw;

  const lc = raw.toLowerCase();
  if (lc.includes('layer')) return 'layered';

  // Default fallback.
  return 'layered';
}

export function inferModelKind(ir: IRModel, sourceSystem: string): ModelKind {
  const fmt = (ir.meta?.format ?? ir.meta?.sourceSystem ?? '').toString().toLowerCase();
  const src = (sourceSystem ?? '').toString().toLowerCase();

  const looksBpmn = fmt.includes('bpmn') || src.includes('bpmn');
  const looksUml = fmt.includes('uml') || src.includes('uml');

  // BPMN should win: BPMN views need BPMN rendering.
  if (looksBpmn) return 'bpmn';

  // Heuristic fallback: inspect type prefixes.
  const anyBpmn = (ir.elements ?? []).some((e) => (e?.type ?? '').toString().startsWith('bpmn.'));
  if (anyBpmn) return 'bpmn';

  // If we have any *known* ArchiMate types, prefer ArchiMate rendering even if the export container is UML XMI.
  // (Sparx EA commonly exports ArchiMate as UML + profile tags in the same XMI.)
  const anyKnownArchiMateEl = (ir.elements ?? []).some((e) => typeof e?.type === 'string' && KNOWN_ELEMENT_TO_LAYER.has(e.type));
  const anyKnownArchiMateRel = (ir.relationships ?? []).some((r) => typeof r?.type === 'string' && KNOWN_REL_TYPES.has(r.type));
  if (anyKnownArchiMateEl || anyKnownArchiMateRel) return 'archimate';

  // Next: UML
  if (looksUml) return 'uml';
  const anyUml = (ir.elements ?? []).some((e) => (e?.type ?? '').toString().startsWith('uml.'));
  if (anyUml) return 'uml';

  return 'archimate';
}

export function getRootFolderId(model: Model): string {
  const roots = Object.values(model.folders).filter((f) => f.kind === 'root');
  if (roots.length !== 1) {
    // Extremely defensive fallback: pick first folder id.
    return roots[0]?.id ?? Object.keys(model.folders)[0];
  }
  return roots[0].id;
}
