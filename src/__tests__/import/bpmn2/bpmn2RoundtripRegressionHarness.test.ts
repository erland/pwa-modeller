import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Model } from '../../../domain';
import { deserializeModel, modelStore } from '../../../store';

import { parseBpmn2Xml } from '../../../import/bpmn2/parseBpmn2Xml';
import { normalizeBpmn2ImportIR } from '../../../import/bpmn2/normalizeBpmn2ImportIR';
import { createImportReport } from '../../../import/importReport';
import { applyImportIR } from '../../../import/apply/applyImportIR';

function readRoundtripFixture(name: string): string {
  const p = path.resolve(__dirname, '../../fixtures/bpmn2/roundtrip', name);
  return fs.readFileSync(p, 'utf-8');
}

function bpmn2ExternalId(item: { externalIds?: { system: string; id: string }[] }): string | null {
  const ex = item.externalIds?.find((e) => e.system === 'bpmn2');
  return ex?.id ?? null;
}

function mapByExternalId<T extends { type: string; externalIds?: { system: string; id: string }[] }>(items: T[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const it of items) {
    const id = bpmn2ExternalId(it);
    if (!id) continue;
    m.set(id, String(it.type));
  }
  return m;
}

function assertNoUnresolvedRefs(model: Model): void {
  const check = (attrs: unknown, what: string) => {
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return;
    if (Object.prototype.hasOwnProperty.call(attrs, 'unresolvedRefs')) {
      throw new Error(`${what} has attrs.unresolvedRefs (should be migrated away)`);
    }
  };

  for (const el of Object.values(model.elements)) check(el.attrs, `element ${el.id} (${el.type})`);
  for (const rel of Object.values(model.relationships)) check(rel.attrs, `relationship ${rel.id} (${rel.type})`);
}

describe('BPMN2 round-trip regression harness', () => {
  afterEach(() => {
    modelStore.reset();
  });

  test('imported model matches the saved round-trip fixture by BPMN2 externalIds (types + core refs)', () => {
    const xml = readRoundtripFixture('tullverket-importcontrol.bpmn');
    const expected: Model = deserializeModel(readRoundtripFixture('tullverket-importcontrol.model.json'));

    const parsed = parseBpmn2Xml(xml);
    const report = createImportReport('bpmn2');
    const normalized = normalizeBpmn2ImportIR(parsed.importIR, { report, source: 'bpmn2' });

    applyImportIR(normalized, report, { sourceSystem: 'bpmn2', defaultModelName: 'tullverket-importcontrol (imported)' });
    const imported = modelStore.getState().model;
    expect(imported).toBeTruthy();

    // 1) Compare external-id sets for BPMN elements/relationships.
    const expEls = Object.values(expected.elements).filter((e) => String(e.type).startsWith('bpmn.'));
    const impEls = Object.values(imported!.elements).filter((e) => String(e.type).startsWith('bpmn.'));
    const expRels = Object.values(expected.relationships).filter((r) => String(r.type).startsWith('bpmn.'));
    const impRels = Object.values(imported!.relationships).filter((r) => String(r.type).startsWith('bpmn.'));

    const expElMap = mapByExternalId(expEls);
    const impElMap = mapByExternalId(impEls);
    const expRelMap = mapByExternalId(expRels);
    const impRelMap = mapByExternalId(impRels);

    expect(impElMap.size).toBe(expElMap.size);
    for (const [extId, type] of expElMap.entries()) {
      expect(impElMap.get(extId)).toBe(type);
    }

    expect(impRelMap.size).toBe(expRelMap.size);
    for (const [extId, type] of expRelMap.entries()) {
      expect(impRelMap.get(extId)).toBe(type);
    }

    // 2) Core reference integrity checks.
    for (const el of Object.values(imported!.elements)) {
      if (String(el.type) !== 'bpmn.pool') continue;
      const attrs = (el.attrs ?? {}) as Record<string, unknown>;
      if (typeof attrs.processRef === 'string') {
        const proc = imported!.elements[attrs.processRef];
        expect(proc).toBeTruthy();
        expect(String(proc.type)).toBe('bpmn.process');
      }
    }

    for (const el of Object.values(imported!.elements)) {
      if (String(el.type) !== 'bpmn.lane') continue;
      const attrs = (el.attrs ?? {}) as Record<string, unknown>;
      const refs = Array.isArray(attrs.flowNodeRefs) ? (attrs.flowNodeRefs as unknown[]).map(String) : [];
      for (const id of refs) {
        const target = imported!.elements[id];
        expect(target).toBeTruthy();
        // Lane members should be BPMN flow nodes (not containers / globals).
        expect(String(target.type)).not.toBe('bpmn.pool');
        expect(String(target.type)).not.toBe('bpmn.lane');
        expect(String(target.type)).not.toBe('bpmn.process');
      }
    }

    // 3) Migrations should have cleaned up legacy importer artifacts.
    assertNoUnresolvedRefs(imported!);
  });
});
