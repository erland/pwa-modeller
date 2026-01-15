import * as React from 'react';

import type { ArchimateLayer, ElementType, RelationshipType, RelationshipValidationMode } from '../../domain';
import {
  ELEMENT_TYPES,
  ELEMENT_TYPES_BY_LAYER,
  RELATIONSHIP_TYPES,
  getElementTypeOptionsForKind,
  getRelationshipTypeOptionsForKind,
} from '../../domain';
import { validateRelationship } from '../../domain/config/archimatePalette';
import { validateArchimateRelationshipRules } from '../../domain/validation/archimate';

import { ArchimateSymbol } from '../../components/diagram/archimateSymbols';
import { ArchimateElementPropertiesExtras } from '../../components/model/properties/archimate/ArchimateElementPropertiesExtras';
import { ArchimateRelationshipProperties } from '../../components/model/properties/archimate/ArchimateRelationshipProperties';

import { archimateRelationshipStyle } from '../../diagram/relationships/archimateStyle';
import type { RelationshipStyle } from '../../diagram/relationships/style';
import type { Notation } from '../types';

const ELEMENT_TYPE_TO_LAYER: Partial<Record<ElementType, ArchimateLayer>> = (() => {
  const map: Partial<Record<ElementType, ArchimateLayer>> = {};
  (Object.keys(ELEMENT_TYPES_BY_LAYER) as ArchimateLayer[]).forEach((layer) => {
    for (const t of ELEMENT_TYPES_BY_LAYER[layer] ?? []) map[t] = layer;
  });
  return map;
})();

const LAYER_BG_VAR: Record<ArchimateLayer, string> = {
  Strategy: 'var(--arch-layer-strategy)',
  Motivation: 'var(--arch-layer-motivation)',
  Business: 'var(--arch-layer-business)',
  Application: 'var(--arch-layer-application)',
  Technology: 'var(--arch-layer-technology)',
  Physical: 'var(--arch-layer-physical)',
  ImplementationMigration: 'var(--arch-layer-implementation)',
};

const ELEMENT_TYPES_SET = new Set<ElementType>(ELEMENT_TYPES);
const RELATIONSHIP_TYPES_SET = new Set<RelationshipType>(RELATIONSHIP_TYPES);

function isElementType(t: string): t is ElementType {
  return ELEMENT_TYPES_SET.has(t as ElementType);
}

function isRelationshipType(t: string): t is RelationshipType {
  return RELATIONSHIP_TYPES_SET.has(t as RelationshipType);
}

export const archimateNotation: Notation = {
  kind: 'archimate',

  // ------------------------------
  // Rendering + interaction
  // ------------------------------

  getElementBgVar: (nodeType: string) => {
    const layer = isElementType(nodeType) ? ELEMENT_TYPE_TO_LAYER[nodeType] ?? 'Business' : 'Business';
    return LAYER_BG_VAR[layer];
  },

  renderNodeSymbol: ({ nodeType, title }) => {
    const type: ElementType = isElementType(nodeType) ? nodeType : 'Unknown';
    return React.createElement(ArchimateSymbol, { type, title });
  },

  getRelationshipStyle: (rel: { type: string; attrs?: unknown }): RelationshipStyle => {
    // Notation registry uses a generic contract; ArchiMate narrows it here.
    if (!isRelationshipType(rel.type)) {
      // Unknown relationship type: let renderers decide a default style.
      return { markerEnd: 'arrowOpen' };
    }
    return archimateRelationshipStyle(rel as { type: RelationshipType; attrs?: unknown });
  },

  canCreateNode: ({ nodeType }) => {
    // For now, allow known ArchiMate element types and Unknown (imported/legacy).
    return isElementType(nodeType) || nodeType === 'Unknown';
  },

  canCreateRelationship: ({ relationshipType, sourceType, targetType, mode }) => {
    // If endpoints aren't both semantic element types (e.g. connector endpoints),
    // treat as allowed and let higher-level UI rules/viewpoint guidance handle it.
    if (!sourceType || !targetType) return { allowed: true };

    if (!isElementType(sourceType) || !isElementType(targetType)) return { allowed: true };
    if (!isRelationshipType(relationshipType)) return { allowed: false, reason: 'Unknown relationship type.' };

    const s = sourceType;
    const t = targetType;
    const rt = relationshipType;
    const m: RelationshipValidationMode = (mode ?? 'minimal') as RelationshipValidationMode;
    const res = validateRelationship(s, t, rt, m);
    return res.allowed ? { allowed: true } : { allowed: false, reason: res.reason };
  },

  // ------------------------------
  // Notation plugin contract v1
  // ------------------------------

  getElementTypeOptions: () => getElementTypeOptionsForKind('archimate'),

  getRelationshipTypeOptions: () => getRelationshipTypeOptionsForKind('archimate'),

  getElementPropertySections: ({ model, element, actions, onSelect }) => {
    // ArchiMate-only element extras (layer/type + UML drill-down helpers)
    return [
      {
        key: 'archimate',
        content: React.createElement(ArchimateElementPropertiesExtras, { model, element, actions, onSelect }),
      },
    ];
  },

  renderRelationshipProperties: ({ model, relationshipId, viewId, actions, onSelect }) => {
    return React.createElement(ArchimateRelationshipProperties, { model, relationshipId, viewId, actions, onSelect });
  },

  validateNotation: ({ model, relationshipValidationMode }) => {
    return validateArchimateRelationshipRules(model, relationshipValidationMode);
  },
};
