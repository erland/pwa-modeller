import { createEmptyModel, createElement, createRelationship } from '../../../factories';
import { validateBpmnBasics } from '../../bpmn';

function hasIssueId(issues: { id: string }[], needle: string): boolean {
  return issues.some((i) => i.id.includes(needle));
}

describe('BPMN validation (consistency & usefulness)', () => {
  test('flags relationships disallowed by the BPMN matrix', () => {
    const model = createEmptyModel({ name: 'M' });

    const pool = createElement({ name: 'Pool', type: 'bpmn.pool' });
    const task = createElement({ name: 'Task', type: 'bpmn.task' });
    model.elements[pool.id] = pool;
    model.elements[task.id] = task;

    const rel = createRelationship({
      type: 'bpmn.sequenceFlow',
      sourceElementId: pool.id,
      targetElementId: task.id,
    });
    model.relationships[rel.id] = rel;

    const issues = validateBpmnBasics(model);
    expect(hasIssueId(issues, 'bpmn-rel-matrix-disallowed')).toBe(true);
  });

  test('flags wrong-type element references (dataObjectRef)', () => {
    const model = createEmptyModel({ name: 'M' });

    const task = createElement({ name: 'Task', type: 'bpmn.task' });
    const dor = createElement({
      name: 'DataObjRef',
      type: 'bpmn.dataObjectReference',
      attrs: { dataObjectRef: task.id },
    });

    model.elements[task.id] = task;
    model.elements[dor.id] = dor;

    const issues = validateBpmnBasics(model);
    expect(hasIssueId(issues, 'bpmn-dataObjectRef')).toBe(true);
  });

  test('surfaces unresolvedRefs written during import/apply', () => {
    const model = createEmptyModel({ name: 'M' });

    const ev = createElement({
      name: 'Start',
      type: 'bpmn.startEvent',
      attrs: {
        eventKind: 'start',
        eventDefinition: { kind: 'message', messageRef: 'missing' },
        unresolvedRefs: { 'eventDefinition.messageRef': 'ext:Message_1' },
      },
    });

    model.elements[ev.id] = ev;

    const issues = validateBpmnBasics(model);
    expect(hasIssueId(issues, 'bpmn-unresolved-refs')).toBe(true);
  });
});
