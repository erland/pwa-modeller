import { useMemo } from 'react';

import type { Folder, Model, RelationshipType } from '../../domain';
import { ARCHIMATE_LAYERS, ELEMENT_TYPES, RELATIONSHIP_TYPES, VIEWPOINTS } from '../../domain';
import { modelStore, useModelStore } from '../../store';
import type { Selection } from './selection';

type Props = {
  selection: Selection;
  onEditModelProps: () => void;
};

function findFolderByKind(model: Model, kind: Folder['kind']): Folder {
  const found = Object.values(model.folders).find((f) => f.kind === kind);
  if (!found) throw new Error(`Missing required folder kind: ${kind}`);
  return found;
}

function gatherFolderOptions(model: Model, rootId: string): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  function walk(folderId: string, prefix: string) {
    const folder = model.folders[folderId];
    out.push({ id: folderId, label: prefix ? `${prefix} / ${folder.name}` : folder.name });
    const children = folder.folderIds
      .map((id) => model.folders[id])
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    for (const c of children) walk(c.id, prefix ? `${prefix} / ${folder.name}` : folder.name);
  }
  walk(rootId, '');
  return out;
}

function findFolderContaining(model: Model, kind: 'element' | 'view', id: string): string | null {
  for (const folder of Object.values(model.folders)) {
    if (kind === 'element' && folder.elementIds.includes(id)) return folder.id;
    if (kind === 'view' && folder.viewIds.includes(id)) return folder.id;
  }
  return null;
}

export function PropertiesPanel({ selection, onEditModelProps }: Props) {
  const model = useModelStore((s) => s.model);

  const options = useMemo(() => {
    if (!model) return { elementFolders: [], viewFolders: [] };
    const elementsRoot = findFolderByKind(model, 'elements');
    const viewsRoot = findFolderByKind(model, 'views');
    return {
      elementFolders: gatherFolderOptions(model, elementsRoot.id),
      viewFolders: gatherFolderOptions(model, viewsRoot.id)
    };
  }, [model]);

  if (!model) {
    return (
      <div>
        <p className="panelHint">No model loaded yet.</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Selection</div>
            <div className="propertiesValue">—</div>
          </div>
        </div>
      </div>
    );
  }

  if (selection.kind === 'folder') {
    const folder = model.folders[selection.folderId];
    if (!folder) return <p className="panelHint">Folder not found.</p>;
    const canEdit = !(folder.kind === 'root' || folder.kind === 'elements' || folder.kind === 'views');
    return (
      <div>
        <p className="panelHint">Folder</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue">{folder.name}</div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Kind</div>
            <div className="propertiesValue">{folder.kind}</div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Folders</div>
            <div className="propertiesValue">{folder.folderIds.length}</div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Elements</div>
            <div className="propertiesValue">{folder.elementIds.length}</div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Views</div>
            <div className="propertiesValue">{folder.viewIds.length}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="shellButton"
            disabled={!canEdit}
            onClick={() => {
              const name = window.prompt('Rename folder', folder.name);
              if (!name) return;
              modelStore.renameFolder(folder.id, name);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="shellButton"
            disabled={!canEdit}
            onClick={() => {
              const ok = window.confirm('Delete this folder? Contents will be moved to its parent folder.');
              if (!ok) return;
              modelStore.deleteFolder(folder.id);
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  if (selection.kind === 'element') {
    const el = model.elements[selection.elementId];
    if (!el) return <p className="panelHint">Element not found.</p>;
    const currentFolderId = findFolderContaining(model, 'element', el.id);
    return (
      <div>
        <p className="panelHint">Element</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Element property name"
                value={el.name}
                onChange={(e) => modelStore.updateElement(el.id, { name: e.target.value })}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Type</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Element property type"
                value={el.type}
                onChange={(e) => modelStore.updateElement(el.id, { type: e.target.value as any })}
              >
                {ELEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Layer</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Element property layer"
                value={el.layer}
                onChange={(e) => modelStore.updateElement(el.id, { layer: e.target.value as any })}
              >
                {ARCHIMATE_LAYERS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Description</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="Element property description"
                value={el.description ?? ''}
                onChange={(e) => modelStore.updateElement(el.id, { description: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Docs</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="Element property documentation"
                value={el.documentation ?? ''}
                onChange={(e) => modelStore.updateElement(el.id, { documentation: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Folder</div>
            <div className="propertiesValue">
              <select
                className="selectInput"
                value={currentFolderId ?? ''}
                onChange={(e) => {
                  const targetId = e.target.value;
                  if (targetId) modelStore.moveElementToFolder(el.id, targetId);
                }}
              >
                {options.elementFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              const ok = window.confirm('Delete this element? Relationships referencing it will also be removed.');
              if (!ok) return;
              modelStore.deleteElement(el.id);
            }}
          >
            Delete element
          </button>
        </div>
      </div>
    );
  }

  if (selection.kind === 'relationship') {
    const rel = model.relationships[selection.relationshipId];
    if (!rel) return <p className="panelHint">Relationship not found.</p>;
    const elementOptions = Object.values(model.elements)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const sourceName = model.elements[rel.sourceElementId]?.name ?? rel.sourceElementId;
    const targetName = model.elements[rel.targetElementId]?.name ?? rel.targetElementId;

    return (
      <div>
        <p className="panelHint">Relationship</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Type</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Relationship property type"
                value={rel.type}
                onChange={(e) => modelStore.updateRelationship(rel.id, { type: e.target.value as RelationshipType })}
              >
                {RELATIONSHIP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">From</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Relationship property source"
                value={rel.sourceElementId}
                onChange={(e) => modelStore.updateRelationship(rel.id, { sourceElementId: e.target.value })}
              >
                {elementOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.type})
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Current: {sourceName}</div>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">To</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Relationship property target"
                value={rel.targetElementId}
                onChange={(e) => modelStore.updateRelationship(rel.id, { targetElementId: e.target.value })}
              >
                {elementOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.type})
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Current: {targetName}</div>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Relationship property name"
                value={rel.name ?? ''}
                onChange={(e) => modelStore.updateRelationship(rel.id, { name: e.target.value || undefined })}
              />
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Description</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="Relationship property description"
                value={rel.description ?? ''}
                onChange={(e) => modelStore.updateRelationship(rel.id, { description: e.target.value || undefined })}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              const ok = window.confirm('Delete this relationship?');
              if (!ok) return;
              modelStore.deleteRelationship(rel.id);
            }}
          >
            Delete relationship
          </button>
        </div>
      </div>
    );
  }

  if (selection.kind === 'view') {
    const view = model.views[selection.viewId];
    if (!view) return <p className="panelHint">View not found.</p>;
    const currentFolderId = findFolderContaining(model, 'view', view.id);
    const viewpointLabel = (id: string) => VIEWPOINTS.find((v) => v.id === id)?.title ?? id;
    return (
      <div>
        <p className="panelHint">View</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="View property name"
                value={view.name}
                onChange={(e) => modelStore.updateView(view.id, { name: e.target.value })}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Viewpoint</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="View property viewpoint"
                value={view.viewpointId}
                onChange={(e) => modelStore.updateView(view.id, { viewpointId: e.target.value })}
              >
                {VIEWPOINTS.map((vp) => (
                  <option key={vp.id} value={vp.id}>
                    {vp.title}
                  </option>
                ))}
              </select>
              <p className="panelHint" style={{ marginTop: 6 }}>
                {viewpointLabel(view.viewpointId)}
              </p>
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Description</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="View property description"
                value={view.description ?? ''}
                onChange={(e) => modelStore.updateView(view.id, { description: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Docs</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="View property documentation"
                value={view.documentation ?? ''}
                onChange={(e) => modelStore.updateView(view.id, { documentation: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Folder</div>
            <div className="propertiesValue">
              <select
                className="selectInput"
                value={currentFolderId ?? ''}
                onChange={(e) => {
                  const targetId = e.target.value;
                  if (targetId) modelStore.moveViewToFolder(view.id, targetId);
                }}
              >
                {options.viewFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              const ok = window.confirm('Delete this view?');
              if (!ok) return;
              modelStore.deleteView(view.id);
            }}
          >
            Delete view
          </button>
        </div>
      </div>
    );
  }

  // model or none
  return (
    <div>
      <p className="panelHint">Model</p>
      <div className="propertiesGrid">
        <div className="propertiesRow">
          <div className="propertiesKey">Name</div>
          <div className="propertiesValue">
            {/* Avoid duplicating the model name as a text node (navigator already shows it). */}
            <input className="textInput" aria-label="Model name" value={model.metadata.name} readOnly />
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Version</div>
          <div className="propertiesValue">{model.metadata.version ?? '—'}</div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Owner</div>
          <div className="propertiesValue">{model.metadata.owner ?? '—'}</div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button type="button" className="shellButton" onClick={onEditModelProps}>
          Edit model properties
        </button>
      </div>
    </div>
  );
}
