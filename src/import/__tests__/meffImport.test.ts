import * as fs from 'node:fs';
import * as path from 'node:path';

import { importModel } from '../framework/importModel';
import { applyImportIR } from '../apply/applyImportIR';
import { modelStore } from '../../store';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../__fixtures__/meff', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('MEFF import (fixtures)', () => {
  beforeEach(() => {
    modelStore.reset();
  });

  it('sniffs MEFF and produces a populated IR (elements/relationships/folders/views)', async () => {
    const xml = readFixture('basic-with-view.xml');
    const file = new File([xml], 'basic-with-view.xml', { type: 'application/xml' });

    const res = await importModel(file);

    expect(res.importerId).toBe('meff');
    expect(res.format).toBe('archimate-meff');
    expect(res.report.source).toBe('archimate-meff');

    expect(res.ir.folders.length).toBe(1);
    expect(res.ir.elements.length).toBe(2);
    expect(res.ir.relationships.length).toBe(1);
    expect(res.ir.views.length).toBe(1);

    const e1 = res.ir.elements.find((e) => e.id === 'e1');
    expect(e1?.folderId).toBe('f1');

    const v1 = res.ir.views[0];
    expect(v1.id).toBe('v1');
    expect(v1.folderId).toBe('f1');
    expect(v1.nodes.length).toBe(2);
    expect(v1.connections.length).toBe(1);
  });

  it('applies IR to the store (creates a new model) and preserves external IDs', async () => {
    const xml = readFixture('basic-with-view.xml');
    const file = new File([xml], 'basic-with-view.xml', { type: 'application/xml' });

    const res = await importModel(file);
    const applied = applyImportIR(res.ir, res.report);

    expect(applied.modelId).toBeTruthy();

    const model = modelStore.getState().model;
    expect(model).not.toBeNull();
    expect(Object.keys(model!.elements)).toHaveLength(2);
    expect(Object.keys(model!.relationships)).toHaveLength(1);
    expect(Object.keys(model!.views)).toHaveLength(1);

    const actor = Object.values(model!.elements).find((e) => e.name === 'Actor A');
    expect(actor).toBeTruthy();
    expect(actor!.externalIds?.some((x) => x.system === 'archimate-meff' && x.id === 'e1')).toBe(true);
  });

  it('records unknown types in the import report', async () => {
    const xml = readFixture('unknown-types.xml');
    const file = new File([xml], 'unknown-types.xml', { type: 'application/xml' });

    const res = await importModel(file);

    expect(res.ir.elements.length).toBe(2);
    expect(res.ir.relationships.length).toBe(1);

    expect(res.report.unknownElementTypes['archimate-meff:NotARealElementType']).toBe(1);
    expect(res.report.unknownRelationshipTypes['archimate-meff:NotARealRelationshipType']).toBe(1);

    // Also ensure the IR uses 'Unknown' when the type couldn't be mapped.
    const weird = res.ir.elements.find((e) => e.id === 'e1');
    expect(weird?.type).toBe('Unknown');
  });

  it('maps organizations nesting to containment (element.parentElementId) and view ownership', async () => {
    const xml = readFixture('organizations-containment.xml');
    const file = new File([xml], 'organizations-containment.xml', { type: 'application/xml' });

    const res = await importModel(file);

    const app = res.ir.elements.find((e) => e.id === 'app1');
    const sub1 = res.ir.elements.find((e) => e.id === 'sub1');
    const sub2 = res.ir.elements.find((e) => e.id === 'sub2');
    expect(app).toBeTruthy();
    expect(sub1).toBeTruthy();
    expect(sub2).toBeTruthy();
    expect((sub1 as any).parentElementId).toBe('app1');
    expect((sub2 as any).parentElementId).toBe('app1');

    const v = res.ir.views.find((x) => x.id === 'vApp');
    expect(v).toBeTruthy();
    expect((v as any).meta?.owningElementId).toBe('app1');

    // Apply and verify internal IDs preserve the containment + view ownerRef.
    applyImportIR(res.ir, res.report);
    const model = modelStore.getState().model;
    expect(model).not.toBeNull();

    const appEl = Object.values(model!.elements).find((e) => e.name === 'Archimate Application 1');
    const sub1El = Object.values(model!.elements).find((e) => e.name === 'Archimate Subsystem 1');
    const sub2El = Object.values(model!.elements).find((e) => e.name === 'Archimate Subsystem 2');
    expect(appEl).toBeTruthy();
    expect(sub1El).toBeTruthy();
    expect(sub2El).toBeTruthy();
    expect(sub1El!.parentElementId).toBe(appEl!.id);
    expect(sub2El!.parentElementId).toBe(appEl!.id);

    const view = Object.values(model!.views).find((vv) => vv.name === 'View Archimate Application 1');
    expect(view).toBeTruthy();
    expect(view!.ownerRef).toBeTruthy();
    expect(view!.ownerRef!.id).toBe(appEl!.id);
  });
});
