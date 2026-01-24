import { createElement, createEmptyModel, createRelationship, createView } from '../../factories';
import { validateModelWithNotations as validateModel } from '../../../notations';

describe('UML validation (v1)', () => {
  it('reports generalization cycles', () => {
    const model = createEmptyModel({ name: 'M' });
    const a = createElement({ name: 'A', type: 'uml.class' });
    const b = createElement({ name: 'B', type: 'uml.class' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const r1 = createRelationship({ sourceElementId: a.id, targetElementId: b.id, type: 'uml.generalization' });
    const r2 = createRelationship({ sourceElementId: b.id, targetElementId: a.id, type: 'uml.generalization' });
    model.relationships[r1.id] = r1;
    model.relationships[r2.id] = r2;

    const issues = validateModel(model);
    const cycleIssues = issues.filter(i => i.message.includes('Generalization cycle'));
    expect(cycleIssues.length).toBeGreaterThan(0);
  });

  it('warns about unknown UML element types', () => {
    const model = createEmptyModel({ name: 'M' });
    const x = createElement({ name: 'X', type: 'uml.weird' as any });
    model.elements[x.id] = x;

    const issues = validateModel(model);
    expect(issues.some(i => i.message.includes('unknown type') && i.target.kind === 'element')).toBe(true);
  });

  it('warns when a UML view contains a non-UML element', () => {
    const model = createEmptyModel({ name: 'M' });
    const arch = createElement({ name: 'Service', layer: 'Business', type: 'BusinessService' });
    model.elements[arch.id] = arch;

    const v = createView({ name: 'UML', kind: 'uml', viewpointId: 'uml-class' });
    v.layout = {
      nodes: [
        {
          elementId: arch.id,
          x: 10,
          y: 10,
          width: 120,
          height: 60
        }
      ],
      relationships: []
    };
    model.views[v.id] = v;

    const issues = validateModel(model);
    expect(issues.some(i => i.message.includes('contains a non-UML element'))).toBe(true);
  });
});
