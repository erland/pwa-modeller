import type { ExportOptions } from '../../../export';

export function ExportOptionsPanel({
  value,
  onChange,
}: {
  value: ExportOptions;
  onChange: (next: ExportOptions) => void;
}) {
  const set = (patch: Partial<ExportOptions>) => onChange({ ...value, ...patch });
  const setPptx = (patch: Partial<ExportOptions['pptx']>) => set({ pptx: { ...value.pptx, ...patch } });
  const setXlsx = (patch: Partial<ExportOptions['xlsx']>) => set({ xlsx: { ...value.xlsx, ...patch } });

  return (
    <div className="crudForm" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="crudLabel" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Target
          <select
            value={value.target}
            onChange={(e) => set({ target: e.target.value as ExportOptions['target'] })}
          >
            <option value="clipboard">Clipboard</option>
            <option value="download">Download</option>
          </select>
        </label>

        <label className="crudLabel" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Include charts (v2)
          <input type="checkbox" checked={false} disabled />
        </label>
      </div>

      <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
        <legend style={{ padding: '0 6px' }}>PPTX</legend>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="crudLabel" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Layout
            <select
              value={value.pptx.layout}
              onChange={(e) => setPptx({ layout: e.target.value as ExportOptions['pptx']['layout'] })}
            >
              <option value="wide">Wide (16:9)</option>
              <option value="standard">Standard (4:3)</option>
            </select>
          </label>

          <label className="crudLabel" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Theme
            <select
              value={value.pptx.theme}
              onChange={(e) => setPptx({ theme: e.target.value as ExportOptions['pptx']['theme'] })}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          <label className="crudLabel" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={value.pptx.includeTitleSlide}
              onChange={(e) => setPptx({ includeTitleSlide: e.target.checked })}
            />
            Title slide
          </label>

          <label className="crudLabel" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={value.pptx.includeNotes}
              onChange={(e) => setPptx({ includeNotes: e.target.checked })}
            />
            Notes
          </label>
        </div>

        <div style={{ marginTop: 8 }}>
          <label className="crudLabel" style={{ display: 'grid', gap: 6 }}>
            Footer text
            <input
              type="text"
              value={value.pptx.footerText ?? ''}
              onChange={(e) => setPptx({ footerText: e.target.value })}
              placeholder="Optional"
            />
          </label>
        </div>
      </fieldset>

      <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
        <legend style={{ padding: '0 6px' }}>XLSX</legend>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="crudLabel" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={value.xlsx.includeRawData}
              onChange={(e) => setXlsx({ includeRawData: e.target.checked })}
            />
            Raw data
          </label>

          <label className="crudLabel" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={value.xlsx.includeSummary}
              onChange={(e) => setXlsx({ includeSummary: e.target.checked })}
            />
            Summary
          </label>
        </div>

        <div style={{ marginTop: 8 }}>
          <label className="crudLabel" style={{ display: 'grid', gap: 6 }}>
            Sheet name
            <input
              type="text"
              value={value.xlsx.sheetName ?? ''}
              onChange={(e) => setXlsx({ sheetName: e.target.value })}
              placeholder="e.g. Matrix"
            />
          </label>
          <div className="crudHint" style={{ marginTop: 6 }}>
            Excel sheet names are limited to 31 characters.
          </div>
        </div>
      </fieldset>
    </div>
  );
}
