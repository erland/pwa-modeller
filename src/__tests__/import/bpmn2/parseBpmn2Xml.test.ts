import * as fs from 'node:fs';
import * as path from 'node:path';

import { detectBpmn2FromText } from '../../../import/bpmn2/detectBpmn2';
import { parseBpmn2Xml } from '../../../import/bpmn2/parseBpmn2Xml';

function readFixture(name: string): string {
  const p = path.resolve(__dirname, '../../fixtures/bpmn2/ea', name);
  return fs.readFileSync(p, 'utf-8');
}

describe('BPMN2 XML parsing', () => {
  it('sniffs BPMN2 and reaches <definitions> without throwing', () => {
    const xml = readFixture('minimal-export.bpmn');

    // The sniffer is designed to run on a prefix; emulate that.
    expect(detectBpmn2FromText(xml.slice(0, 400))).toBe(true);

    const res = parseBpmn2Xml(xml);
    expect(res.importIR.meta?.format).toBe('bpmn2');

    // Step 1: importer skeleton returns a well-formed IR.
    expect(Array.isArray(res.importIR.folders)).toBe(true);
    expect(Array.isArray(res.importIR.elements)).toBe(true);
    expect(Array.isArray(res.importIR.relationships)).toBe(true);
    expect(Array.isArray(res.importIR.views)).toBe(true);

    expect(Array.isArray(res.warnings)).toBe(true);
  });

  it('parses core BPMN semantics into ImportIR (elements + relationships)', () => {
    const xml = readFixture('core-subset.bpmn');

    const res = parseBpmn2Xml(xml);

    // Elements
    const types = new Set(res.importIR.elements.map((e) => e.type));
    expect(types.has('bpmn.pool')).toBe(true);
    expect(types.has('bpmn.lane')).toBe(true);
    expect(types.has('bpmn.startEvent')).toBe(true);
    expect(types.has('bpmn.task')).toBe(true);
    expect(types.has('bpmn.endEvent')).toBe(true);

    // Names must be non-empty (domain factories require this)
    for (const el of res.importIR.elements) {
      expect(typeof el.name).toBe('string');
      expect(el.name.trim().length).toBeGreaterThan(0);
    }

    // Relationships
    expect(res.importIR.relationships.length).toBe(2);
    for (const rel of res.importIR.relationships) {
      expect(rel.type).toBe('bpmn.sequenceFlow');
      expect(typeof rel.sourceId).toBe('string');
      expect(typeof rel.targetId).toBe('string');
    }
  });
});
