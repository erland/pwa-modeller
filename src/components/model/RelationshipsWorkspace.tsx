import { useEffect, useMemo, useState } from 'react';

import type { Element, RelationshipType } from '../../domain';
import { RELATIONSHIP_TYPES, createRelationship, validateRelationship } from '../../domain';
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

function getElementLabel(el: Element): string {
  return `${el.name} (${el.type})`;
}

export function RelationshipsWorkspace({ selection, onSelect }: Props) {
  const model = useModelStore((s) => s.model);

  const elements = useMemo(() => {
    if (!model) return [];
    return Object.values(model.elements).sort(sortByName);
  }, [model]);

  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [type, setType] = useState<RelationshipType>('Association');
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const typeOptions = useMemo(() => RELATIONSHIP_TYPES, []);


  // Initialize source/target defaults once we have at least 1-2 elements.
  useEffect(() => {
    if (!model) return;
    if (elements.length === 0) {
      setSourceId('');
      setTargetId('');
      return;
    }
    if (!sourceId) setSourceId(elements[0].id);
    if (!targetId) setTargetId((elements[1] ?? elements[0]).id);
  }, [model, elements, sourceId, targetId]);


  const relationships = useMemo(() => {
    if (!model) return [];
    return Object.values(model.relationships).map((r) => {
      return {
        r,
        source: model.elements[r.sourceElementId] ?? null,
        target: model.elements[r.targetElementId] ?? null
      };
    });
  }, [model]);

  function doCreate() {
    if (!model) return;
    setError(null);

    const source = model.elements[sourceId];
    const target = model.elements[targetId];
    if (!source || !target) {
      setError('Select both a source and a target element.');
      return;
    }

    const validation = validateRelationship({
      id: 'tmp',
      type,
      sourceElementId: source.id,
      targetElementId: target.id
    });
    if (!validation.ok) {
      setError(validation.errors[0] ?? 'Invalid relationship');
      return;
    }

    const rel = createRelationship({
      sourceElementId: source.id,
      targetElementId: target.id,
      type
    });
    modelStore.addRelationship(rel);
    onSelect({ kind: 'relationship', relationshipId: rel.id });
  }

  function openEdit(relationshipId: string) {
    if (!model) return;
    const r = model.relationships[relationshipId];
    if (!r) return;
    setName(r.name ?? '');
    setDescription(r.description ?? '');
    setEditId(relationshipId);
  }

  function doEditSave() {
    if (!editId) return;
    modelStore.updateRelationship(editId, {
      name: name.trim() || undefined,
      description: description.trim() || undefined
    });
    setEditId(null);
  }

  function doDelete(relationshipId: string) {
    const ok = window.confirm('Delete this relationship?');
    if (!ok) return;
    modelStore.deleteRelationship(relationshipId);
    if (selection.kind === 'relationship' && selection.relationshipId === relationshipId) {
      onSelect({ kind: 'model' });
    }
  }

  if (!model) {
    return (
      <div className="crudSection">
        <h2 className="crudTitle">Relationships</h2>
        <p className="crudHint">Create or open a model to start adding relationships.</p>
      </div>
    );
  }

  return (
    <div className="crudSection">
      <div className="crudHeader">
        <div>
          <h2 className="crudTitle">Relationships</h2>
          <p className="crudHint">Define relationships between existing elements.</p>
        </div>
      </div>

      <div className="toolbar" aria-label="Relationship palette">
        <div className="toolbarGroup">
          <label htmlFor="rel-source">Source</label>
          <select
            id="rel-source"
            className="selectInput"
            value={sourceId}
            onChange={(e) => {
              const next = e.target.value;
              setSourceId(next);
            }}
          >
            {elements.map((el) => (
              <option key={el.id} value={el.id}>
                {getElementLabel(el)}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbarGroup">
          <label htmlFor="rel-type">Type</label>
          <select
            id="rel-type"
            className="selectInput"
            value={type}
            onChange={(e) => setType(e.target.value as RelationshipType)}
          >
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbarGroup">
          <label htmlFor="rel-target">Target</label>
          <select
            id="rel-target"
            className="selectInput"
            value={targetId}
            onChange={(e) => {
              const next = e.target.value;
              setTargetId(next);
            }}
          >
            {elements.map((el) => (
              <option key={el.id} value={el.id}>
                {getElementLabel(el)}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="shellButton" onClick={doCreate} disabled={elements.length < 2}>
          Create Relationship
        </button>
      </div>

      {error ? <div className="errorText" role="alert">{error}</div> : null}

      <table className="dataTable" aria-label="Relationships list">
        <thead>
          <tr>
            <th>Type</th>
            <th>Source</th>
            <th>Target</th>
            <th>Name</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {relationships.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ opacity: 0.8 }}>
                No relationships yet. Create two elements, then use the palette above.
              </td>
            </tr>
          ) : (
            relationships.map(({ r, source, target }) => (
              <tr key={r.id}>
                <td className="mono">{r.type}</td>
                <td>{source ? source.name : '—'}</td>
                <td>{target ? target.name : '—'}</td>
                <td>{r.name ?? '—'}</td>
                <td>
                  <div className="rowActions">
                    <button
                      type="button"
                      className="miniLinkButton"
                      onClick={() => onSelect({ kind: 'relationship', relationshipId: r.id })}
                      aria-label={`Select relationship ${r.type}`}
                    >
                      Select
                    </button>
                    <button
                      type="button"
                      className="miniLinkButton"
                      onClick={() => openEdit(r.id)}
                      aria-label={`Edit relationship ${r.type}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="miniLinkButton"
                      onClick={() => doDelete(r.id)}
                      aria-label={`Delete relationship ${r.type}`}
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
        title="Edit relationship"
        isOpen={editId !== null}
        onClose={() => setEditId(null)}
        footer={
          <>
            <button type="button" className="shellButton" onClick={() => setEditId(null)}>
              Cancel
            </button>
            <button type="button" className="shellButton" onClick={doEditSave}>
              Save
            </button>
          </>
        }
      >
        <div className="formGrid">
          <div className="formRow">
            <label htmlFor="rel-name">Name</label>
            <input id="rel-name" className="textInput" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="formRow">
            <label htmlFor="rel-desc">Description</label>
            <textarea id="rel-desc" className="textArea" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
