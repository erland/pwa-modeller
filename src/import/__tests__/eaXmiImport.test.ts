import * as fs from 'node:fs';
import * as path from 'node:path';

import { importModel } from '../framework/importModel';
import { applyImportIR } from '../apply/applyImportIR';
import { modelStore } from '../../store';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../__fixtures__/eaXmi', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('EA XMI UML import (fixtures)', () => {
  beforeEach(() => {
    modelStore.reset();
  });

  it('sniffs and produces a populated IR for basic UML classifiers', async () => {
    const xml = readFixture('basic-uml.xmi');
    const file = new File([xml], 'basic-uml.xmi', { type: 'application/xml' });

    const res = await importModel(file);

    expect(res.importerId).toBe('ea-xmi-uml');
    expect(res.format).toBe('ea-xmi-uml');
    expect(res.report.source).toBe('ea-xmi-uml');

    expect(res.ir.meta?.format).toBe('ea-xmi-uml');
    expect(res.ir.folders.length).toBe(1);
    expect(res.ir.elements.length).toBe(4);
    expect(res.ir.relationships.length).toBe(3);

    const person = res.ir.elements.find((e) => e.id === 'cPerson');
    expect(person?.type).toBe('uml.class');
    expect(person?.folderId).toBe('pkg1');
    expect((person as any)?.meta?.umlMembers).toBeTruthy();

    const assoc = res.ir.relationships.find((r) => r.id === 'as1');
    expect(assoc?.type).toBe('uml.association');
    expect((assoc as any)?.meta?.umlAttrs?.sourceRole).toBe('employee');
    expect((assoc as any)?.meta?.umlAttrs?.targetMultiplicity).toBe('1');

    const gen = res.ir.relationships.find((r) => r.id === 'g1');
    expect(gen?.type).toBe('uml.generalization');

    const dep = res.ir.relationships.find((r) => r.id === 'd1');
    expect(dep?.type).toBe('uml.dependency');
  });

  it('applies basic UML fixture to the store and preserves UML members and association end metadata', async () => {
    const xml = readFixture('basic-uml.xmi');
    const file = new File([xml], 'basic-uml.xmi', { type: 'application/xml' });

    const res = await importModel(file);
    const applied = applyImportIR(res.ir, res.report, { sourceSystem: 'ea-xmi-uml' });

    expect(applied.modelId).toBeTruthy();

    const model = modelStore.getState().model;
    expect(model).not.toBeNull();

    const els = Object.values(model!.elements);
    const person = els.find((e) => e.type === 'uml.class' && e.name === 'Person');
    expect(person).toBeTruthy();
    expect(Array.isArray((person as any).attrs?.attributes)).toBe(true);

    const rels = Object.values(model!.relationships);
    const assoc = rels.find((r) => r.type === 'uml.association');
    expect(assoc).toBeTruthy();
    expect((assoc as any).attrs?.sourceRole).toBe('employee');
    expect((assoc as any).attrs?.targetRole).toBe('employer');
    expect((assoc as any).attrs?.sourceMultiplicity).toBe('0..*');
    expect((assoc as any).attrs?.targetMultiplicity).toBe('1');
  });

  it('imports a use case fixture with include and extend relationships', async () => {
    const xml = readFixture('usecase-include-extend.xmi');
    const file = new File([xml], 'usecase-include-extend.xmi', { type: 'application/xml' });

    const res = await importModel(file);

    expect(res.importerId).toBe('ea-xmi-uml');
    expect(res.ir.folders.length).toBe(1);

    // Actor + three use cases
    expect(res.ir.elements.filter((e) => e.type === 'uml.actor').length).toBe(1);
    expect(res.ir.elements.filter((e) => e.type === 'uml.usecase').length).toBe(3);

    // Association + include + extend + dependency(include)
    const types = res.ir.relationships.map((r) => r.type).sort();
    expect(types).toContain('uml.association');
    expect(types).toContain('uml.include');
    expect(types).toContain('uml.extend');

    const includes = res.ir.relationships.filter((r) => r.type === 'uml.include');
    expect(includes.length).toBeGreaterThanOrEqual(2);
  });
});
