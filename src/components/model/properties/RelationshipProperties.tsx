import type { AccessType, Model, RelationshipType } from '../../../domain';
import { RELATIONSHIP_TYPES } from '../../../domain';

import type { Selection } from '../selection';
import type { ModelActions } from './actions';
import { TaggedValuesSummary } from './TaggedValuesSummary';
import { ExternalIdsSummary } from './ExternalIdsSummary';

const ACCESS_TYPES: AccessType[] = ['Access', 'Read', 'Write', 'ReadWrite'];

type Props = {
  model: Model;
  relationshipId: string;
  actions: ModelActions;
  onSelect?: (selection: Selection) => void;
};

export function RelationshipProperties({ model, relationshipId, actions, onSelect }: Props) {
  const rel = model.relationships[relationshipId];
  if (!rel) return <p className="panelHint">Relationship not found.</p>;

  const relationshipTypeOptions = rel.type === 'Unknown' ? (['Unknown', ...RELATIONSHIP_TYPES] as any[]) : (RELATIONSHIP_TYPES as any[]);

  const elementOptions = Object.values(model.elements)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const sourceId = rel.sourceElementId ?? rel.sourceConnectorId ?? '';
  const targetId = rel.targetElementId ?? rel.targetConnectorId ?? '';
  const sourceName = (rel.sourceElementId ? model.elements[rel.sourceElementId]?.name : undefined) ?? sourceId;
  const targetName = (rel.targetElementId ? model.elements[rel.targetElementId]?.name : undefined) ?? targetId;

  const elementOptionLabel = (e: any): string => {
    const typeLabel =
      e.type === 'Unknown'
        ? e.unknownType?.name
          ? `Unknown: ${e.unknownType.name}`
          : 'Unknown'
        : e.type;
    return `${e.name} (${typeLabel})`;
  };

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
              {relationshipTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {rel.type === 'Unknown' ? (
          <div className="propertiesRow">
            <div className="propertiesKey">Original type</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <div style={{ opacity: 0.9 }}>
                {rel.unknownType?.ns ? `${rel.unknownType.ns}:` : ''}
                {rel.unknownType?.name ?? 'Unknown'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                Map this relationship to a known type using the Type dropdown.
              </div>
            </div>
          </div>
        ) : null}

        {rel.type === 'Access' && (
          <div className="propertiesRow">
            <div className="propertiesKey">Access type</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Relationship property access type"
                value={rel.attrs?.accessType ?? 'Access'}
                onChange={(e) =>
                  actions.updateRelationship(rel.id, {
                    attrs: { ...(rel.attrs ?? {}), accessType: e.target.value as AccessType }
                  })
                }
              >
                {ACCESS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                Access specifies whether data is read, written, or both.
              </div>
            </div>
          </div>
        )}

        {rel.type === 'Influence' && (
          <div className="propertiesRow">
            <div className="propertiesKey">Strength</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Relationship property influence strength"
                placeholder="e.g. +, ++, -, --, 5"
                value={rel.attrs?.influenceStrength ?? ''}
                onChange={(e) =>
                  actions.updateRelationship(rel.id, {
                    attrs: { ...(rel.attrs ?? {}), influenceStrength: e.target.value || undefined }
                  })
                }
              />
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                Optional: use a sign or scale that matches your organization.
              </div>
            </div>
          </div>
        )}

        {rel.type === 'Association' && (
          <div className="propertiesRow">
            <div className="propertiesKey">Directed</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  aria-label="Relationship property association directed"
                  checked={!!rel.attrs?.isDirected}
                  onChange={(e) =>
                    actions.updateRelationship(rel.id, {
                      attrs: { ...(rel.attrs ?? {}), isDirected: e.target.checked ? true : undefined }
                    })
                  }
                />
                Directed association
              </label>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                When enabled, the association is shown as an arrow from source to target.
              </div>
            </div>
          </div>
        )}

        <div className="propertiesRow">
          <div className="propertiesKey">From</div>
          <div className="propertiesValue" style={{ fontWeight: 400 }}>
            <select
              className="selectInput"
              aria-label="Relationship property source"
              value={rel.sourceElementId ?? ''}
              onChange={(e) => actions.updateRelationship(rel.id, { sourceElementId: e.target.value })}
            >
              {elementOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {elementOptionLabel(e)}
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
              value={rel.targetElementId ?? ''}
              onChange={(e) => actions.updateRelationship(rel.id, { targetElementId: e.target.value })}
            >
              {elementOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {elementOptionLabel(e)}
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

      <ExternalIdsSummary externalIds={rel.externalIds} />

      <TaggedValuesSummary
        taggedValues={rel.taggedValues}
        onChange={(next) => actions.updateRelationship(rel.id, { taggedValues: next })}
        dialogTitle={`Relationship tagged values — ${rel.name || rel.id}`}
      />

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
