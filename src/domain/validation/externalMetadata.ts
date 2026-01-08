import type { ValidationIssue, ValidationIssueTarget } from './types';
import { makeIssue } from './issues';
import { dedupeExternalIds, externalKey, normalizeExternalIdRef } from '../externalIds';
import { normalizeKey, normalizeNs, validateTaggedValue } from '../taggedValues';

export function validateExternalIdsForTarget(
  list: unknown,
  target: ValidationIssueTarget,
  suffix: string,
  label: string
): ValidationIssue[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    return [
      makeIssue(
        'warning',
        `${label} externalIds is not an array and may be lost on save/load.`,
        target,
        `${suffix}:externalIds-not-array`
      )
    ];
  }

  const raw = list as unknown[];
  const normalized = raw.map((x) => normalizeExternalIdRef(x)).filter((x): x is NonNullable<typeof x> => !!x);
  const invalidCount = raw.length - normalized.length;

  // Detect duplicates among normalized refs
  const seen = new Set<string>();
  const dupKeys: string[] = [];
  for (const ref of normalized) {
    const k = externalKey(ref);
    if (seen.has(k)) dupKeys.push(k);
    else seen.add(k);
  }

  // dedupeExternalIds also normalizes+dedupes, used to detect whether we'd drop anything.
  const deduped = dedupeExternalIds(normalized);

  const issues: ValidationIssue[] = [];
  if (invalidCount > 0) {
    issues.push(
      makeIssue(
        'warning',
        `${label} has ${invalidCount} invalid external id entr${invalidCount === 1 ? 'y' : 'ies'} (missing system/id).`,
        target,
        `${suffix}:externalIds-invalid`
      )
    );
  }
  if (deduped.length !== normalized.length || dupKeys.length > 0) {
    issues.push(
      makeIssue(
        'warning',
        `${label} has duplicate external ids (system+id+scope). Only the last occurrence will be kept.`,
        target,
        `${suffix}:externalIds-duplicate`
      )
    );
  }

  return issues;
}


export function validateTaggedValuesForTarget(
  list: unknown,
  target: ValidationIssueTarget,
  suffix: string,
  label: string
): ValidationIssue[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    return [
      makeIssue(
        'warning',
        `${label} taggedValues is not an array and may be lost on save/load.`,
        target,
        `${suffix}:taggedValues-not-array`
      )
    ];
  }

  const raw = list as unknown[];
  let invalidCount = 0;
  let warningCount = 0;

  // Collect a few representative messages for UI readability.
  const samples: string[] = [];

  for (const tv of raw) {
    if (!tv || typeof tv !== 'object') {
      invalidCount++;
      if (samples.length < 3) samples.push('(invalid entry)');
      continue;
    }

    // validateTaggedValue expects a TaggedValue-like object; it will normalize/validate defensively.
    const { normalized, errors, warnings } = validateTaggedValue(tv as any);

    if (errors.length > 0) {
      invalidCount++;
      if (samples.length < 3) {
        const ns = normalizeNs((normalized as any).ns);
        const key = normalizeKey((normalized as any).key);
        const name = `${ns ? ns + ':' : ''}${key || '(missing key)'}`;
        samples.push(`${name}: ${errors[0]}`);
      }
    } else if (warnings.length > 0) {
      warningCount++;
    }
  }

  const issues: ValidationIssue[] = [];
  if (invalidCount > 0) {
    issues.push(
      makeIssue(
        'warning',
        `${label} has ${invalidCount} invalid tagged value entr${invalidCount === 1 ? 'y' : 'ies'} (e.g. ${samples.join('; ')}).`,
        target,
        `${suffix}:taggedValues-invalid`
      )
    );
  } else if (warningCount > 0) {
    issues.push(
      makeIssue(
        'warning',
        `${label} has tagged values with warnings (e.g. very large values).`,
        target,
        `${suffix}:taggedValues-warning`
      )
    );
  }

  return issues;
}
