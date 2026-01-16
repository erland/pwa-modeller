import type { ModelKind } from '../domain';
import type { Notation } from './types';
import { archimateNotation } from './archimate';
import { umlNotation } from './uml';
import { bpmnNotation } from './bpmn';

/**
 * Single switch point for notation-specific behavior.
 */
export function getNotation(kind: ModelKind): Notation {
  switch (kind) {
    case 'archimate':
      return archimateNotation;
    case 'uml':
      return umlNotation;
    case 'bpmn':
      return bpmnNotation;
    default:
      return archimateNotation;
  }
}
