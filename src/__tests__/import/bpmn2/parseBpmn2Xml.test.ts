import * as fs from 'node:fs';
import * as path from 'node:path';

import { detectBpmn2FromText } from '../../../import/bpmn2/detectBpmn2';
import { parseBpmn2Xml } from '../../../import/bpmn2/parseBpmn2Xml';
import { normalizeBpmn2ImportIR } from '../../../import/bpmn2/normalizeBpmn2ImportIR';
import { createImportReport } from '../../../import/importReport';

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

  it('parses BPMNDI and creates views with geometry (nodes + edge waypoints)', () => {
    const xml = readFixture('core-subset-di.bpmn');
    const res = parseBpmn2Xml(xml);

    expect(res.importIR.views?.length).toBe(1);
    const view = res.importIR.views![0];

    // Nodes
    const byElement = new Map(view.nodes.filter((n) => n.elementId).map((n) => [n.elementId!, n]));
    expect(byElement.get('Start_1')?.bounds).toEqual({ x: 100, y: 100, width: 36, height: 36 });
    expect(byElement.get('Task_1')?.bounds).toEqual({ x: 180, y: 90, width: 100, height: 80 });
    expect(byElement.get('End_1')?.bounds).toEqual({ x: 320, y: 100, width: 36, height: 36 });

    // Connections
    const c1 = view.connections.find((c) => c.relationshipId === 'Flow_1');
    expect(c1).toBeTruthy();
    expect(c1!.points?.length).toBe(2);
    expect(c1!.points![0]).toEqual({ x: 136, y: 118 });
    expect(c1!.points![1]).toEqual({ x: 180, y: 130 });
  });

  it('normalizes EA-focused hygiene (docs, stable ordering, and dangling refs)', () => {
    const xml = readFixture('core-subset-di.bpmn');
    const res = parseBpmn2Xml(xml);

    // Force a documentation string with CRLF and CR.
    res.importIR.elements[0].documentation = 'Line1\r\nLine2\rLine3';

    // Add a dangling relationship (common in partial exports)
    res.importIR.relationships.push({
      id: 'Dangling_1',
      type: 'bpmn.sequenceFlow',
      sourceId: 'MissingSource',
      targetId: 'MissingTarget'
    });

    // Add an out-of-order element to verify stable sorting.
    res.importIR.elements.push({
      id: 'AAA',
      type: 'bpmn.task',
      name: 'A task'
    });

    const report = createImportReport('bpmn2');
    const normalized = normalizeBpmn2ImportIR(res.importIR, { report, source: 'bpmn2' });

    expect(normalized.elements[0].id).toBe('AAA');
    expect(normalized.elements.find((e) => e.id === res.importIR.elements[0].id)?.documentation).toBe('Line1\nLine2\nLine3');
    expect(normalized.relationships.find((r) => r.id === 'Dangling_1')).toBeUndefined();
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('parses BPMN eventDefinitions into element attrs', () => {
    const xml = readFixture('event-defs.bpmn');
    const res = parseBpmn2Xml(xml);

    const byId = new Map(res.importIR.elements.map((e) => [e.id, e] as const));

    const start = byId.get('Start_Message');
    expect(start?.type).toBe('bpmn.startEvent');
    expect((start as any)?.attrs?.eventKind).toBe('start');
    expect((start as any)?.attrs?.eventDefinition?.kind).toBe('message');
    expect((start as any)?.attrs?.eventDefinition?.messageRef).toBe('Msg_In');

    const boundary = byId.get('Boundary_Error');
    expect(boundary?.type).toBe('bpmn.boundaryEvent');
    expect((boundary as any)?.attrs?.eventKind).toBe('boundary');
    expect((boundary as any)?.attrs?.attachedToRef).toBe('Task_1');
    expect((boundary as any)?.attrs?.cancelActivity).toBe(false);
    expect((boundary as any)?.attrs?.eventDefinition?.kind).toBe('error');
    expect((boundary as any)?.attrs?.eventDefinition?.errorRef).toBe('Err_Bad');

    const timer = byId.get('Catch_Timer');
    expect(timer?.type).toBe('bpmn.intermediateCatchEvent');
    expect((timer as any)?.attrs?.eventKind).toBe('intermediateCatch');
    expect((timer as any)?.attrs?.eventDefinition?.kind).toBe('timer');
    expect((timer as any)?.attrs?.eventDefinition?.timeDuration).toBe('PT5M');

    const end = byId.get('End_Terminate');
    expect(end?.type).toBe('bpmn.endEvent');
    expect((end as any)?.attrs?.eventKind).toBe('end');
    expect((end as any)?.attrs?.eventDefinition?.kind).toBe('terminate');
  });

  it('parses dataInputAssociation/dataOutputAssociation as relationships', () => {
    const xml = readFixture('data-associations.bpmn');
    const res = parseBpmn2Xml(xml);

    const byId = new Map(res.importIR.relationships.map((r) => [r.id, r] as const));
    expect(byId.get('DIA_1')?.type).toBe('bpmn.dataInputAssociation');
    expect(byId.get('DIA_1')?.sourceId).toBe('DOR_1');
    expect(byId.get('DIA_1')?.targetId).toBe('Task_1');

    expect(byId.get('DOA_1')?.type).toBe('bpmn.dataOutputAssociation');
    expect(byId.get('DOA_1')?.sourceId).toBe('Task_1');
    expect(byId.get('DOA_1')?.targetId).toBe('DSR_1');
  });

});
