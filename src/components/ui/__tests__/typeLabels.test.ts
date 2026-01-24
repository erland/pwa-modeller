import { getElementTypeLabel, getRelationshipTypeLabel } from '../../../domain';
import { formatElementTypeLabel, formatRelationshipTypeLabel } from '../typeLabels';

describe('ui typeLabels', () => {
  test('formats unknown element types with optional name', () => {
    expect(formatElementTypeLabel({ type: 'Unknown', unknownType: { name: 'Foo' } })).toBe('Unknown: Foo');
    expect(formatElementTypeLabel({ type: 'Unknown', unknownType: {} })).toBe('Unknown');
    expect(formatElementTypeLabel({ type: 'Unknown' })).toBe('Unknown');
  });

  test('formats known element types via catalog label', () => {
    expect(formatElementTypeLabel({ type: 'bpmn.task' })).toBe(getElementTypeLabel('bpmn.task'));
  });

  test('formats unknown relationship types with optional name', () => {
    expect(formatRelationshipTypeLabel({ type: 'Unknown', unknownType: { name: 'Bar' } })).toBe('Unknown: Bar');
    expect(formatRelationshipTypeLabel({ type: 'Unknown', unknownType: {} })).toBe('Unknown');
    expect(formatRelationshipTypeLabel({ type: 'Unknown' })).toBe('Unknown');
  });

  test('formats known relationship types via catalog label', () => {
    expect(formatRelationshipTypeLabel({ type: 'bpmn.sequenceFlow' })).toBe(getRelationshipTypeLabel('bpmn.sequenceFlow'));
  });
});
