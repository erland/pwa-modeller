import { useMemo, useState } from 'react';

type TypeMultiSelectProps = {
  label: string;
  allTypes: string[];
  selectedTypes?: string[]; // undefined means all; [] means none
  onChange: (next: string[] | undefined) => void;
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

  const isSelected = (t: string) => selectedTypes === undefined || selectedTypes.includes(t);

  const toggleSelection = (t: string) => {
    const currentlyAll = selectedTypes === undefined;
    const currentlySelected = currentlyAll ? true : selectedTypes.includes(t);

    if (currentlyAll) {
      // Turning one off moves into an explicit subset (everything except that type).
      if (currentlySelected) {
        const next = allTypes.filter((x) => x !== t);
        // If all types are selected, keep as undefined ("all").
        onChange(next.length === allTypes.length ? undefined : next);
      } else {
        onChange(undefined); // should not happen
      }
      return;
    }

    const next = currentlySelected ? selectedTypes.filter((x) => x !== t) : [...selectedTypes, t];
    const nextNorm = [...new Set(next)].sort();
    // If user ended up selecting everything, store as "all" (undefined).
    if (nextNorm.length === allTypes.length) onChange(undefined);
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
          <button type="button" className="shellButton" onClick={() => onChange(undefined)}>
            All
          </button>
          <button type="button" className="shellButton" onClick={() => onChange([])}>
            None
          </button>
          <span className="hintText" style={{ margin: 0 }}>
            {selectedTypes === undefined ? `All (${allTypes.length})` : `${selectedTypes.length} of ${allTypes.length}`}
          </span>
        </div>

        <div
          style={{
            // Default height is generous. The list itself is a responsive grid so it
            // will use multiple columns on wide screens, reducing the need for scrolling.
            maxHeight: maxHeight ?? 240,
            overflow: 'auto',
            border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: 8,
            padding: 8
          }}
        >
          {typesShown.length === 0 ? (
            <div className="hintText">No types match the filter.</div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                columnGap: 14,
                rowGap: 4
              }}
            >
              {typesShown.map((t) => (
                <label key={t} className="crudInlineLabel" style={{ display: 'block' }}>
                  <input type="checkbox" checked={isSelected(t)} onChange={() => toggleSelection(t)} /> {t}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}