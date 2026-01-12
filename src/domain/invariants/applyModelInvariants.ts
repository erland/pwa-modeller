import type { Model } from '../types';
import { ensureModelViewConnections } from '../viewConnections';

/**
 * Apply domain-level invariants to a loaded model.
 *
 * These passes are allowed to interpret meaning and materialize derived data.
 * They should NOT do basic shape coercion — that's the job of persistence
 * sanitization and migrations.
 */
export function applyModelInvariants(model: Model): Model {
  // Ensure per-view materialized connections match the relationships currently
  // considered visible in each view.
  return ensureModelViewConnections(model);
}
