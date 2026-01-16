import { createElement, createEmptyModel, createFolder, createView } from '../../../../domain/factories';
import { buildNavigatorTreeData } from '../buildNavigatorTree';

describe('buildNavigatorTreeData', () => {
  test('returns root children ordered as folders, elements, then views (all name-sorted)', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = Object.values(model.folders).find((f) => f.kind === 'root')!.id;

    // Child folders (added unsorted on purpose)
    const fB = createFolder('B Folder', 'folder', rootId, 'fB');
    const fA = createFolder('A Folder', 'folder', rootId, 'fA');
    model.folders[fB.id] = fB;
    model.folders[fA.id] = fA;
    model.folders[rootId].folderIds.push(fB.id, fA.id);

    // Elements in root
    const eB = createElement({ id: 'eB', name: 'Beta', layer: 'Business', type: 'BusinessActor' });
    const eA = createElement({ id: 'eA', name: 'Alpha', layer: 'Business', type: 'BusinessRole' });
    model.elements[eB.id] = eB;
    model.elements[eA.id] = eA;
    model.folders[rootId].elementIds.push(eB.id, eA.id);

    // Views in root
    const vZ = createView({ id: 'vZ', name: 'Z view', viewpointId: 'layered' });
    const vA = createView({ id: 'vA', name: 'A view', viewpointId: 'layered' });
    model.views[vZ.id] = vZ;
    model.views[vA.id] = vA;
    model.folders[rootId].viewIds.push(vZ.id, vA.id);

    const nodes = buildNavigatorTreeData({ model, rootFolderId: rootId, searchTerm: '' });

    expect(nodes.map((n) => `${n.kind}:${n.label}`)).toEqual([
      'folder:A Folder',
      'folder:B Folder',
      'element:Alpha',
      'element:Beta',
      'view:A view',
      'view:Z view'
    ]);
  });

  test('renders element-owned views nested under their owning element and hides them from folder view list', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootId = Object.values(model.folders).find((f) => f.kind === 'root')!.id;

    const owner = createElement({ id: 'e1', name: 'Owner', layer: 'Business', type: 'BusinessActor' });
    model.elements[owner.id] = owner;
    model.folders[rootId].elementIds.push(owner.id);

    const owned1 = createView({
      id: 'v1',
      name: 'Owned 1',
      viewpointId: 'layered',
      ownerRef: { kind: 'archimate', id: owner.id }
    });
    const owned2 = createView({
      id: 'v2',
      name: 'Owned 2',
      viewpointId: 'layered',
      ownerRef: { kind: 'archimate', id: owner.id }
    });
    model.views[owned1.id] = owned1;
    model.views[owned2.id] = owned2;
    // In the persisted model, folder may still reference owned view ids; tree should not show them at folder-level.
    model.folders[rootId].viewIds.push(owned2.id, owned1.id);

    const nodes = buildNavigatorTreeData({ model, rootFolderId: rootId, searchTerm: '' });
    const ownerNode = nodes.find((n) => n.kind === 'element' && n.elementId === owner.id);
    expect(ownerNode).toBeTruthy();
    expect(ownerNode!.children?.map((c) => `${c.kind}:${c.label}`)).toEqual(['view:Owned 1', 'view:Owned 2']);

    // Ensure owned views are not rendered as top-level folder views.
    expect(nodes.some((n) => n.kind === 'view' && (n.viewId === owned1.id || n.viewId === owned2.id))).toBe(false);
  });
});
