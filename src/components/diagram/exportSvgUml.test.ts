import { createElement, createEmptyModel, createRelationship, createView } from '../../domain/factories';
import { createViewSvg } from './exportSvg';

describe('exportSvg UML', () => {
  it('exports UML generalization with marker defs', () => {
    const model = createEmptyModel({ name: 'M' });
    const a = createElement({ name: 'A', type: 'uml.class' });
    const b = createElement({ name: 'B', type: 'uml.class' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const rel = createRelationship({ sourceElementId: a.id, targetElementId: b.id, type: 'uml.generalization' });
    model.relationships[rel.id] = rel;

    const v = createView({ name: 'UML', kind: 'uml', viewpointId: 'uml-class' });
    v.layout = {
      nodes: [
        { elementId: a.id, x: 20, y: 20, width: 160, height: 90 },
        { elementId: b.id, x: 320, y: 60, width: 160, height: 90 }
      ],
      // `exportSvg` renders view-specific `connections` (not layout.relationships), so keep this empty.
      relationships: []
    };

    // View-specific relationship instance used by the exporter.
    v.connections = [
      {
        id: 'c1',
        viewId: v.id,
        relationshipId: rel.id,
        source: { kind: 'element', id: a.id },
        target: { kind: 'element', id: b.id },
        route: { kind: 'straight' }
      }
    ];
    model.views[v.id] = v;

    const svg = createViewSvg(model, v.id);
    expect(svg).toContain('id="triangleOpen"');
    expect(svg).toContain('url(#triangleOpen)');
  });
});
