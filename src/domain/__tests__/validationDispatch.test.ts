import { createElement, createEmptyModel, createRelationship, createView } from '../factories';
import { validateModelWithNotations as validateModel } from '../../notations';

describe('validateModel dispatch (notation isolation)', () => {
  it('runs validators only for kinds present and aggregates issues from multiple kinds', () => {
    const model = createEmptyModel({ name: 'M' });

    // UML: create a generalization cycle (A -> B -> A)
    const a = createElement({ name: 'A', type: 'uml.class' });
    const b = createElement({ name: 'B', type: 'uml.class' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;
    const g1 = createRelationship({ type: 'uml.generalization', sourceElementId: a.id, targetElementId: b.id });
    const g2 = createRelationship({ type: 'uml.generalization', sourceElementId: b.id, targetElementId: a.id });
    model.relationships[g1.id] = g1;
    model.relationships[g2.id] = g2;

    // BPMN: lane outside pool (warning)
    const lane = createElement({ name: 'Lane', type: 'bpmn.lane' });
    model.elements[lane.id] = lane;
    const bpmnView = createView({
      name: 'BPMN',
      kind: 'bpmn',
      viewpointId: 'bpmn',
      layout: {
        nodes: [{ elementId: lane.id, x: 0, y: 0, width: 300, height: 120, zIndex: 0 }],
        relationships: []
      }
    });
    model.views[bpmnView.id] = bpmnView;

    const issues = validateModel(model);

    // Includes both kinds.
    expect(issues.some((i) => i.message.includes('Generalization cycle detected'))).toBe(true);
    expect(issues.some((i) => i.message.includes('Lane should be inside a Pool'))).toBe(true);

    // Does NOT accidentally run ArchiMate-specific checks.
    expect(issues.some((i) => i.message.startsWith('ArchiMate '))).toBe(false);

    // Basic regression guard: issue ids should be unique.
    const ids = issues.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not run UML/BPMN validation when only ArchiMate is present', () => {
    const model = createEmptyModel({ name: 'M' });
    const actor = createElement({ name: 'Actor', layer: 'Business', type: 'BusinessActor' });
    model.elements[actor.id] = actor;

    const issues = validateModel(model);

    expect(issues.some((i) => i.message.startsWith('UML '))).toBe(false);
    expect(issues.some((i) => i.message.startsWith('BPMN '))).toBe(false);
  });

  it('treats explicit relationship.kind as authoritative even if type looks ArchiMate', () => {
    const model = createEmptyModel({ name: 'M' });
    const u1 = createElement({ name: 'U1', type: 'uml.class' });
    const u2 = createElement({ name: 'U2', type: 'uml.class' });
    model.elements[u1.id] = u1;
    model.elements[u2.id] = u2;

    // Force a relationship that *looks* ArchiMate by type, but explicitly declare it as UML.
    const rel = createRelationship({
      kind: 'uml',
      type: 'Association' as any,
      sourceElementId: u1.id,
      targetElementId: u2.id
    });
    model.relationships[rel.id] = rel;

    const issues = validateModel(model);
    expect(issues.some((i) => i.message.includes(`UML relationship ${rel.id} has unknown type`))).toBe(true);
  });

  it('treats explicit element.kind as authoritative even if type looks ArchiMate', () => {
    const model = createEmptyModel({ name: 'M' });

    // Force an element that *looks* ArchiMate by type, but explicitly declare it as BPMN.
    const el = createElement({ kind: 'bpmn', name: 'Weird', type: 'BusinessActor' as any });
    model.elements[el.id] = el;

    const issues = validateModel(model);
    expect(issues.some((i) => i.message.includes(`BPMN element ${el.id} has unknown type`))).toBe(true);
  });
});
