import type { IRModel } from '../framework/ir';

import { applyBpmnContainmentToViews } from './normalize/applyBpmnContainmentToViews';
import { finalizeEaXmiMeta } from './normalize/finalizeEaXmiMeta';
import { normalizeEaXmiElements } from './normalize/normalizeEaXmiElements';
import { normalizeEaXmiRelationships } from './normalize/normalizeEaXmiRelationships';
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

  // Step 1: normalize element & relationship payloads (trim, EA meta cleanup)
  const elements = normalizeEaXmiElements(ir, folderIds, opts);
  const relationships = normalizeEaXmiRelationships(ir);

  // Step 2: resolve EA diagram nodes/connections to imported ids.
  const elementLookup = buildElementLookup(elements);
  const relationshipLookup = buildRelationshipLookup(relationships);
  const viewsResolved = resolveEaXmiViews(ir.views, folderIds, elementLookup, relationshipLookup, relationships, opts);

  // Step 3: BPMN-specific containment heuristics in views.
  const views = applyBpmnContainmentToViews(viewsResolved, elements);

  // Step 4: finalize model meta.
  const meta = finalizeEaXmiMeta(ir);

  return {
    ...ir,
    folders: ir.folders ?? [],
    elements,
    relationships,
    ...(views !== undefined ? { views } : {}),
    meta
  };
}
