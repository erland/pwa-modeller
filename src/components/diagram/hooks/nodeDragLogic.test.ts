import { clampMoveInsideBpmnContainers, snapCoord, snapXY, toViewNodeRef } from './nodeDragLogic';

describe('nodeDragLogic', () => {
  test('toViewNodeRef maps element/connector/object correctly', () => {
    expect(toViewNodeRef({ kind: 'element', id: 'e1' })).toEqual({ elementId: 'e1' });
    expect(toViewNodeRef({ kind: 'connector', id: 'c1' })).toEqual({ connectorId: 'c1' });
    expect(toViewNodeRef({ kind: 'object', id: 'o1' })).toEqual({ objectId: 'o1' });
  });

  test('snapCoord returns unchanged when snapping disabled', () => {
    expect(snapCoord(23, false, 20)).toBe(23);
    expect(snapCoord(23, true, 1)).toBe(23);
  });

  test('snapCoord rounds to nearest grid cell when enabled', () => {
    expect(snapCoord(9, true, 10)).toBe(10);
    expect(snapCoord(14, true, 10)).toBe(10);
    expect(snapCoord(15, true, 10)).toBe(20);
  });

  test('snapXY snaps both coordinates', () => {
    expect(snapXY(9, 15, true, 10)).toEqual({ x: 10, y: 20 });
  });

  test('clampMoveInsideBpmnContainers clamps node inside pool', () => {
    const model: any = {
      id: 'm1',
      metadata: { name: 'm' },
      elements: {
        pool1: { id: 'pool1', type: 'bpmn.pool', name: 'Pool' },
        task1: { id: 'task1', type: 'bpmn.task', name: 'Task' },
      },
      relationships: {},
      views: {},
      folders: {},
    };

    const view: any = {
      id: 'v1',
      name: 'v',
      kind: 'bpmn',
      viewpointId: 'vp',
      connections: [],
      layout: {
        nodes: [
          {
            elementId: 'pool1',
            x: 0,
            y: 0,
            width: 400,
            height: 200,
            zIndex: 1,
          },
        ],
        relationships: [],
      },
    };

    const res = clampMoveInsideBpmnContainers({
      model,
      view,
      movingElementId: 'task1',
      x: 0,
      y: 0,
      w: 50,
      h: 50,
    });

    // pad=8, extraLeft (pool)=44 => loX=52, loY=8
    expect(res).toEqual({ x: 52, y: 8 });
  });
});
