import { createElement, createEmptyModel, createRelationship } from '../../../../domain';
import { migrateModel, runMigrations } from '../index';

describe('migrations v9 -> v10 (BPMN attr normalization)', () => {
  test('normalizes BPMN element attrs by type and bumps schemaVersion', () => {
    const model: any = createEmptyModel({ name: 'Legacy v9' });
    model.schemaVersion = 9;

    const msg = createElement({ name: 'Msg', type: 'bpmn.message' }) as any;
    msg.attrs = { loopType: 'none', isForCompensation: true, itemRef: 'Item_1' };
    model.elements[msg.id] = msg;

    const pool = createElement({ name: 'Pool', type: 'bpmn.pool' }) as any;
    pool.attrs = { processRef: 'proc_1', loopType: 'none' };
    model.elements[pool.id] = pool;

    const task = createElement({ name: 'Task', type: 'bpmn.task' }) as any;
    task.attrs = { loopType: 'multiInstanceParallel', isForCompensation: true, eventKind: 'start' };
    model.elements[task.id] = task;

    const dataStore = createElement({ name: 'DS', type: 'bpmn.dataStore' }) as any;
    dataStore.attrs = { loopType: 'none' };
    model.elements[dataStore.id] = dataStore;

    const migrated = migrateModel(model as any) as any;
    expect(migrated.schemaVersion).toBe(10);

    // Message keeps only message attrs
    expect(migrated.elements[msg.id].attrs).toEqual({ itemRef: 'Item_1' });

    // Pool keeps processRef but not activity fields
    expect(migrated.elements[pool.id].attrs).toEqual({ processRef: 'proc_1' });

    // Activity keeps activity markers but drops event-only field
    expect(migrated.elements[task.id].attrs).toEqual({ loopType: 'multiInstanceParallel', isForCompensation: true });

    // Non-attributed BPMN elements should shed stray attrs entirely
    expect(migrated.elements[dataStore.id].attrs).toBeUndefined();
  });

  test('normalizes BPMN relationship attrs by type and removes empty attrs', () => {
    const model: any = createEmptyModel({ name: 'Legacy v9 rels' });
    model.schemaVersion = 9;

    const a = createElement({ name: 'A', type: 'bpmn.task' });
    const b = createElement({ name: 'B', type: 'bpmn.task' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const seq = createRelationship({
      type: 'bpmn.sequenceFlow',
      sourceElementId: a.id,
      targetElementId: b.id,
      attrs: { conditionExpression: '${x}', messageRef: 'Msg_1' } as any
    }) as any;
    model.relationships[seq.id] = seq;

    const msgFlow = createRelationship({
      type: 'bpmn.messageFlow',
      sourceElementId: a.id,
      targetElementId: b.id,
      attrs: { messageRef: 'Msg_2', conditionExpression: '${y}' } as any
    }) as any;
    model.relationships[msgFlow.id] = msgFlow;

    const assoc = createRelationship({
      type: 'bpmn.association',
      sourceElementId: a.id,
      targetElementId: b.id,
      attrs: { messageRef: 'Msg_3', conditionExpression: '${z}' } as any
    }) as any;
    model.relationships[assoc.id] = assoc;

    const migrated = runMigrations(model as any).model as any;
    expect(migrated.schemaVersion).toBe(10);

    expect(migrated.relationships[seq.id].attrs).toEqual({ conditionExpression: '${x}' });
    expect(migrated.relationships[msgFlow.id].attrs).toEqual({ messageRef: 'Msg_2' });
    expect(migrated.relationships[assoc.id].attrs).toBeUndefined();
  });
});
