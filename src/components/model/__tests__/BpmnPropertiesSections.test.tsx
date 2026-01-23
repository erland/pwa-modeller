import * as fs from 'node:fs';
import * as path from 'node:path';

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { Element, Model } from '../../../domain';
import { deserializeModel, modelStore } from '../../../store';

import { PropertiesPanel } from '../PropertiesPanel';

function readRoundtripFixture(name: string): string {
  const p = path.resolve(__dirname, '../../../__tests__/fixtures/bpmn2/roundtrip', name);
  return fs.readFileSync(p, 'utf-8');
}

function findFirst(model: Model, type: string): Element {
  const el = Object.values(model.elements).find((e) => String(e.type) === type);
  if (!el) throw new Error(`Fixture missing element type: ${type}`);
  return el;
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

describe('BPMN properties panel: new sections (Step 4) regression', () => {
  afterEach(() => {
    // Ensure RTL cleanup runs before store reset; otherwise store notifications can
    // cause state updates on mounted components and trigger act() warnings.
    cleanup();
    act(() => {
      modelStore.reset();
    });
  });

  test('pool/processRef dropdown lists processes and mutates model', () => {
    const model: Model = deserializeModel(readRoundtripFixture('tullverket-importcontrol.model.json'));
    modelStore.loadModel(model, 'tullverket-importcontrol.model.json');

    const pool = findFirst(model, 'bpmn.pool');
    const processes = Object.values(model.elements).filter((e) => String(e.type) === 'bpmn.process');
    expect(processes.length).toBeGreaterThan(0);

    render(<PropertiesPanel selection={{ kind: 'element', elementId: pool.id }} onEditModelProps={() => {}} />);

    const select = screen.getByLabelText('BPMN pool process') as HTMLSelectElement;
    // +1 for (none)
    expect(select.options.length).toBe(processes.length + 1);

    // Change to the first process option
    const targetId = processes[0].id;
    fireEvent.change(select, { target: { value: targetId } });
    const updated = modelStore.getState().model;
    expect(updated).toBeTruthy();
    const attrs = asRecord(updated!.elements[pool.id].attrs);
    expect(attrs.processRef).toBe(targetId);

    // Clear
    fireEvent.change(select, { target: { value: '' } });
    const clearedAttrs = asRecord(modelStore.getState().model!.elements[pool.id].attrs);
    expect(clearedAttrs.processRef).toBeUndefined();
  });

  test('textAnnotation text is shown and uses safe setter', () => {
    const model: Model = deserializeModel(readRoundtripFixture('tullverket-importcontrol.model.json'));
    modelStore.loadModel(model, 'tullverket-importcontrol.model.json');

    const ta = findFirst(model, 'bpmn.textAnnotation');

    render(<PropertiesPanel selection={{ kind: 'element', elementId: ta.id }} onEditModelProps={() => {}} />);

    const textarea = screen.getByLabelText('BPMN text annotation text') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Ny anteckning' } });

    const updated = modelStore.getState().model!;
    const attrs = asRecord(updated.elements[ta.id].attrs);
    expect(attrs.text).toBe('Ny anteckning');

    fireEvent.change(textarea, { target: { value: '   ' } });
    const cleared = asRecord(modelStore.getState().model!.elements[ta.id].attrs);
    expect(cleared.text).toBeUndefined();
  });

  test('data object/store reference dropdowns list global defs and validate', () => {
    const model: Model = deserializeModel(readRoundtripFixture('tullverket-importcontrol.model.json'));
    modelStore.loadModel(model, 'tullverket-importcontrol.model.json');

    const dor = findFirst(model, 'bpmn.dataObjectReference');
    const dsr = findFirst(model, 'bpmn.dataStoreReference');

    const dataObjects = Object.values(model.elements).filter((e) => String(e.type) === 'bpmn.dataObject');
    const dataStores = Object.values(model.elements).filter((e) => String(e.type) === 'bpmn.dataStore');
    expect(dataObjects.length).toBeGreaterThan(0);
    expect(dataStores.length).toBeGreaterThan(0);

    // DataObjectReference
    const { unmount } = render(
      <PropertiesPanel selection={{ kind: 'element', elementId: dor.id }} onEditModelProps={() => {}} />
    );
    const dorSelect = screen.getByLabelText('BPMN data object reference') as HTMLSelectElement;
    expect(dorSelect.options.length).toBe(dataObjects.length + 1);
    fireEvent.change(dorSelect, { target: { value: dataObjects[0].id } });
    expect(asRecord(modelStore.getState().model!.elements[dor.id].attrs).dataObjectRef).toBe(dataObjects[0].id);
    unmount();

    // DataStoreReference
    render(<PropertiesPanel selection={{ kind: 'element', elementId: dsr.id }} onEditModelProps={() => {}} />);
    const dsrSelect = screen.getByLabelText('BPMN data store reference') as HTMLSelectElement;
    expect(dsrSelect.options.length).toBe(dataStores.length + 1);
    fireEvent.change(dsrSelect, { target: { value: dataStores[0].id } });
    expect(asRecord(modelStore.getState().model!.elements[dsr.id].attrs).dataStoreRef).toBe(dataStores[0].id);
  });

  test('lane flowNodeRefs multi-select updates containment list', () => {
    const model: Model = deserializeModel(readRoundtripFixture('tullverket-importcontrol.model.json'));
    modelStore.loadModel(model, 'tullverket-importcontrol.model.json');

    const lane = findFirst(model, 'bpmn.lane');
    render(<PropertiesPanel selection={{ kind: 'element', elementId: lane.id }} onEditModelProps={() => {}} />);

    const select = screen.getByLabelText('BPMN lane flow node refs') as HTMLSelectElement;
    expect(select.multiple).toBe(true);

    // Select first 2 options (if present)
    const opts = Array.from(select.options);
    for (const o of opts) o.selected = false;
    opts.slice(0, 2).forEach((o) => (o.selected = true));
    fireEvent.change(select);

    const updated = modelStore.getState().model!;
    const attrs = asRecord(updated.elements[lane.id].attrs);
    const refs = Array.isArray(attrs.flowNodeRefs) ? (attrs.flowNodeRefs as unknown[]).map(String) : [];
    expect(refs.length).toBeGreaterThan(0);
  });

  test('process isExecutable checkbox writes attrs.isExecutable', () => {
    const model: Model = deserializeModel(readRoundtripFixture('tullverket-importcontrol.model.json'));
    modelStore.loadModel(model, 'tullverket-importcontrol.model.json');

    const proc = findFirst(model, 'bpmn.process');
    render(<PropertiesPanel selection={{ kind: 'element', elementId: proc.id }} onEditModelProps={() => {}} />);

    const cb = screen.getByLabelText('BPMN process is executable') as HTMLInputElement;
    fireEvent.click(cb);
    expect(asRecord(modelStore.getState().model!.elements[proc.id].attrs).isExecutable).toBe(true);
  });
});
