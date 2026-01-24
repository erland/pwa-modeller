import { relationshipVisual } from '../relationshipVisual';
import type { RelationshipType } from '../../../domain';

describe('diagram relationshipVisual', () => {
  test('defaults to open arrow for BPMN/UML types', () => {
    const v = relationshipVisual({ type: 'bpmn.sequenceFlow' as RelationshipType }, false);
    expect(v.markerEnd).toBe('url(#arrowOpen)');
    expect(v.markerStart).toBeUndefined();
  });

  test('adds Sel suffix when selected', () => {
    const v = relationshipVisual({ type: 'bpmn.sequenceFlow' as RelationshipType }, true);
    expect(v.markerEnd).toBe('url(#arrowOpenSel)');
  });

  test('renders stable visuals for a few ArchiMate relationship types', () => {
    expect(relationshipVisual({ type: 'Realization' }, false)).toEqual({
      markerEnd: 'url(#triangleOpen)',
      dasharray: '6 5'
    });

    expect(relationshipVisual({ type: 'Composition' }, false)).toEqual({
      markerStart: 'url(#diamondFilled)'
    });

    expect(relationshipVisual({ type: 'Association', attrs: { isDirected: true } }, false)).toEqual({
      markerEnd: 'url(#arrowOpen)'
    });
  });

  test('Access relationship shows compact midLabel for read/write variants', () => {
    const v = relationshipVisual({ type: 'Access', attrs: { accessType: 'ReadWrite' } }, false);
    expect(v.markerEnd).toBe('url(#arrowOpen)');
    expect(v.midLabel).toBe('RW');
  });

  test('Influence relationship defaults midLabel to ± when empty', () => {
    const v = relationshipVisual({ type: 'Influence', attrs: { influenceStrength: '' } }, false);
    expect(v.markerEnd).toBe('url(#arrowOpen)');
    expect(v.dasharray).toBe('2 4');
    expect(v.midLabel).toBe('±');
  });
});
