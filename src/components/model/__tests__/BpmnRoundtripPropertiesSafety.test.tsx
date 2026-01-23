import * as fs from 'node:fs';
import * as path from 'node:path';

import React from 'react';
import { render } from '@testing-library/react';

import type { Element, Model, Relationship } from '../../../domain';
import {
  isBpmnActivityAttrs,
  isBpmnEventAttrs,
  isBpmnGatewayAttrs,
  isBpmnLaneAttrs,
  isBpmnMessageFlowAttrs,
  isBpmnSequenceFlowAttrs,
} from '../../../domain';
import { deserializeModel, modelStore } from '../../../store';

import { PropertiesPanel } from '../PropertiesPanel';

function readRoundtripFixture(name: string): string {
  const p = path.resolve(__dirname, '../../../__tests__/fixtures/bpmn2/roundtrip', name);
  return fs.readFileSync(p, 'utf-8');
}

const BPMN_ACTIVITY_TYPES = new Set([
  'bpmn.task',
  'bpmn.userTask',
  'bpmn.serviceTask',
  'bpmn.scriptTask',
  'bpmn.manualTask',
  'bpmn.callActivity',
  'bpmn.subProcess',
]);

const BPMN_EVENT_TYPES = new Set([
  'bpmn.startEvent',
  'bpmn.endEvent',
  'bpmn.intermediateCatchEvent',
  'bpmn.intermediateThrowEvent',
  'bpmn.boundaryEvent',
]);

const BPMN_GATEWAY_TYPES = new Set([
  'bpmn.gatewayExclusive',
  'bpmn.gatewayParallel',
  'bpmn.gatewayInclusive',
  'bpmn.gatewayEventBased',
]);

function collectRepresentativesByType<T extends { id: string; type: string }>(items: T[]): Map<string, string> {
  const byType = new Map<string, string>();
  for (const it of items) {
    if (!byType.has(it.type)) byType.set(it.type, it.id);
  }
  return byType;
}

describe('BPMN round-trip fixtures: baseline safety net', () => {
  afterEach(() => {
    modelStore.reset();
  });

  test('can deserialize the saved round-trip model fixture', () => {
    const json = readRoundtripFixture('tullverket-importcontrol.model.json');
    const model = deserializeModel(json);
    expect(model).toBeTruthy();
    expect(model.metadata?.name).toBeTruthy();

    // Sanity: the fixture should contain BPMN elements.
    const bpmnEls = Object.values(model.elements).filter((e) => e.type.startsWith('bpmn.'));
    expect(bpmnEls.length).toBeGreaterThan(10);
  });

  test('BPMN attrs in the saved model satisfy runtime guards where expected', () => {
    const json = readRoundtripFixture('tullverket-importcontrol.model.json');
    const model: Model = deserializeModel(json);

    for (const el of Object.values(model.elements)) {
      if (!el.type.startsWith('bpmn.')) continue;

      if (BPMN_EVENT_TYPES.has(el.type)) {
        expect(isBpmnEventAttrs(el.attrs)).toBe(true);
      } else if (BPMN_GATEWAY_TYPES.has(el.type)) {
        expect(isBpmnGatewayAttrs(el.attrs)).toBe(true);
      } else if (el.type === 'bpmn.lane') {
        // Lane containment may be absent in older fixtures; if present it must validate.
        if (el.attrs !== undefined) expect(isBpmnLaneAttrs(el.attrs)).toBe(true);
      } else if (BPMN_ACTIVITY_TYPES.has(el.type)) {
        // Activities may omit attrs; if present it must validate.
        if (el.attrs !== undefined) expect(isBpmnActivityAttrs(el.attrs)).toBe(true);
      }
    }

    for (const rel of Object.values(model.relationships)) {
      if (!rel.type.startsWith('bpmn.')) continue;
      if (rel.type === 'bpmn.sequenceFlow') {
        if (rel.attrs !== undefined) expect(isBpmnSequenceFlowAttrs(rel.attrs)).toBe(true);
      }
      if (rel.type === 'bpmn.messageFlow') {
        if (rel.attrs !== undefined) expect(isBpmnMessageFlowAttrs(rel.attrs)).toBe(true);
      }
    }
  });

  test('selecting each BPMN element/relationship type does not crash PropertiesPanel', () => {
    const json = readRoundtripFixture('tullverket-importcontrol.model.json');
    const model: Model = deserializeModel(json);

    // Load into store because PropertiesPanel reads model via useModelStore.
    modelStore.loadModel(model, 'tullverket-importcontrol.model.json');

    const bpmnElements: Element[] = Object.values(model.elements).filter((e) => e.type.startsWith('bpmn.'));
    const bpmnRelationships: Relationship[] = Object.values(model.relationships).filter((r) => r.type.startsWith('bpmn.'));

    const elementByType = collectRepresentativesByType(bpmnElements);
    const relByType = collectRepresentativesByType(bpmnRelationships);

    // Smoke render for every BPMN element type present in the fixture.
    for (const [, id] of elementByType.entries()) {
      const { unmount } = render(
        <PropertiesPanel selection={{ kind: 'element', elementId: id }} onEditModelProps={() => {}} />
      );
      unmount();
    }

    // Smoke render for every BPMN relationship type present in the fixture.
    for (const [, id] of relByType.entries()) {
      const { unmount } = render(
        <PropertiesPanel selection={{ kind: 'relationship', relationshipId: id }} onEditModelProps={() => {}} />
      );
      unmount();
    }
  });
});
