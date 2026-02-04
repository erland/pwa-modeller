import type { IRModel } from '../framework/ir';
import type { ImportReport } from '../importReport';

import { resolveViewConnectionRelationshipIds } from '../normalize/resolveViewConnectionRelationshipIds';

export type NormalizeMeffOptions = {
  report?: ImportReport;
  source?: string;
};

/**
 * MEFF: best-effort normalization for views.
 *
 * Some MEFF exporters omit relationship refs inside views/diagrams and only provide
 * endpoints. If we don't resolve those to relationshipIds, later steps may end up
 * materializing *all* relationships between endpoints in the view (duplicates).
 */
export function normalizeMeffImportIR(ir: IRModel | undefined, opts?: NormalizeMeffOptions): IRModel | undefined {
  if (!ir) return ir;
  return resolveViewConnectionRelationshipIds(ir, {
    report: opts?.report,
    label: 'MEFF'
  });
}
