import { dedupeSort, toggle } from '../utils';

type Props = {
  availableLayers: string[];
  layersSorted: string[];
  onChangeLayers: (layers: string[]) => void;
};

export function LayersFilter({ availableLayers, layersSorted, onChangeLayers }: Props) {
  const layerSetSize = availableLayers.length;

  return (
    <div className="toolbarGroup" style={{ minWidth: 260 }}>
      <label>
        Layers ({layersSorted.length}/{layerSetSize})
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
        {availableLayers.length === 0 ? (
          <p className="crudHint" style={{ margin: 0 }}>
            No ArchiMate layers found in the model.
          </p>
        ) : (
          availableLayers.map((l) => (
            <label
              key={l}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
            >
              <input
                type="checkbox"
                checked={layersSorted.includes(l)}
                onChange={() => onChangeLayers(dedupeSort(toggle(layersSorted, l)) as string[])}
              />
              {String(l)}
            </label>
          ))
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="miniLinkButton"
          onClick={() => onChangeLayers(availableLayers)}
          disabled={availableLayers.length === 0}
        >
          All
        </button>
        <button type="button" className="miniLinkButton" onClick={() => onChangeLayers([])}>
          None
        </button>
      </div>
    </div>
  );
}
