import { createEmptyModel, createElement, createView, createFolder } from '../factories';
import { generateElementReport, generateViewInventoryReport, rowsToCsv } from '../reports';

function findFolderByKind(model: any, kind: string) {
  return Object.values(model.folders).find((f: any) => f.kind === kind);
}

describe('reports', () => {
  it('generates element report with category filtering and folder paths', () => {
    const model = createEmptyModel({ name: 'M' });
    const elementsFolder = findFolderByKind(model, 'elements');

    const custom = createFolder('Custom', 'custom', elementsFolder.id, 'folder_custom');
    model.folders[custom.id] = custom;
    model.folders[elementsFolder.id].folderIds.push(custom.id);

    const e1 = createElement({ name: 'Process A', layer: 'Business', type: 'BusinessProcess' });
    const e2 = createElement({ name: 'App X', layer: 'Application', type: 'ApplicationComponent' });
    model.elements[e1.id] = e1;
    model.elements[e2.id] = e2;
    // Place e1 under Custom, e2 under Elements root
    model.folders[custom.id].elementIds.push(e1.id);
    model.folders[elementsFolder.id].elementIds.push(e2.id);

    const all = generateElementReport(model, 'all');
    expect(all.map((r) => r.name)).toEqual(['App X', 'Process A']);

    const procs = generateElementReport(model, 'BusinessProcess');
    expect(procs).toHaveLength(1);
    expect(procs[0].folderPath).toBe('Elements / Custom');
  });

  it('generates view inventory report with viewpoint names', () => {
    const model = createEmptyModel({ name: 'M' });
    const viewsFolder = findFolderByKind(model, 'views');

    const v = createView({ name: 'Layered View', viewpointId: 'layered' });
    model.views[v.id] = v;
    model.folders[viewsFolder.id].viewIds.push(v.id);

    const rows = generateViewInventoryReport(model);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Layered View');
    expect(rows[0].viewpoint.toLowerCase()).toContain('layer');
    expect(rows[0].folderPath).toBe('Views');
  });

  it('exports CSV with proper escaping', () => {
    const csv = rowsToCsv(
      [{ name: 'A, B', desc: 'He said "hi"' }],
      [
        { key: 'name', header: 'Name' },
        { key: 'desc', header: 'Desc' }
      ]
    );

    expect(csv.split('\n')[0]).toBe('Name,Desc');
    expect(csv).toContain('"A, B"');
    expect(csv).toContain('"He said ""hi"""');
  });
});
