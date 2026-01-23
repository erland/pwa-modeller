import { createElement, createEmptyModel } from '../../../domain/factories';

import {
  setPoolProcessRef,
  setLaneFlowNodeRefs,
  setTextAnnotationText,
  setDataObjectReferenceRef,
  setDataStoreReferenceRef
} from '../bpmn';

describe('bpmn mutations – safe setters', () => {
  test('setPoolProcessRef stores/clears processRef and validates types', () => {
    const model = createEmptyModel({ name: 'M' });

    const pool = createElement({ name: 'Pool', type: 'bpmn.pool' });
    const proc = createElement({ name: 'Process', type: 'bpmn.process', attrs: { isExecutable: true } });
    model.elements[pool.id] = pool;
    model.elements[proc.id] = proc;

    setPoolProcessRef(model, pool.id, proc.id);
    expect((model.elements[pool.id].attrs as any).processRef).toBe(proc.id);

    setPoolProcessRef(model, pool.id, null);
    expect((model.elements[pool.id].attrs as any)?.processRef).toBeUndefined();

    const notAProcess = createElement({ name: 'Task', type: 'bpmn.task' });
    model.elements[notAProcess.id] = notAProcess;
    expect(() => setPoolProcessRef(model, pool.id, notAProcess.id)).toThrow(/must reference a bpmn\.process/i);
  });

  test('setLaneFlowNodeRefs sanitizes ids and stores undefined when empty', () => {
    const model = createEmptyModel({ name: 'M' });

    const lane = createElement({ name: 'Lane', type: 'bpmn.lane' });
    const t1 = createElement({ name: 'T1', type: 'bpmn.task' });
    const t2 = createElement({ name: 'T2', type: 'bpmn.userTask' });
    model.elements[lane.id] = lane;
    model.elements[t1.id] = t1;
    model.elements[t2.id] = t2;

    setLaneFlowNodeRefs(model, lane.id, ['  ' + t1.id + '  ', t1.id, 'missing', t2.id]);
    expect((model.elements[lane.id].attrs as any).flowNodeRefs).toEqual([t1.id, t2.id]);

    setLaneFlowNodeRefs(model, lane.id, []);
    expect((model.elements[lane.id].attrs as any)?.flowNodeRefs).toBeUndefined();
  });

  test('setTextAnnotationText stores trimmed text and clears when blank', () => {
    const model = createEmptyModel({ name: 'M' });
    const ta = createElement({ name: 'Note', type: 'bpmn.textAnnotation' });
    model.elements[ta.id] = ta;

    setTextAnnotationText(model, ta.id, '  Hello  ');
    expect((model.elements[ta.id].attrs as any).text).toBe('Hello');

    setTextAnnotationText(model, ta.id, '   ');
    expect((model.elements[ta.id].attrs as any)?.text).toBeUndefined();
  });

  test('data object/store reference setters validate target type and allow clearing', () => {
    const model = createEmptyModel({ name: 'M' });

    const dor = createElement({ name: 'DO Ref', type: 'bpmn.dataObjectReference' });
    const dsr = createElement({ name: 'DS Ref', type: 'bpmn.dataStoreReference' });
    const doGlobal = createElement({ name: 'Global DO', type: 'bpmn.dataObject' });
    const dsGlobal = createElement({ name: 'Global DS', type: 'bpmn.dataStore' });
    model.elements[dor.id] = dor;
    model.elements[dsr.id] = dsr;
    model.elements[doGlobal.id] = doGlobal;
    model.elements[dsGlobal.id] = dsGlobal;

    setDataObjectReferenceRef(model, dor.id, doGlobal.id);
    expect((model.elements[dor.id].attrs as any).dataObjectRef).toBe(doGlobal.id);

    setDataStoreReferenceRef(model, dsr.id, dsGlobal.id);
    expect((model.elements[dsr.id].attrs as any).dataStoreRef).toBe(dsGlobal.id);

    // clearing
    setDataObjectReferenceRef(model, dor.id, null);
    expect((model.elements[dor.id].attrs as any).dataObjectRef).toBeUndefined();
    setDataStoreReferenceRef(model, dsr.id, null);
    expect((model.elements[dsr.id].attrs as any).dataStoreRef).toBeUndefined();

    // wrong type
    const wrong = createElement({ name: 'Wrong', type: 'bpmn.task' });
    model.elements[wrong.id] = wrong;
    expect(() => setDataObjectReferenceRef(model, dor.id, wrong.id)).toThrow(/must reference a bpmn\.dataObject/i);
    expect(() => setDataStoreReferenceRef(model, dsr.id, wrong.id)).toThrow(/must reference a bpmn\.dataStore/i);
  });
});
