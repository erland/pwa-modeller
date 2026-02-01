type Props = {
  onApplyPreset: (presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') => void;
};

export function FilterPresets({ onApplyPreset }: Props) {
  return (
    <div className="toolbarGroup" style={{ minWidth: 220 }}>
      <label>Presets</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="miniLinkButton" onClick={() => onApplyPreset('upstream')}>
          Upstream
        </button>
        <button type="button" className="miniLinkButton" onClick={() => onApplyPreset('downstream')}>
          Downstream
        </button>
        <button type="button" className="miniLinkButton" onClick={() => onApplyPreset('crossLayerTrace')}>
          Business→App→Tech
        </button>
        <button type="button" className="miniLinkButton" onClick={() => onApplyPreset('clear')}>
          Clear
        </button>
      </div>
      <p className="crudHint" style={{ marginTop: 8 }}>
        Presets set filters; use “Run analysis” to refresh element selection if needed.
      </p>
    </div>
  );
}
