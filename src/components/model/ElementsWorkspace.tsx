import { useMemo, useState } from 'react';

import type { ArchimateLayer, Element, ElementType, Folder, Model } from '../../domain';
import { ARCHIMATE_LAYERS, ELEMENT_TYPES_BY_LAYER, createElement } from '../../domain';
import { modelStore, useModelStore } from '../../store';
import { Dialog } from '../dialog/Dialog';
import type { Selection } from './selection';

type Props = {
  selection: Selection;
  onSelect: (selection: Selection) => void;
};

function sortByName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function isFolderWithinElementsTree(model: Model, folderId: string): boolean {
  let current: Folder | undefined = model.folders[folderId];
  while (current) {
    if (current.kind === 'elements') return true;
    current = current.parentId ? model.folders[current.parentId] : undefined;
  }
  return false;
}

function folderPath(model: Model, folderId: string): string {
  const names: string[] = [];
  let current: Folder | undefined = model.folders[folderId];
  while (current) {
    if (current.kind !== 'root') names.push(current.name);
    current = current.parentId ? model.folders[current.parentId] : undefined;
  }
  return names.reverse().join(' / ');
}

export function ElementsWorkspace({ selection, onSelect }: Props) {
  const model = useModelStore((s) => s.model);

  const [layer, setLayer] = useState<ArchimateLayer>('Business');
  const [elementType, setElementType] = useState<ElementType>(ELEMENT_TYPES_BY_LAYER.Business[0]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [documentation, setDocumentation] = useState('');

  const typesForLayer = useMemo(() => ELEMENT_TYPES_BY_LAYER[layer], [layer]);

  const elementRows = useMemo(() => {
    if (!model) return [];

    const folderByElement = new Map<string, string>();
    for (const f of Object.values(model.folders)) {
      for (const id of f.elementIds) folderByElement.set(id, f.id);
    }

    const elements = Object.values(model.elements).sort(sortByName);
    return elements.map((el) => {
      const fid = folderByElement.get(el.id);
      return {
        el,
        folderId: fid ?? null,
        folderLabel: fid ? folderPath(model, fid) : '—'
      };
    });
  }, [model]);

  function resetElementForm(e?: Partial<Element>) {
    setName(e?.name ?? '');
    setDescription(e?.description ?? '');
    setDocumentation(e?.documentation ?? '');
  }

  function openCreate() {
    resetElementForm();
    setCreateOpen(true);
  }

  function doCreate() {
    if (!model) return;
    const nm = name.trim();
    if (!nm) return;

    const el = createElement({
      name: nm,
      description: description.trim() || undefined,
      documentation: documentation.trim() || undefined,
      layer,
      type: elementType
    });

    const targetFolderId =
      selection.kind === 'folder' && isFolderWithinElementsTree(model, selection.folderId)
        ? selection.folderId
        : undefined;

    modelStore.addElement(el, targetFolderId);
    onSelect({ kind: 'element', elementId: el.id });
    setCreateOpen(false);
  }

  function openEdit(elementId: string) {
    if (!model) return;
    const el = model.elements[elementId];
    if (!el) return;
    resetElementForm(el);
    setEditId(elementId);
  }

  function doEditSave() {
    if (!editId) return;
    const nm = name.trim();
    if (!nm) return;
    modelStore.updateElement(editId, {
      name: nm,
      description: description.trim() || undefined,
      documentation: documentation.trim() || undefined
    });
    setEditId(null);
  }

  function doDelete(elementId: string) {
    if (!model) return;
    const relCount = Object.values(model.relationships).filter(
      (r) => r.sourceElementId === elementId || r.targetElementId === elementId
    ).length;
    const viewNodeCount = Object.values(model.views)
      .filter((v) => v.layout?.nodes.some((n) => n.elementId === elementId))
      .length;

    if (relCount > 0 || viewNodeCount > 0) {
      const ok = window.confirm(
        `This element is used in ${relCount} relationship(s) and ${viewNodeCount} view(s). Deleting it will also remove related relationships (and view references where possible). Continue?`
      );
      if (!ok) return;
    }
    modelStore.deleteElement(elementId);
    if (selection.kind === 'element' && selection.elementId === elementId) {
      onSelect({ kind: 'model' });
    }
  }

  if (!model) {
    return (
      <div className="crudSection">
        <h2 className="crudTitle">Elements</h2>
        <p className="crudHint">Create or open a model to start adding elements.</p>
      </div>
    );
  }

  return (
    <div className="crudSection">
      <div className="crudHeader">
        <div>
          <h2 className="crudTitle">Elements</h2>
          <p className="crudHint">Define ArchiMate elements in the model (independent of diagrams).</p>
        </div>
      </div>

      <div className="toolbar" aria-label="Element palette">
        <div className="toolbarGroup">
          <label htmlFor="element-layer">Layer</label>
          <select
            id="element-layer"
            className="selectInput"
            value={layer}
            onChange={(e) => {
              const l = e.target.value as ArchimateLayer;
              setLayer(l);
              const first = ELEMENT_TYPES_BY_LAYER[l][0];
              setElementType(first);
            }}
          >
            {ARCHIMATE_LAYERS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbarGroup">
          <label htmlFor="element-type">Element type</label>
          <select
            id="element-type"
            className="selectInput"
            value={elementType}
            onChange={(e) => setElementType(e.target.value as ElementType)}
          >
            {typesForLayer.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="shellButton" onClick={openCreate}>
          Create Element
        </button>
      </div>

      <table className="dataTable" aria-label="Elements list">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Layer</th>
            <th>Folder</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {elementRows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ opacity: 0.8 }}>
                No elements yet. Use the palette above to create one.
              </td>
            </tr>
          ) : (
            elementRows.map((row) => (
              <tr key={row.el.id}>
                <td>
                  <button
                    type="button"
                    className="miniLinkButton"
                    onClick={() => onSelect({ kind: 'element', elementId: row.el.id })}
                    aria-label={`Select element ${row.el.name}`}
                  >
                    {row.el.name}
                  </button>
                </td>
                <td className="mono">{row.el.type}</td>
                <td className="mono">{row.el.layer}</td>
                <td>{row.folderLabel}</td>
                <td>
                  <div className="rowActions">
                    <button
                      type="button"
                      className="miniLinkButton"
                      onClick={() => openEdit(row.el.id)}
                      aria-label={`Edit element ${row.el.name}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="miniLinkButton"
                      onClick={() => doDelete(row.el.id)}
                      aria-label={`Delete element ${row.el.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <Dialog
        title="Create element"
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button type="button" className="shellButton" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button type="button" className="shellButton" onClick={doCreate} disabled={name.trim().length === 0}>
              Create
            </button>
          </>
        }
      >
        <div className="formGrid">
          <div className="formRow">
            <label htmlFor="el-name">Name</label>
            <input
              id="el-name"
              className="textInput"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="formRow">
            <label htmlFor="el-desc">Description</label>
            <textarea id="el-desc" className="textArea" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="formRow">
            <label htmlFor="el-doc">Documentation</label>
            <textarea id="el-doc" className="textArea" value={documentation} onChange={(e) => setDocumentation(e.target.value)} />
          </div>
          <p className="hintText">
            Creating: <span className="mono">{layer}</span> / <span className="mono">{elementType}</span>
          </p>
        </div>
      </Dialog>

      <Dialog
        title="Edit element"
        isOpen={editId !== null}
        onClose={() => setEditId(null)}
        footer={
          <>
            <button type="button" className="shellButton" onClick={() => setEditId(null)}>
              Cancel
            </button>
            <button type="button" className="shellButton" onClick={doEditSave} disabled={name.trim().length === 0}>
              Save
            </button>
          </>
        }
      >
        <div className="formGrid">
          <div className="formRow">
            <label htmlFor="edit-el-name">Name</label>
            <input id="edit-el-name" className="textInput" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="formRow">
            <label htmlFor="edit-el-desc">Description</label>
            <textarea id="edit-el-desc" className="textArea" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="formRow">
            <label htmlFor="edit-el-doc">Documentation</label>
            <textarea id="edit-el-doc" className="textArea" value={documentation} onChange={(e) => setDocumentation(e.target.value)} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
