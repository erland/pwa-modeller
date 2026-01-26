import type { IRModel } from '../../framework/ir';

import { normalizeEaXmiImportIR } from '../normalizeEaXmiImportIR';

describe('eaXmi UML Activity containment normalization (Step 3)', () => {
  test('adds activityId to activity nodes and ownedNodeRefs to activity element (view-driven)', () => {
    const ir: IRModel = {
      folders: [],
      elements: [
        { id: 'A1', type: 'uml.activity', name: 'Order handling' },
        { id: 'N1', type: 'uml.action', name: 'Validate' },
        { id: 'N2', type: 'uml.initialNode', name: 'Start' }
      ],
      relationships: [],
      views: [
        {
          id: 'V1',
          name: 'Order handling activity',
          viewpoint: 'Activity',
          nodes: [
            { id: 'DO_A1', kind: 'element', elementId: 'A1', bounds: { x: 0, y: 0, width: 900, height: 600 } },
            { id: 'DO_N1', kind: 'element', elementId: 'N1', bounds: { x: 50, y: 50, width: 120, height: 60 } },
            { id: 'DO_N2', kind: 'element', elementId: 'N2', bounds: { x: 50, y: 150, width: 120, height: 60 } }
          ],
          connections: []
        }
      ]
    };

    const normalized = normalizeEaXmiImportIR(ir)!;

    const byId = new Map((normalized.elements ?? []).map((e) => [e.id, e]));
    const a1: any = byId.get('A1');
    const n1: any = byId.get('N1');
    const n2: any = byId.get('N2');

    expect(n1.attrs?.activityId).toBe('A1');
    expect(n2.attrs?.activityId).toBe('A1');

    expect(a1.attrs?.ownedNodeRefs).toEqual(['N1', 'N2']);
  });
});
