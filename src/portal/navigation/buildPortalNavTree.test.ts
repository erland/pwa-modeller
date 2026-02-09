import { buildPortalNavTree } from './buildPortalNavTree';
import type { Model } from '../../domain';

function makeModel(partial: Partial<Model>): Model {
  return {
    id: partial.id ?? 'm1',
    metadata: partial.metadata ?? { name: 'Test' },
    elements: partial.elements ?? {},
    relationships: partial.relationships ?? {},
    views: partial.views ?? {},
    folders: partial.folders ?? {},
    schemaVersion: partial.schemaVersion,
    taggedValues: (partial as any).taggedValues ?? {},
    externalIds: (partial as any).externalIds ?? {},
  } as Model;
}

describe('buildPortalNavTree', () => {
  test('builds hierarchical tree from folders with folders first then views (sorted)', () => {
    const model = makeModel({
      elements: {},
      views: {
        v1: { id: 'v1', name: 'Zeta', viewpointId: 'vp', nodes: [], connections: [] } as any,
        v2: { id: 'v2', name: 'Alpha', viewpointId: 'vp', nodes: [], connections: [] } as any,
      },
      folders: {
        root: {
          id: 'root',
          name: 'Root',
          kind: 'root',
          folderIds: ['fB', 'fA'],
          elementIds: [],
          relationshipIds: [],
          viewIds: ['v1', 'v2'],
          taggedValues: {},
          externalIds: {},
        } as any,
        fA: {
          id: 'fA',
          name: 'AlphaFolder',
          kind: 'custom',
          parentId: 'root',
          folderIds: [],
          elementIds: [],
          relationshipIds: [],
          viewIds: [],
          taggedValues: {},
          externalIds: {},
        } as any,
        fB: {
          id: 'fB',
          name: 'BetaFolder',
          kind: 'custom',
          parentId: 'root',
          folderIds: [],
          elementIds: [],
          relationshipIds: [],
          viewIds: [],
          taggedValues: {},
          externalIds: {},
        } as any,
      },
    });

    const nodes = buildPortalNavTree({ model, rootFolderId: 'root' });
    // Root container is hidden; its direct children become top-level.
    expect(nodes).toHaveLength(4);
    // folders first
    expect(nodes.slice(0, 2).map((c) => c.label)).toEqual(['AlphaFolder', 'BetaFolder']);
    // views after folders, sorted
    expect(nodes.slice(2).map((c) => c.label)).toEqual(['Alpha', 'Zeta']);
  });

  test('falls back to virtual group when root folder is missing', () => {
    const model = makeModel({
      views: {
        v1: { id: 'v1', name: 'One', viewpointId: 'vp', nodes: [], connections: [] } as any,
      },
      folders: {},
    });

    const nodes = buildPortalNavTree({ model, rootFolderId: 'does-not-exist' });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].kind).toBe('folder');
    expect(nodes[0].label).toBe('Views');
    expect(nodes[0].children?.[0].kind).toBe('view');
    expect(nodes[0].children?.[0].payloadRef.viewId).toBe('v1');
  });

  test('nests element-owned views under the owning element when includeElements is true', () => {
    const model = makeModel({
      elements: {
        e1: { id: 'e1', name: 'Process A', type: 'BusinessProcess', taggedValues: {}, externalIds: {} } as any,
      },
      views: {
        vOwned: {
          id: 'vOwned',
          name: 'Detail View',
          kind: 'archimate',
          viewpointId: 'vp',
          ownerRef: { kind: 'archimate', id: 'e1' },
          layout: { nodes: [], relationships: [] },
          connections: [],
          taggedValues: {},
          externalIds: {},
        } as any,
      },
      folders: {
        root: {
          id: 'root',
          name: 'Root',
          kind: 'root',
          folderIds: [],
          elementIds: ['e1'],
          relationshipIds: [],
          viewIds: ['vOwned'],
          taggedValues: {},
          externalIds: {},
        } as any,
      },
    });

    const nodes = buildPortalNavTree({ model, rootFolderId: 'root', includeElements: true });
    const el = nodes.find((n) => n.kind === 'element') as any;
    expect(el?.label).toBe('Process A');
    expect(el?.children?.[0]?.kind).toBe('view');
    expect(el?.children?.[0]?.payloadRef?.viewId).toBe('vOwned');
    // Owned view should not also appear as a folder view leaf
    expect(nodes.some((n) => n.kind === 'view' && (n as any).payloadRef?.viewId === 'vOwned')).toBe(false);
  });
});
