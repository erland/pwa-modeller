import { createEmptyModel, createElement, createRelationship, createView } from '../../../factories';
import type { Model, ViewConnection } from '../../../types';
import { addElementToViewAt } from '../../../../store/mutations/layout';
import { extractBpmnLayoutInput } from '../extractBpmnLayoutInput';

function getRootFolderId(model: Model): string {
  const root = Object.values(model.folders).find((f) => f.kind === 'root');
  if (!root) throw new Error('Root folder not found');
  return root.id;
}

function putView(model: Model, view: ReturnType<typeof createView>): void {
  model.views[view.id] = view;
  const rootId = getRootFolderId(model);
  model.folders[rootId] = { ...model.folders[rootId], viewIds: [...model.folders[rootId].viewIds, view.id] };
}

describe('extractBpmnLayoutInput', () => {
  test('extracts nodes + edges and adds simple port/anchor hints for sequence flow', () => {
    const model = createEmptyModel({ name: 'M' });

    const a = createElement({ id: 'A', name: 'Task A', type: 'bpmn.task' });
    const b = createElement({ id: 'B', name: 'Task B', type: 'bpmn.task' });
    model.elements[a.id] = a;
    model.elements[b.id] = b;

    const rel = createRelationship({
      id: 'R1',
      name: 'seq',
      type: 'bpmn.sequenceFlow',
      sourceElementId: a.id,
      targetElementId: b.id
    });
    model.relationships[rel.id] = rel;

    const view = createView({
      name: 'BPMN View',
      kind: 'bpmn',
      viewpointId: 'bpmn',
      folderId: getRootFolderId(model)
    });
    putView(model, view);

    addElementToViewAt(model, view.id, a.id, 100, 100);
    addElementToViewAt(model, view.id, b.id, 350, 100);

    const conn: ViewConnection = {
      id: 'c1',
      viewId: view.id,
      relationshipId: rel.id,
      source: { kind: 'element', id: a.id },
      target: { kind: 'element', id: b.id },
      route: { kind: 'orthogonal' }
    };
    model.views[view.id] = { ...model.views[view.id], connections: [conn] };

    const input = extractBpmnLayoutInput(model, view.id);

    // Ports exist on nodes (4 sides).
    const nodeA = input.nodes.find((n) => n.id === a.id);
    expect(nodeA?.ports?.map((p) => p.id)).toEqual(expect.arrayContaining([`${a.id}:N`, `${a.id}:E`, `${a.id}:S`, `${a.id}:W`]));

    expect(input.edges).toHaveLength(1);
    expect(input.edges[0]).toEqual({
      id: 'c1',
      sourceId: a.id,
      targetId: b.id,
      weight: 1,
      kind: 'bpmn.sequenceFlow',
      sourcePortId: `${a.id}:E`,
      targetPortId: `${b.id}:W`
    });
  });
});
