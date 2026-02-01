import type { ElementType } from '../../../../domain';
import { getElementTypeLabel } from '../../../../domain';

import { dedupeSort, toggle } from '../utils';

type Props = {
  allowedElementTypes: ElementType[];
  elementTypesSorted: ElementType[];
  onChangeElementTypes: (types: ElementType[]) => void;
};

export function ElementTypesFilter({ allowedElementTypes, elementTypesSorted, onChangeElementTypes }: Props) {
  return (
    <div className="toolbarGroup" style={{ minWidth: 260 }}>
      <label>
        Element types ({elementTypesSorted.length}/{allowedElementTypes.length})
      </label>
      <div
        style={{
          maxHeight: 180,
          overflow: 'auto',
          border: '1px solid var(--border-1)',
          borderRadius: 10,
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.02)'
        }}
      >
        {allowedElementTypes.length === 0 ? (
          <p className="crudHint" style={{ margin: 0 }}>
            No element types found in the selected layer(s).
          </p>
        ) : (
          allowedElementTypes.map((t) => (
            <label
              key={t}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
            >
              <input
                type="checkbox"
                checked={elementTypesSorted.includes(t)}
                onChange={() => onChangeElementTypes(dedupeSort(toggle(elementTypesSorted, t)) as ElementType[])}
              />
              <span className="mono">{getElementTypeLabel(t)}</span>
            </label>
          ))
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="miniLinkButton"
          onClick={() => onChangeElementTypes(allowedElementTypes)}
          disabled={allowedElementTypes.length === 0}
        >
          All
        </button>
        <button type="button" className="miniLinkButton" onClick={() => onChangeElementTypes([])}>
          None
        </button>
      </div>
      <p className="crudHint" style={{ marginTop: 8 }}>
        Options are limited to the selected layer(s) and what exists in the model.
      </p>
    </div>
  );
}
