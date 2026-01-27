import { createEmptyModel, createView, createViewObject } from '../../../../domain';
import type { View } from '../../../../domain';
import { fixViewZOrder } from '../fixViewZOrder';

describe('fixViewZOrder', () => {
  it('puts GroupBox behind contained element nodes', () => {
    const model = createEmptyModel({ name: 'M' }, 'm1');

    model.elements['e1'] = { id: 'e1', kind: 'uml', name: 'Small', type: 'uml.class', externalIds: [], taggedValues: [] } as any;

    const obj = createViewObject({ id: 'o1', type: 'GroupBox', text: 'Container' });

    const view: View = createView({
      id: 'v1',
      name: 'V',
      kind: 'uml',
      viewpointId: 'uml',
      objects: { [obj.id]: obj },
      layout: {
        nodes: [
          { objectId: obj.id, x: 0, y: 0, width: 500, height: 300 },
          { elementId: 'e1', x: 50, y: 50, width: 120, height: 80 }
        ],
        relationships: []
      }
    });

    const fixed = fixViewZOrder(model as any, view);
    const gb = fixed.find((n) => n.objectId === obj.id)!;
    const el = fixed.find((n) => n.elementId === 'e1')!;
    expect(typeof gb.zIndex).toBe('number');
    expect(typeof el.zIndex).toBe('number');
    expect(gb.zIndex!).toBeLessThan(el.zIndex!);
  });

  it('puts UML package frames behind contained classifier nodes', () => {
    const model = createEmptyModel({ name: 'M' }, 'm1');

    model.elements['pkg'] = { id: 'pkg', kind: 'uml', name: 'P', type: 'uml.package', externalIds: [], taggedValues: [] } as any;
    model.elements['cls'] = { id: 'cls', kind: 'uml', name: 'C', type: 'uml.class', externalIds: [], taggedValues: [] } as any;

    const view: View = createView({
      id: 'v1',
      name: 'V',
      kind: 'uml',
      viewpointId: 'uml',
      layout: {
        nodes: [
          { elementId: 'cls', x: 80, y: 80, width: 150, height: 90 },
          { elementId: 'pkg', x: 0, y: 0, width: 600, height: 400 }
        ],
        relationships: []
      }
    });

    const fixed = fixViewZOrder(model as any, view);
    const pkg = fixed.find((n) => n.elementId === 'pkg')!;
    const cls = fixed.find((n) => n.elementId === 'cls')!;
    expect(pkg.zIndex!).toBeLessThan(cls.zIndex!);
  });

  it('keeps notes/labels on top of normal nodes', () => {
    const model = createEmptyModel({ name: 'M' }, 'm1');

    model.elements['e1'] = { id: 'e1', kind: 'uml', name: 'Small', type: 'uml.class', externalIds: [], taggedValues: [] } as any;

    const note = createViewObject({ id: 'note1', type: 'Note', text: 'Hello' });

    const view: View = createView({
      id: 'v1',
      name: 'V',
      kind: 'uml',
      viewpointId: 'uml',
      objects: { [note.id]: note },
      layout: {
        nodes: [
          { elementId: 'e1', x: 0, y: 0, width: 100, height: 60 },
          { objectId: note.id, x: 10, y: 10, width: 200, height: 80 }
        ],
        relationships: []
      }
    });

    const fixed = fixViewZOrder(model as any, view);
    const el = fixed.find((n) => n.elementId === 'e1')!;
    const n = fixed.find((x) => x.objectId === note.id)!;
    expect(n.zIndex!).toBeGreaterThan(el.zIndex!);
  });
});
