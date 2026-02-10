import { createElement, createEmptyModel, createFolder } from '../../factories';
import { getElementContainmentPathLabel } from '../containmentPaths';
import { buildFolderParentIndex, getFolderPathLabel } from '../paths';

describe('domain indexes: paths', () => {
  test('getFolderPathLabel includes root by default', () => {
    const model = createEmptyModel({ name: 'Test' }, 'M1');
    const root = Object.values(model.folders).find((f) => f.kind === 'root');
    if (!root) throw new Error('missing root');
    const custom = createFolder('Custom', 'custom', root.id, 'F_custom');
    model.folders[custom.id] = custom;
    // Keep folderIds consistent for UI trees (not required for the path helper).
    model.folders[root.id].folderIds.push(custom.id);

    const folderParent = buildFolderParentIndex(model);
    expect(getFolderPathLabel(model, custom.id, folderParent)).toBe('Model / Custom');
    expect(getFolderPathLabel(model, custom.id, folderParent, { includeRoot: false })).toBe('Custom');
  });

  test('getElementContainmentPathLabel returns name-based containment path', () => {
    const model = createEmptyModel({ name: 'Test' }, 'M1');
    const p = createElement({ id: 'E_p', name: 'Parent', type: 'BusinessActor', layer: 'business' });
    const c = createElement({ id: 'E_c', name: 'Child', type: 'BusinessActor', layer: 'business', parentElementId: p.id });
    const g = createElement({ id: 'E_g', name: 'Grand', type: 'BusinessActor', layer: 'business', parentElementId: c.id });
    model.elements[p.id] = p;
    model.elements[c.id] = c;
    model.elements[g.id] = g;

    expect(getElementContainmentPathLabel(model, g.id)).toBe('Parent / Child / Grand');
  });
});
