import type { Element } from '../../../domain';
import { createEmptyModel } from '../../../domain';
import type { IRModel } from '../../framework/ir';

const addedElements: Element[] = [];

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
  addRelationship: jest.fn(),
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

describe('applyImportIR UML element attrs passthrough', () => {
  beforeEach(() => {
    addedElements.length = 0;
    mockStore.newModel.mockClear();
    mockStore.addElement.mockClear();
    mockStore.getState.mockClear();
  });

  test('rewrites UML attrs references (activityId, ownedNodeRefs) to internal ids', async () => {
    const { applyImportIR } = await import('../applyImportIR');

    const ir: IRModel = {
      folders: [],
      elements: [
        { id: 'A1', type: 'uml.activity', name: 'Order handling', attrs: { ownedNodeRefs: ['N1'] } },
        { id: 'N1', type: 'uml.action', name: 'Validate', attrs: { activityId: 'A1' } }
      ],
      relationships: []
    };

    const result = applyImportIR(ir, undefined, { sourceSystem: 'ea-xmi-uml' });

    const internalA1 = result.mappings.elements['A1'];
    const internalN1 = result.mappings.elements['N1'];

    const byId = new Map(addedElements.map((e: any) => [e.id, e]));
    const a1: any = byId.get(internalA1);
    const n1: any = byId.get(internalN1);

    expect(n1.attrs?.activityId).toBe(internalA1);
    expect(a1.attrs?.ownedNodeRefs).toEqual([internalN1]);
  });
});
