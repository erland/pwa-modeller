import type { ApplyImportContext } from '../applyImportTypes';
import { modelStore } from '../../../store';
import { pushWarning } from '../applyImportHelpers';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function trimId(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : undefined;
}

function mergeAttr(attrs: unknown, key: string, value: string): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(attrs) ? { ...attrs } : {};
  base[key] = value;
  return base;
}

const ASSOC_REL_SUFFIX = '__association';

/**
 * Post-apply pass (model-level):
 *
 * Rewrite AssociationClass linkage attrs from IR ids to internal ids.
 *
 * - element.attrs.associationRelationshipId: IR relationship id -> internal relationship id
 * - relationship.attrs.associationClassElementId: IR element id -> internal element id (safety net)
 */
export function linkUmlAssociationClasses(ctx: ApplyImportContext): void {
  const { ir, mappings, report } = ctx;
  const model = modelStore.getState().model;
  if (!model) return;

  const assocElements = (ir.elements ?? []).filter((e) => e && typeof e.type === 'string' && e.type === 'uml.associationClass');
  if (!assocElements.length) return;

  for (const e of assocElements) {
    const internalElId = mappings.elements[e.id];
    if (!internalElId) continue;

    const irAttrs = (e as any).attrs;
    const explicitRelIrId = isRecord(irAttrs) ? trimId((irAttrs as any).associationRelationshipId) : undefined;
    const defaultRelIrId = `${e.id}${ASSOC_REL_SUFFIX}`;
    const relIrId = explicitRelIrId ?? (mappings.relationships[defaultRelIrId] ? defaultRelIrId : undefined);

    if (!relIrId) {
      pushWarning(report, `UML: AssociationClass "${e.id}" missing association relationship link (skipped linkage).`);
      continue;
    }

    const internalRelId = mappings.relationships[relIrId];
    if (!internalRelId) {
      pushWarning(
        report,
        `UML: AssociationClass "${e.id}" references relationship "${relIrId}" that was not imported (skipped linkage).`
      );
      continue;
    }

    // Patch the association class element to reference the internal relationship id.
    const currentEl = modelStore.getState().model?.elements[internalElId];
    const currentElLink = trimId(isRecord(currentEl?.attrs) ? (currentEl!.attrs as any).associationRelationshipId : undefined);
    if (currentElLink !== internalRelId) {
      modelStore.updateElement(internalElId, {
        attrs: mergeAttr(currentEl?.attrs, 'associationRelationshipId', internalRelId)
      });
    }

    // Safety: ensure the relationship points back to the internal association class element id.
    const currentRel = modelStore.getState().model?.relationships[internalRelId];
    const currentRelLink = trimId(isRecord(currentRel?.attrs) ? (currentRel!.attrs as any).associationClassElementId : undefined);
    if (currentRelLink !== internalElId) {
      modelStore.updateRelationship(internalRelId, {
        attrs: mergeAttr(currentRel?.attrs, 'associationClassElementId', internalElId)
      });
    }
  }
}
