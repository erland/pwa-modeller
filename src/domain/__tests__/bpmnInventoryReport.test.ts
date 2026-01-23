import { getElementTypesForKind, getRelationshipTypesForKind } from '../config/catalog';

import {
  BPMN_IMPORTER_ATTRS,
  BPMN_RELATIONSHIP_IMPORTER_ATTRS,
  generateBpmnInventoryMarkdown,
  getBpmnDomainGuardForType,
  getBpmnPropertiesPanelForRelationshipType,
  getBpmnPropertiesPanelForType,
} from '../bpmnInventoryReport';

describe('BPMN inventory report', () => {
  test('covers all BPMN catalog types (no silent drift)', () => {
    const elementTypes = getElementTypesForKind('bpmn');
    const relTypes = getRelationshipTypesForKind('bpmn');

    for (const t of elementTypes) {
      // NOTE: Jest's toHaveProperty treats dots as path separators (e.g. "bpmn.pool" => obj.bpmn.pool).
      // Our inventory maps use literal keys like "bpmn.pool", so we must check key existence directly.
      expect(Object.prototype.hasOwnProperty.call(BPMN_IMPORTER_ATTRS, String(t))).toBe(true);
    }
    for (const t of relTypes) {
      expect(Object.prototype.hasOwnProperty.call(BPMN_RELATIONSHIP_IMPORTER_ATTRS, String(t))).toBe(true);
    }
  });

  test('inventory markdown includes a row for every type', () => {
    const md = generateBpmnInventoryMarkdown().replace(/\r\n/g, '\n').trimEnd();
    expect(md.startsWith('# BPMN import ↔ domain ↔ properties inventory\n')).toBe(true);

    const elementTypes = getElementTypesForKind('bpmn').map(String);
    const relTypes = getRelationshipTypesForKind('bpmn').map(String);

    for (const t of elementTypes) {
      // Each element should appear as a table cell like: | `bpmn.task` |
      expect(md).toContain(`| \`${t}\` |`);
    }
    for (const t of relTypes) {
      // Relationship table also uses backticked id in first column.
      expect(md).toContain(`| \`${t}\` |`);
      // Relationship properties panel is always present.
      expect(getBpmnPropertiesPanelForRelationshipType(t)).toBeTruthy();
    }

    // Sanity checks on known mappings (acts as a canary).
    expect(getBpmnDomainGuardForType('bpmn.task')).toBe('isBpmnActivityAttrs');
    expect(getBpmnPropertiesPanelForType('bpmn.task')).toBe('BpmnTaskPropertiesSection');
    expect(getBpmnDomainGuardForType('bpmn.pool')).toBe('isBpmnPoolAttrs');
    expect(getBpmnPropertiesPanelForType('bpmn.pool')).toBe('BpmnPoolPropertiesSection');
    expect(getBpmnDomainGuardForType('bpmn.sequenceFlow')).toBe('isBpmnSequenceFlowAttrs');
  });
});
