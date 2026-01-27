import { createEmptyModel } from '../../../domain';
import type { Element, Relationship } from '../../../domain';
import type { IRModel } from '../../framework/ir';

const addedElements: Element[] = [];
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
  addElement: jest.fn((el: Element) => {
    addedElements.push(el);
    if (mockStore._state.model) mockStore._state.model.elements[el.id] = el;
  }),
  updateElement: jest.fn((elementId: string, patch: any) => {
    const m = mockStore._state.model;
    if (!m) return;
    const current = m.elements[elementId];
    if (!current) return;
    m.elements[elementId] = { ...current, ...patch };
  }),
  addRelationship: jest.fn((rel: Relationship) => {
    addedRelationships.push(rel);
    if (mockStore._state.model) mockStore._state.model.relationships[rel.id] = rel;
  }),
  updateRelationship: jest.fn((relationshipId: string, patch: any) => {
    const m = mockStore._state.model;
    if (!m) return;
    const current = m.relationships[relationshipId];
    if (!current) return;
    m.relationships[relationshipId] = { ...current, ...patch };
  }),
  addView: jest.fn(),
  addElementToView: jest.fn(),
  updateViewNodeLayout: jest.fn(),
  addViewObject: jest.fn(),
  updateView: jest.fn()
};

jest.mock('../../../store', () => ({ modelStore: mockStore }));

describe('applyImportIR UML AssociationClass links', () => {
  beforeEach(() => {
    addedElements.length = 0;
    addedRelationships.length = 0;
    mockStore.newModel.mockClear();
    mockStore.addElement.mockClear();
    mockStore.addRelationship.mockClear();
    mockStore.updateElement.mockClear();
    mockStore.updateRelationship.mockClear();
  });

  test('rewrites mutual box/line linkage from IR ids to internal ids', async () => {
    const { applyImportIR } = await import('../applyImportIR');

    const ir: IRModel = {
      folders: [],
      elements: [
        { id: 'C1', type: 'uml.class', name: 'A' },
        { id: 'C2', type: 'uml.class', name: 'B' },
        { id: 'A1', type: 'uml.associationClass', name: 'AssocClass', attrs: { associationRelationshipId: 'A1__association' } }
      ],
      relationships: [
        {
          id: 'A1__association',
          type: 'uml.association',
          sourceId: 'C1',
          targetId: 'C2',
          attrs: { associationClassElementId: 'A1' }
        }
      ]
    };

    const result = applyImportIR(ir, undefined, { sourceSystem: 'ea-xmi-uml' });

    const internalA1 = result.mappings.elements['A1'];
    const internalRel = result.mappings.relationships['A1__association'];

    expect(internalA1).toBeTruthy();
    expect(internalRel).toBeTruthy();

    const model = mockStore._state.model;
    expect(model.elements[internalA1]!.attrs).toMatchObject({ associationRelationshipId: internalRel });
    expect(model.relationships[internalRel]!.attrs).toMatchObject({ associationClassElementId: internalA1 });
  });
});
