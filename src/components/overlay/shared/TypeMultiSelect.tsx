import { useMemo, useState } from 'react';

type TypeMultiSelectProps = {
  label: string;
  allTypes: string[];
  selectedTypes: string[]; // empty means all
  onChange: (next: string[]) => void;
  filterPlaceholder?: string;
  maxHeight?: number;
};

export function TypeMultiSelect(props: TypeMultiSelectProps) {
  const { label, allTypes, selectedTypes, onChange, filterPlaceholder, maxHeight } = props;

  const [filterText, setFilterText] = useState('');

  const typesShown = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return allTypes;
    return allTypes.filter((t) => t.toLowerCase().includes(q));
  }, [allTypes, filterText]);

  const isSelected = (t: string) => selectedTypes.length === 0 || selectedTypes.includes(t);

  const toggleSelection = (t: string) => {
    const currentlyAll = selectedTypes.length === 0;
    const currentlySelected = currentlyAll ? true : selectedTypes.includes(t);

    if (currentlyAll) {
      // turning one off moves into explicit subset
      if (currentlySelected) {
        const next = allTypes.filter((x) => x !== t);
        onChange(next.length === allTypes.length ? [] : next);
      } else {
        onChange([]); // should not happen
      }
      return;
    }

    const next = currentlySelected ? selectedTypes.filter((x) => x !== t) : [...selectedTypes, t];
    const nextNorm = [...new Set(next)].sort();
    // if user ended up selecting everything, store as "all" (empty)
    if (nextNorm.length === allTypes.length) onChange([]);
    else onChange(nextNorm);
  };

  return (
    <div className="crudFormRow">
      <label className="crudLabel">{label}</label>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <input
            type="text"
            className="crudTextInput"
            value={filterText}
            onChange={(e) => setFilterText(e.currentTarget.value)}
            placeholder={filterPlaceholder || `Filter ${label.toLowerCase()}…`}
            style={{ width: 260 }}
          />
          <button type="button" className="shellButton" onClick={() => onChange([])}>
            All
          </button>
          <span className="hintText" style={{ margin: 0 }}>
            {selectedTypes.length === 0 ? `All (${allTypes.length})` : `${selectedTypes.length} of ${allTypes.length}`}
          </span>
        </div>

        <div
          style={{
            maxHeight: maxHeight ?? 160,
            overflow: 'auto',
            border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: 8,
            padding: 8
          }}
        >
          {typesShown.length === 0 ? (
            <div className="hintText">No types match the filter.</div>
          ) : (
            typesShown.map((t) => (
              <label key={t} className="crudInlineLabel" style={{ display: 'block', marginBottom: 4 }}>
                <input type="checkbox" checked={isSelected(t)} onChange={() => toggleSelection(t)} /> {t}
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
