import type { Element } from '../../../../domain';
import { findExternalId } from '../../../../domain/externalIds';

/**
 * Human-friendly option label for BPMN selectors.
 *
 * Shows element name (if any) and the first BPMN external id (system: "bpmn2") when present.
 * This helps when internal ids differ from imported XML ids.
 */
export function bpmnElementOptionLabel(el: Element): string {
  const name = (el.name ?? '').toString().trim();
  const ext = findExternalId(el.externalIds, 'bpmn2');
  const extId = (ext?.id ?? '').toString().trim();

  const base = name ? name : el.id;
  if (!extId) return base;

  // Always include the external id; it is usually the BPMN XML id.
  return `${base} (${extId})`;
}
