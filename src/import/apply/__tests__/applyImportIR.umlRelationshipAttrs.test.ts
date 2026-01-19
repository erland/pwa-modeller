import type { Relationship } from '../../../domain';
import { createEmptyModel } from '../../../domain';
import type { IRModel } from '../../framework/ir';

const addedRelationships: Relationship[] = [];

const mockStore = {
  _state: { model: null as any, fileName: null as string | null, isDirty: false },
  newModel: jest.fn((metadata: any) => {
    mockStore._state.model = createEmptyModel({ name: metadata.name ?? 'Imported model' }, 'model_import');
  }),
  getState: jest.fn(() => mockStore._state),
  subscribe: jest.fn(() => () => void 0),
  hydrate: jest.fn(),
  createFolder: jest.fn(() => 'folder_import'),
  updateFolder: jest.fn(),
  addElement: jest.fn((el: any) => {
    if (mockStore._state.model) mockStore._state.model.elements[el.id] = el;
  }),
  addRelationship: jest.fn((rel: Relationship) => {
    addedRelationships.push(rel);
    if (mockStore._state.model) mockStore._state.model.relationships[rel.id] = rel;
  }),
  addView: jest.fn(),
  addElementToView: jest.fn(),
  updateViewNodeLayout: jest.fn(),
  addViewObject: jest.fn(),
  updateView: jest.fn()
};

jest.mock('../../../store', () => ({ modelStore: mockStore }));

describe('applyImportIR UML relationship attrs passthrough', () => {
  beforeEach(() => {
    addedRelationships.length = 0;
    mockStore.newModel.mockClear();
    mockStore.addRelationship.mockClear();
    mockStore.getState.mockClear();
  });

  test('imports meta.umlAttrs as relationship.attrs (sanitized) for UML types', async () => {
    const { applyImportIR } = await import('../applyImportIR');

    const ir: IRModel = {
      folders: [],
      elements: [
        { id: 'c1', type: 'uml.class', name: 'A' },
        { id: 'c2', type: 'uml.class', name: 'B' }
      ],
      relationships: [
        {
          id: 'r1',
          type: 'uml.association',
          sourceId: 'c1',
          targetId: 'c2',
          meta: {
            umlAttrs: {
              sourceRole: 'a',
              targetRole: 'b',
              sourceMultiplicity: '0..*',
              targetMultiplicity: '1',
              sourceNavigable: true,
              targetNavigable: false
            }
          }
        }
      ]
    };

    applyImportIR(ir, undefined, { sourceSystem: 'ea-xmi-uml' });

    expect(addedRelationships).toHaveLength(1);
    expect(addedRelationships[0]!.type).toBe('uml.association');
    expect(addedRelationships[0]!.attrs).toMatchObject({
      sourceRole: 'a',
      targetRole: 'b',
      sourceMultiplicity: '0..*',
      targetMultiplicity: '1',
      sourceNavigable: true,
      targetNavigable: false
    });
  });
});
