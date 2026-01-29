import { createEmptyModel, createElement, createView } from '../../../factories';
import type { Model } from '../../../types';
import { addElementToViewAt, updateViewNodeLayout } from '../../../../store/mutations/layout';
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

describe('extractBpmnLayoutInput (containment)', () => {
  test('assigns parentId for pools/lanes/subprocess by geometry containment', () => {
    const model = createEmptyModel({ name: 'M' });

    const pool = createElement({ id: 'P', name: 'Pool', type: 'bpmn.pool' });
    const lane = createElement({ id: 'L', name: 'Lane', type: 'bpmn.lane' });
    const sub = createElement({ id: 'S', name: 'Subprocess', type: 'bpmn.subProcess' });
    const t1 = createElement({ id: 'T1', name: 'Task 1', type: 'bpmn.task' });
    const t2 = createElement({ id: 'T2', name: 'Task 2', type: 'bpmn.task' });

    model.elements[pool.id] = pool;
    model.elements[lane.id] = lane;
    model.elements[sub.id] = sub;
    model.elements[t1.id] = t1;
    model.elements[t2.id] = t2;

    const view = createView({
      name: 'BPMN',
      kind: 'bpmn',
      viewpointId: 'bpmn',
      folderId: getRootFolderId(model)
    });
    putView(model, view);

    // Place pool -> lane -> (subprocess + tasks) using explicit sizes.
    addElementToViewAt(model, view.id, pool.id, 200, 140);
    addElementToViewAt(model, view.id, lane.id, 220, 160);
    addElementToViewAt(model, view.id, sub.id, 300, 230);
    addElementToViewAt(model, view.id, t1.id, 320, 250);
    addElementToViewAt(model, view.id, t2.id, 420, 190);

    // Ensure the containment logic sees clear boxes.
    updateViewNodeLayout(model, view.id, pool.id, { x: 0, y: 0, width: 600, height: 320 });
    updateViewNodeLayout(model, view.id, lane.id, { x: 40, y: 50, width: 540, height: 250 });
    updateViewNodeLayout(model, view.id, sub.id, { x: 120, y: 120, width: 320, height: 160 });
    updateViewNodeLayout(model, view.id, t1.id, { x: 150, y: 150, width: 160, height: 80 });
    updateViewNodeLayout(model, view.id, t2.id, { x: 320, y: 90, width: 160, height: 80 });

    const input = extractBpmnLayoutInput(model, view.id);
    const byId = new Map(input.nodes.map((n) => [n.id, n]));

    expect(byId.get(lane.id)?.parentId).toBe(pool.id);
    expect(byId.get(sub.id)?.parentId).toBe(lane.id);
    // Task 1 is inside subprocess => subprocess containment wins.
    expect(byId.get(t1.id)?.parentId).toBe(sub.id);
    // Task 2 is inside lane (but not subprocess) => lane parent.
    expect(byId.get(t2.id)?.parentId).toBe(lane.id);
  });
});
