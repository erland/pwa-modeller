import type { ModelKind } from './types';

/**
 * Best-effort inference of a model kind from a (possibly qualified) type id.
 *
 * Convention:
 *  - UML types are prefixed with "uml." (e.g. "uml.class")
 *  - BPMN types are prefixed with "bpmn." (e.g. "bpmn.task")
 *  - ArchiMate types are typically unqualified (e.g. "Association")
 */
export function kindFromTypeId(typeId: string | undefined | null): ModelKind {
  const t = String(typeId ?? '').trim();
  if (t.startsWith('uml.')) return 'uml';
  if (t.startsWith('bpmn.')) return 'bpmn';
  return 'archimate';
}
