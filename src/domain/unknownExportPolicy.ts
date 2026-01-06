import type { Model } from './types';
import { collectUnknownTypes } from './unknownTypeReport';

export type UnknownExportPolicy =
  | { mode: 'bestEffort' }
  | {
      mode: 'strict';
      /** Optional custom message shown when export is blocked. */
      message?: string;
    };

export type UnknownExportValidationResult =
  | {
      ok: true;
      hasUnknown: boolean;
      unknownSummary: ReturnType<typeof collectUnknownTypes>;
    }
  | {
      ok: false;
      reason: string;
      unknownSummary: ReturnType<typeof collectUnknownTypes>;
    };

function formatCounts(byType: Record<string, number>): string {
  const items = Object.entries(byType).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return items.map(([k, v]) => `${k} (${v})`).join(', ');
}

/**
 * Validates export conditions related to unknown types.
 *
 * - bestEffort: always OK, but callers may show a warning if hasUnknown is true.
 * - strict: blocks export if any unknown element or relationship types exist.
 */
export function validateUnknownExportPolicy(model: Model, policy: UnknownExportPolicy = { mode: 'bestEffort' }): UnknownExportValidationResult {
  const unknownSummary = collectUnknownTypes(model);

  if (policy.mode === 'bestEffort') {
    return { ok: true, hasUnknown: unknownSummary.hasUnknown, unknownSummary };
  }

  if (!unknownSummary.hasUnknown) {
    return { ok: true, hasUnknown: false, unknownSummary };
  }

  const details: string[] = [];
  if (unknownSummary.elements.total > 0) {
    details.push(`Unknown element types: ${formatCounts(unknownSummary.elements.byType)}`);
  }
  if (unknownSummary.relationships.total > 0) {
    details.push(`Unknown relationship types: ${formatCounts(unknownSummary.relationships.byType)}`);
  }

  const reason = policy.message?.trim()
    ? policy.message.trim()
    : `Export blocked by strict unknown-type policy. ${details.join(' | ')}`;

  return { ok: false, reason, unknownSummary };
}
