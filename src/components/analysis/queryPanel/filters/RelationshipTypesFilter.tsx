import type { RelationshipType } from '../../../../domain';
import { getRelationshipTypeLabel } from '../../../../domain';

import { dedupeSort, toggle } from '../utils';

type Props = {
  availableRelationshipTypes: RelationshipType[];
  relationshipTypesSorted: RelationshipType[];
  onChangeRelationshipTypes: (types: RelationshipType[]) => void;
};

export function RelationshipTypesFilter({
  availableRelationshipTypes,
  relationshipTypesSorted,
  onChangeRelationshipTypes
}: Props) {
  const relationshipTypeSetSize = availableRelationshipTypes.length;

  return (
    <div className="toolbarGroup" style={{ minWidth: 260 }}>
      <label>
        Relationship types ({relationshipTypesSorted.length}/{relationshipTypeSetSize})
      </label>
      <div
        style={{
          maxHeight: 140,
          overflow: 'auto',
          border: '1px solid var(--border-1)',
          borderRadius: 10,
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.02)'
        }}
      >
        {availableRelationshipTypes.length === 0 ? (
          <p className="crudHint" style={{ margin: 0 }}>
            No relationships in the model.
          </p>
        ) : (
          availableRelationshipTypes.map((t) => (
            <label
              key={t}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                opacity: 0.9,
                marginBottom: 6
              }}
            >
              <input
                type="checkbox"
                checked={relationshipTypesSorted.includes(t)}
                onChange={() =>
                  onChangeRelationshipTypes(dedupeSort(toggle(relationshipTypesSorted, t)) as RelationshipType[])
                }
              />
              <span title={String(t)}>{getRelationshipTypeLabel(t)}</span>
            </label>
          ))
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="miniLinkButton"
          onClick={() => onChangeRelationshipTypes(availableRelationshipTypes.filter((t) => t !== 'Unknown'))}
          disabled={availableRelationshipTypes.length === 0}
        >
          All
        </button>
        <button type="button" className="miniLinkButton" onClick={() => onChangeRelationshipTypes([])}>
          None
        </button>
      </div>
    </div>
  );
}