import {
  computePendingRelationshipTypeOptions,
  defaultRelTypeForViewKind,
  isRelTypeForViewKind,
  pickDefaultPendingRelationshipType,
  prioritizeRelationshipTypes,
} from '../typeResolver';

import { makeElement, makeModel, makeView, makeViewLayout, makeViewNode } from '../../../../test/builders';

describe('relationshipCreation/typeResolver', () => {
  test('prioritizeRelationshipTypes preserves preferred order and keeps the rest', () => {
    const all = ['b', 'a', 'c', 'd'] as any;
    const preferred = ['c', 'a'] as any;
    expect(prioritizeRelationshipTypes(all, preferred)).toEqual(['c', 'a', 'b', 'd']);
  });

  test('defaultRelTypeForViewKind + isRelTypeForViewKind', () => {
    expect(defaultRelTypeForViewKind('uml')).toBe('uml.association');
    expect(defaultRelTypeForViewKind('bpmn')).toBe('bpmn.sequenceFlow');
    expect(defaultRelTypeForViewKind('archimate')).toBe('Association');

    expect(isRelTypeForViewKind('uml', 'uml.association' as any)).toBe(true);
    expect(isRelTypeForViewKind('uml', 'Association' as any)).toBe(false);

    expect(isRelTypeForViewKind('bpmn', 'bpmn.sequenceFlow' as any)).toBe(true);
    expect(isRelTypeForViewKind('bpmn', 'Serving' as any)).toBe(false);

    // ArchiMate: unqualified types + Unknown are considered in-kind.
    expect(isRelTypeForViewKind('archimate', 'Association' as any)).toBe(true);
    expect(isRelTypeForViewKind('archimate', 'Unknown' as any)).toBe(true);
    expect(isRelTypeForViewKind('archimate', 'uml.association' as any)).toBe(false);
  });

  test('computePendingRelationshipTypeOptions filters by notation rules for element-to-element', () => {
    // BPMN: connecting from a Pool is not allowed by the BPMN notation rules.
    const pool = makeElement({ id: 'p1', type: 'bpmn.pool', name: 'Pool' } as any);
    const task = makeElement({ id: 't1', type: 'bpmn.task', name: 'Task' } as any);
    const view = makeView({ id: 'v1', kind: 'bpmn' } as any);

    const model = makeModel({
      elements: { [pool.id]: pool, [task.id]: task },
      views: { [view.id]: view },
    });

    const options = computePendingRelationshipTypeOptions({
      model,
      viewId: view.id,
      sourceRef: { kind: 'element', id: pool.id },
      targetRef: { kind: 'element', id: task.id },
      showAll: false,
    });

    expect(options).toEqual([]);

    // In showAll mode, the function appends all types after allowed ones.
    const optionsAll = computePendingRelationshipTypeOptions({
      model,
      viewId: view.id,
      sourceRef: { kind: 'element', id: pool.id },
      targetRef: { kind: 'element', id: task.id },
      showAll: true,
    });
    expect(optionsAll.length).toBeGreaterThan(0);
    expect(optionsAll[0]).toMatch(/^bpmn\./);
  });

  test('computePendingRelationshipTypeOptions applies BPMN ordering hints (cross-pool prefers messageFlow)', () => {
    const poolA = makeElement({ id: 'poolA', type: 'bpmn.pool', name: 'Pool A' } as any);
    const poolB = makeElement({ id: 'poolB', type: 'bpmn.pool', name: 'Pool B' } as any);
    const taskA = makeElement({ id: 'taskA', type: 'bpmn.task', name: 'Task A' } as any);
    const taskB = makeElement({ id: 'taskB', type: 'bpmn.task', name: 'Task B' } as any);

    // Place each task inside its pool (geometry-based pool detection).
    const layout = makeViewLayout({
      nodes: [
        makeViewNode({ elementId: poolA.id, x: 0, y: 0, width: 400, height: 200 }),
        makeViewNode({ elementId: poolB.id, x: 500, y: 0, width: 400, height: 200 }),
        makeViewNode({ elementId: taskA.id, x: 50, y: 50, width: 120, height: 80 }),
        makeViewNode({ elementId: taskB.id, x: 550, y: 50, width: 120, height: 80 }),
      ],
    });
    const view = makeView({ id: 'vb', kind: 'bpmn', layout } as any);

    const model = makeModel({
      elements: { [poolA.id]: poolA, [poolB.id]: poolB, [taskA.id]: taskA, [taskB.id]: taskB },
      views: { [view.id]: view },
    });

    const options = computePendingRelationshipTypeOptions({
      model,
      viewId: view.id,
      sourceRef: { kind: 'element', id: taskA.id },
      targetRef: { kind: 'element', id: taskB.id },
      showAll: false,
    });

    // Hints should prefer Message Flow before Sequence Flow.
    const msgIdx = options.indexOf('bpmn.messageFlow' as any);
    const seqIdx = options.indexOf('bpmn.sequenceFlow' as any);
    expect(msgIdx).toBeGreaterThanOrEqual(0);
    expect(seqIdx).toBeGreaterThanOrEqual(0);
    expect(msgIdx).toBeLessThan(seqIdx);
  });

  test('pickDefaultPendingRelationshipType uses BPMN preferred default when available', () => {
    const poolA = makeElement({ id: 'poolA', type: 'bpmn.pool' } as any);
    const poolB = makeElement({ id: 'poolB', type: 'bpmn.pool' } as any);
    const taskA = makeElement({ id: 'taskA', type: 'bpmn.task' } as any);
    const taskB = makeElement({ id: 'taskB', type: 'bpmn.task' } as any);
    const layout = makeViewLayout({
      nodes: [
        makeViewNode({ elementId: poolA.id, x: 0, y: 0, width: 400, height: 200 }),
        makeViewNode({ elementId: poolB.id, x: 500, y: 0, width: 400, height: 200 }),
        makeViewNode({ elementId: taskA.id, x: 50, y: 50, width: 120, height: 80 }),
        makeViewNode({ elementId: taskB.id, x: 550, y: 50, width: 120, height: 80 }),
      ],
    });
    const view = makeView({ id: 'vdef', kind: 'bpmn', layout } as any);
    const model = makeModel({
      elements: { [poolA.id]: poolA, [poolB.id]: poolB, [taskA.id]: taskA, [taskB.id]: taskB },
      views: { [view.id]: view },
    });

    const options = ['bpmn.association', 'bpmn.sequenceFlow', 'bpmn.messageFlow'] as any;

    const picked = pickDefaultPendingRelationshipType({
      model,
      viewId: view.id,
      sourceRef: { kind: 'element', id: taskA.id },
      targetRef: { kind: 'element', id: taskB.id },
      lastRelType: 'bpmn.sequenceFlow' as any,
      options,
    });

    expect(picked).toBe('bpmn.messageFlow');
  });

  test('pickDefaultPendingRelationshipType falls back to lastRelType only if it matches view kind', () => {
    const c1 = makeElement({ id: 'c1', type: 'uml.class' } as any);
    const c2 = makeElement({ id: 'c2', type: 'uml.class' } as any);
    const view = makeView({ id: 'vu', kind: 'uml' } as any);
    const model = makeModel({ elements: { c1, c2 } as any, views: { [view.id]: view } });

    const options = ['uml.association', 'uml.generalization'] as any;

    // lastRelType from another kind should be ignored.
    const picked = pickDefaultPendingRelationshipType({
      model,
      viewId: view.id,
      sourceRef: { kind: 'element', id: c1.id },
      targetRef: { kind: 'element', id: c2.id },
      lastRelType: 'Association' as any,
      options,
    });

    expect(picked).toBe('uml.association');
  });
});
