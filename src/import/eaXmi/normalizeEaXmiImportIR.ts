import type { IRModel } from '../framework/ir';

import { applyBpmnContainmentToViews } from './normalize/applyBpmnContainmentToViews';
import { inferEaXmiViewKinds } from './normalize/inferEaXmiViewKinds';
import { finalizeEaXmiMeta } from './normalize/finalizeEaXmiMeta';
import { normalizeEaXmiElements } from './normalize/normalizeEaXmiElements';
import { normalizeEaXmiRelationships } from './normalize/normalizeEaXmiRelationships';
import { normalizeEaXmiPackages } from './normalize/normalizeEaXmiPackages';
import { normalizeUmlActivityContainment } from './normalize/normalizeUmlActivityContainment';
import { normalizeUmlAssociationClassLinks } from './normalize/normalizeUmlAssociationClassLinks';
import { materializeViewRelationshipStubs } from './normalize/materializeViewRelationshipStubs';
import {
  buildElementLookup,
  buildRelationshipLookup,
  resolveEaXmiViews
} from './normalize/resolveEaXmiViews';

import type { NormalizeEaXmiOptions } from './normalize/normalizeEaXmiShared';

export type { NormalizeEaXmiOptions } from './normalize/normalizeEaXmiShared';

/**
 * EA XMI: format-specific normalization & finalization.
 *
 * This intentionally does *not* duplicate the generic normalizeImportIR pass.
 * Instead it:
 * - trims/cleans a couple EA-specific meta payloads (umlMembers, umlAttrs)
 * - ensures folder references are safe
 * - resolves EA diagram object references into elementIds/relationshipIds
 * - applies BPMN pool/lane containment in views (geometry-based)
 */
export function normalizeEaXmiImportIR(ir: IRModel | undefined, opts?: NormalizeEaXmiOptions): IRModel | undefined {
  if (!ir) return ir;

  const folderIds = new Set((ir.folders ?? []).map((f) => (typeof f?.id === 'string' ? f.id : '')));

  // Step 0: EA package id aliasing (package2 EAID_* ↔ XMI EAPK_*) + package element materialization.
  // This MUST happen before view resolution and before generic normalizeImportIR drops relationships for missing endpoints.
  const withPackages = normalizeEaXmiPackages(ir, folderIds, opts);

  // Step 1: normalize element & relationship payloads (trim, EA meta cleanup)
  const elementsBase = normalizeEaXmiElements({ ...ir, elements: withPackages.elements }, folderIds, opts);
  let relationships = normalizeEaXmiRelationships({ ...ir, relationships: withPackages.relationships });

  // Step 1.5: Safety net for older EA exports where some connectors only exist as diagram records.
  // We only create stubs when a diagram connector references a relationship id that is missing from
  // the imported relationship set and we can resolve both endpoints.
  relationships = materializeViewRelationshipStubs(ir.views, elementsBase, relationships, opts);

  // Step 2: resolve EA diagram nodes/connections to imported ids.
  const elementLookup = buildElementLookup(elementsBase);
  const relationshipLookup = buildRelationshipLookup(relationships);
  const viewsResolved = resolveEaXmiViews(ir.views, folderIds, elementLookup, relationshipLookup, relationships, opts);

  // Step 3: BPMN-specific containment heuristics in views.
  const views = inferEaXmiViewKinds(
    applyBpmnContainmentToViews(viewsResolved, elementsBase),
    elementsBase,
    relationships
  );

  // Step 3 (UML Activity): view-driven containment/ownership hints.
  const elements = normalizeUmlActivityContainment({ ...ir, elements: elementsBase }, views);

  // Step 3.5 (UML AssociationClass): stable links between box + line.
  const linked = normalizeUmlAssociationClassLinks(elements, relationships, opts);
  const elementsLinked = linked.elements;
  const relationshipsLinked = linked.relationships;

  // Step 4: finalize model meta.
  const meta = finalizeEaXmiMeta(ir);

  return {
    ...ir,
    folders: ir.folders ?? [],
    elements: elementsLinked,
    relationships: relationshipsLinked,
    ...(views !== undefined ? { views } : {}),
    meta
  };
}