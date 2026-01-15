import * as React from 'react';

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
      // Placeholder: reuse ArchiMate rendering defaults so existing views remain visible,
      // but keep catalogs/creation guards conservative until BPMN is implemented.
      return {
        ...archimateNotation,
        kind,
        canCreateNode: () => false,
        canCreateRelationship: () => ({ allowed: false, reason: 'Notation not implemented yet.' }),
        getElementTypeOptions: () => [],
        getRelationshipTypeOptions: () => [],
        getElementPropertySections: () => [],
        renderRelationshipProperties: () => React.createElement('p', { className: 'panelHint' }, 'BPMN properties not implemented yet.'),
        validateNotation: () => [],
      };
    }
    default:
      return archimateNotation;
  }
}
