import type { IRModel } from '../framework/ir';
import { applyImportIR } from '../apply/applyImportIR';
import { modelStore } from '../../store';

describe('applyImportIR (smoke)', () => {
  beforeEach(() => {
    modelStore.reset();
  });

  test('creates folders/elements/relationships/views and preserves basic view layout', () => {
    const ir: IRModel = {
      folders: [{ id: 'f1', name: 'Imported Folder', parentId: null }],
      elements: [
        { id: 'e1', type: 'BusinessActor', name: 'Actor A', folderId: 'f1' },
        { id: 'e2', type: 'BusinessRole', name: 'Role B', folderId: 'f1' }
      ],
      relationships: [{ id: 'r1', type: 'Association', sourceId: 'e1', targetId: 'e2' }],
      views: [
        {
          id: 'v1',
          name: 'My View',
          viewpoint: 'layered',
          folderId: 'f1',
          nodes: [
            {
              id: 'n1',
              kind: 'element',
              elementId: 'e1',
              bounds: { x: 10, y: 20, width: 100, height: 60 }
            },
            {
              id: 'n2',
              kind: 'element',
              elementId: 'e2',
              bounds: { x: 260, y: 20, width: 100, height: 60 }
            }
          ],
          connections: [
            {
              id: 'c1',
              relationshipId: 'r1',
              points: [
                { x: 110, y: 50 },
                { x: 260, y: 50 }
              ]
            }
          ]
        }
      ],
      meta: { format: 'test', tool: 'jest' }
    };

    const result = applyImportIR(ir, undefined, { sourceSystem: 'jest-smoke' });

    const model = modelStore.getState().model;
    expect(model).toBeTruthy();

    const internalFolderId = result.mappings.folders.f1;
    const internalE1 = result.mappings.elements.e1;
    const internalE2 = result.mappings.elements.e2;
    const internalR1 = result.mappings.relationships.r1;
    const internalV1 = result.mappings.views.v1;

    expect(model!.folders[internalFolderId].name).toBe('Imported Folder');
    expect(model!.elements[internalE1].name).toBe('Actor A');
    expect(model!.elements[internalE2].name).toBe('Role B');
    expect(model!.relationships[internalR1].sourceElementId).toBe(internalE1);
    expect(model!.relationships[internalR1].targetElementId).toBe(internalE2);

    const view = model!.views[internalV1];
    expect(view.name).toBe('My View');
    expect(view.layout?.nodes.some((n) => n.elementId === internalE1)).toBe(true);
    expect(view.layout?.nodes.some((n) => n.elementId === internalE2)).toBe(true);

    const relLayout = view.layout?.relationships.find((r) => r.relationshipId === internalR1);
    expect(relLayout).toBeTruthy();
    expect(relLayout?.points).toEqual([
      { x: 110, y: 50 },
      { x: 260, y: 50 }
    ]);
  });
});
