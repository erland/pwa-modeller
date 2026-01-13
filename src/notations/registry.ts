import type { ModelKind } from '../domain';
import type { Notation } from './types';
import { archimateNotation } from './archimate';
import { umlNotation } from './uml';

/**
 * Single switch point for notation-specific behavior.
 */
export function getNotation(kind: ModelKind): Notation {
  switch (kind) {
    case 'archimate':
      return archimateNotation;
    case 'uml':
      return umlNotation;
    case 'bpmn': {
      // Until UML/BPMN are implemented we fall back to ArchiMate rendering defaults,
      // but keep creation guards conservative.
      return {
        ...archimateNotation,
        kind,
        canCreateNode: () => false,
        canCreateRelationship: () => ({ allowed: false, reason: 'Notation not implemented yet.' }),
      };
    }
    default:
      return archimateNotation;
  }
}
