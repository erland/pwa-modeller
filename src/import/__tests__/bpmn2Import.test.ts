import * as fs from 'node:fs';
import * as path from 'node:path';

import { importModel } from '../framework/importModel';
import { applyImportIR } from '../apply/applyImportIR';
import { modelStore } from '../../store';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../__fixtures__/bpmn2/ea', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('BPMN2 import (fixtures)', () => {
  beforeEach(() => {
    modelStore.reset();
  });

  it('sniffs BPMN2 and produces a populated IR including a view with DI layout', async () => {
    const xml = readFixture('core-subset-di.bpmn');
    const file = new File([xml], 'core-subset-di.bpmn', { type: 'application/xml' });

    const res = await importModel(file);

    expect(res.importerId).toBe('bpmn2');
    expect(res.format).toBe('bpmn2');
    expect(res.report.source).toBe('bpmn2');

    expect(res.ir.elements.length).toBeGreaterThanOrEqual(3);
    expect(res.ir.relationships.length).toBeGreaterThanOrEqual(1);
    expect(res.ir.views.length).toBe(1);

    const v = res.ir.views[0];
    // Diagram name comes from BPMNDI and may be any user-provided label.
    expect((v.name ?? '').length).toBeGreaterThan(0);
    expect(v.nodes.length).toBeGreaterThanOrEqual(3);

    const startNode = v.nodes.find((n) => n.elementId === 'Start_1');
    const taskNode = v.nodes.find((n) => n.elementId === 'Task_1');
    const endNode = v.nodes.find((n) => n.elementId === 'End_1');

    // Bounds are taken directly from the BPMNDI fixture.
    expect(startNode?.bounds).toEqual({ x: 100, y: 100, width: 36, height: 36 });
    expect(taskNode?.bounds).toEqual({ x: 180, y: 90, width: 100, height: 80 });
    expect(endNode?.bounds).toEqual({ x: 320, y: 100, width: 36, height: 36 });

    const flowConn = v.connections.find((c) => c.relationshipId === 'Flow_1');
    expect(flowConn).toBeTruthy();
    expect(flowConn?.points?.length).toBe(2);
    expect(flowConn?.points?.[0]).toEqual({ x: 136, y: 118 });
    expect(flowConn?.points?.[1]).toEqual({ x: 180, y: 130 });
  });

  it('can sniff BPMN2 even when the file extension is .xml (common for EA exports)', async () => {
    const xml = readFixture('core-subset-di.bpmn');
    const file = new File([xml], 'ea-export.xml', { type: 'application/xml' });

    const res = await importModel(file);

    expect(res.importerId).toBe('bpmn2');
    expect(res.ir.elements.length).toBeGreaterThan(0);
    expect(res.ir.views.length).toBe(1);
  });

  it('applies IR to the store and preserves BPMN element/relationship types', async () => {
    const xml = readFixture('core-subset.bpmn');
    const file = new File([xml], 'core-subset.bpmn', { type: 'application/xml' });

    const res = await importModel(file);
    const applied = applyImportIR(res.ir, res.report);

    expect(applied.modelId).toBeTruthy();

    const model = modelStore.getState().model;
    expect(model).not.toBeNull();

    const elems = Object.values(model!.elements);
    expect(elems.length).toBeGreaterThan(0);

    // Ensure at least one element retains a BPMN qualified type.
    expect(elems.some((e) => (e.type ?? '').startsWith('bpmn.'))).toBe(true);

    const rels = Object.values(model!.relationships);
    expect(rels.length).toBeGreaterThan(0);
    expect(rels.some((r) => (r.type ?? '').startsWith('bpmn.'))).toBe(true);
  });
});
