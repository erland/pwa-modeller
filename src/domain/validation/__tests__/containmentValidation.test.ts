import { createElement, createEmptyModel, createFolder } from '../../factories';
import { validateModelCommon as validateModel } from '../validateModel';

describe('Containment validation (common)', () => {
  it('reports missing parent element references', () => {
    const model = createEmptyModel({ name: 'M' });
    const a = createElement({ name: 'A', type: 'archimate.businessActor', layer: 'business', parentElementId: 'missing' });
    model.elements[a.id] = a;
    model.folders[Object.keys(model.folders)[0]].elementIds.push(a.id);

    const issues = validateModel(model);
    expect(issues.some(i => i.id.includes('containment-missing-parent'))).toBe(true);
  });

  it('reports cycles', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootFolderId = Object.keys(model.folders)[0];

    const a = createElement({ name: 'A', type: 'archimate.businessActor', layer: 'business' });
    const b = createElement({ name: 'B', type: 'archimate.businessRole', layer: 'business', parentElementId: a.id });
    // make A point to B to form a cycle
    const a2 = { ...a, parentElementId: b.id };

    model.elements[a2.id] = a2;
    model.elements[b.id] = b;
    model.folders[rootFolderId].elementIds.push(a2.id, b.id);

    const issues = validateModel(model);
    expect(issues.some(i => i.id.includes('containment-cycle'))).toBe(true);
  });

  it('warns when parent and child are stored in different folders', () => {
    const model = createEmptyModel({ name: 'M' });
    const rootFolderId = Object.keys(model.folders)[0];

    // Create another folder
    const other = createFolder('Other', 'elements', rootFolderId);
    model.folders[other.id] = other;
    model.folders[rootFolderId].folderIds.push(other.id);

    const parent = createElement({ name: 'Parent', type: 'archimate.businessActor', layer: 'business' });
    const child = createElement({ name: 'Child', type: 'archimate.businessRole', layer: 'business', parentElementId: parent.id });

    model.elements[parent.id] = parent;
    model.elements[child.id] = child;

    model.folders[rootFolderId].elementIds.push(parent.id);
    model.folders[other.id].elementIds.push(child.id);

    const issues = validateModel(model);
    expect(issues.some(i => i.severity === 'warning' && i.id.includes('containment-cross-folder'))).toBe(true);
  });
});
