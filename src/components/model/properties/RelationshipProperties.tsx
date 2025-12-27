import type { Model, RelationshipType } from '../../../domain';
import { RELATIONSHIP_TYPES } from '../../../domain';

import type { Selection } from '../selection';
import type { ModelActions } from './actions';

type Props = {
  model: Model;
  relationshipId: string;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

export function RelationshipProperties({ model, relationshipId, actions, onSelect }: Props) {
  const rel = model.relationships[relationshipId];
  if (!rel) return <p className="panelHint">Relationship not found.</p>;

  const elementOptions = Object.values(model.elements)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const sourceName = model.elements[rel.sourceElementId]?.name ?? rel.sourceElementId;
  const targetName = model.elements[rel.targetElementId]?.name ?? rel.targetElementId;

  const usedInViews = Object.values(model.views)
    .filter((v) => v.layout && v.layout.relationships.some((c) => c.relationshipId === rel.id))
    .map((v) => {
      const count = v.layout ? v.layout.relationships.filter((c) => c.relationshipId === rel.id).length : 0;
      return { id: v.id, name: v.name, count };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

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
              onChange={(e) => actions.updateRelationship(rel.id, { type: e.target.value as RelationshipType })}
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
              onChange={(e) => actions.updateRelationship(rel.id, { sourceElementId: e.target.value })}
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
              onChange={(e) => actions.updateRelationship(rel.id, { targetElementId: e.target.value })}
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
              onChange={(e) => actions.updateRelationship(rel.id, { name: e.target.value || undefined })}
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
              onChange={(e) => actions.updateRelationship(rel.id, { description: e.target.value || undefined })}
            />
          </div>
        </div>

        <div className="propertiesRow">
          <div className="propertiesKey">Used in views</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            {usedInViews.length === 0 ? (
              <span style={{ opacity: 0.7 }}>None</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {usedInViews.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="miniButton"
                    aria-label={`Select view ${v.name}`}
                    onClick={() => onSelect?.({ kind: 'view', viewId: v.id })}
                  >
                    {v.name}
                    {v.count > 1 ? ` (${v.count})` : ''}
                  </button>
                ))}
              </div>
            )}
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
            actions.deleteRelationship(rel.id);
          }}
        >
          Delete relationship
        </button>
      </div>
    </div>
  );
}
