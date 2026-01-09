import type { Element } from '../../../domain';
import { createEmptyModel } from '../../../domain';
import type { IRModel } from '../../framework/ir';

// applyImportIR uses the singleton modelStore. For unit tests we mock it
// so these tests do not depend on UI rendering or the real store implementation.

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
    if (mockStore._state.model) {
      mockStore._state.model.elements[el.id] = el;
    }
  }),
  addRelationship: jest.fn(),
  addView: jest.fn(),
  addElementToView: jest.fn(),
  updateViewNodeLayout: jest.fn(),
  addViewObject: jest.fn(),
  updateView: jest.fn()
};

jest.mock('../../../store', () => ({ modelStore: mockStore }));

describe('applyImportIR layer/type inference', () => {
  beforeEach(() => {
    addedElements.length = 0;
    mockStore.newModel.mockClear();
    mockStore.addElement.mockClear();
    mockStore.getState.mockClear();
  });

  test('known element types set layer according to palette mapping', async () => {
    const { applyImportIR } = await import('../applyImportIR');

    const ir: IRModel = {
      folders: [],
      elements: [{ id: 'e1', type: 'ApplicationComponent', name: 'AppComp' }],
      relationships: []
    };

    applyImportIR(ir);

    expect(addedElements).toHaveLength(1);
    expect(addedElements[0].type).toBe('ApplicationComponent');
    expect(addedElements[0].layer).toBe('Application');
    expect(addedElements[0].unknownType).toBeUndefined();
  });

  test('canonicalized Unknown type uses meta.sourceType for layer inference and unknownType name', async () => {
    const { applyImportIR } = await import('../applyImportIR');

    const ir: IRModel = {
      folders: [],
      elements: [
        {
          id: 'e2',
          type: 'Unknown',
          name: 'Custom Tech',
          meta: { sourceType: 'TechnologyCustomThing' }
        }
      ],
      relationships: []
    };

    applyImportIR(ir, undefined, { sourceSystem: 'meff' });

    expect(addedElements).toHaveLength(1);
    expect(addedElements[0].type).toBe('Unknown');
    expect(addedElements[0].layer).toBe('Technology');
    expect(addedElements[0].unknownType?.ns).toBe('meff');
    expect(addedElements[0].unknownType?.name).toBe('TechnologyCustomThing');
  });

  test('meta.sourceType can upgrade a canonicalized Unknown back to a known type + layer', async () => {
    const { applyImportIR } = await import('../applyImportIR');

    const ir: IRModel = {
      folders: [],
      elements: [
        {
          id: 'e3',
          type: 'Unknown',
          name: 'Actually known',
          meta: { sourceType: 'BusinessActor' }
        }
      ],
      relationships: []
    };

    applyImportIR(ir);

    expect(addedElements).toHaveLength(1);
    expect(addedElements[0].type).toBe('BusinessActor');
    expect(addedElements[0].layer).toBe('Business');
    expect(addedElements[0].unknownType).toBeUndefined();
  });
});
