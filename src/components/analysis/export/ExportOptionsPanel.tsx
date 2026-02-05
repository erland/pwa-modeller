import type { CSSProperties } from 'react';

import type {
  ExportOptions,
  ExportTarget,
  PptxLayoutPreset,
  PptxTheme,
} from '../../../export/contracts/ExportOptions';

type Props = {
  options: ExportOptions;
  onChange: (next: ExportOptions) => void;
  style?: CSSProperties;
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '160px 1fr',
  gap: 8,
  alignItems: 'center',
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  opacity: 0.85,
};

const inputStyle: CSSProperties = {
  fontSize: 12,
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid var(--border-1)',
  background: 'var(--surface-1)',
  color: 'var(--text-1)',
};

const checkboxLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  opacity: 0.92,
};

const toBool = (v: unknown): boolean => Boolean(v);

export function ExportOptionsPanel({ options, onChange, style }: Props) {
  const setTarget = (target: ExportTarget): void => {
    onChange({ ...options, target });
  };

  const setPptx = (patch: Partial<ExportOptions['pptx']>): void => {
    onChange({ ...options, pptx: { ...options.pptx, ...patch } });
  };

  const setXlsx = (patch: Partial<ExportOptions['xlsx']>): void => {
    onChange({ ...options, xlsx: { ...options.xlsx, ...patch } });
  };

  return (
    <div style={{ display: 'grid', gap: 10, ...(style ?? {}) }}>
      <div style={rowStyle}>
        <div style={labelStyle}>Target</div>
        <select
          aria-label="Export target"
          value={options.target}
          onChange={(e) => setTarget(e.currentTarget.value as ExportTarget)}
          style={{ ...inputStyle, padding: '6px 6px' }}
        >
          <option value="clipboard">Clipboard</option>
          <option value="pptx">PowerPoint (PPTX)</option>
          <option value="xlsx">Excel (XLSX)</option>
          <option value="both">PPTX + XLSX</option>
        </select>
      </div>

      <div className="crudHint" style={{ margin: 0 }}>
        These settings only affect export output. No export actions are enabled yet (Steps 5–10).
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 750, fontSize: 12, opacity: 0.9 }}>PowerPoint (PPTX)</div>

        <div style={rowStyle}>
          <div style={labelStyle}>Layout</div>
          <select
            aria-label="PPTX layout"
            value={options.pptx.layout}
            onChange={(e) => setPptx({ layout: e.currentTarget.value as PptxLayoutPreset })}
            style={{ ...inputStyle, padding: '6px 6px' }}
          >
            <option value="chart">Chart</option>
            <option value="chart+bullets">Chart + bullets</option>
            <option value="table">Table</option>
            <option value="dashboard">Dashboard</option>
          </select>
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>Theme</div>
          <select
            aria-label="PPTX theme"
            value={options.pptx.theme}
            onChange={(e) => setPptx({ theme: e.currentTarget.value as PptxTheme })}
            style={{ ...inputStyle, padding: '6px 6px' }}
          >
            <option value="light">Light</option>
            <option value="brand">Brand</option>
          </select>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={toBool(options.pptx.includeLegend)}
              onChange={(e) => setPptx({ includeLegend: e.currentTarget.checked })}
            />
            Include legend
          </label>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={toBool(options.pptx.includeFilters)}
              onChange={(e) => setPptx({ includeFilters: e.currentTarget.checked })}
            />
            Include filters / scope
          </label>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={toBool(options.pptx.includeMethodNote)}
              onChange={(e) => setPptx({ includeMethodNote: e.currentTarget.checked })}
            />
            Include method note
          </label>
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>Footer</div>
          <input
            aria-label="PPTX footer text"
            type="text"
            value={options.pptx.footerText ?? ''}
            onChange={(e) => setPptx({ footerText: e.currentTarget.value.trim() ? e.currentTarget.value : undefined })}
            placeholder="Optional"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
        <div style={{ fontWeight: 750, fontSize: 12, opacity: 0.9 }}>Excel (XLSX)</div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={toBool(options.xlsx.includeData)}
              onChange={(e) => setXlsx({ includeData: e.currentTarget.checked })}
            />
            Include data sheets
          </label>
          <label style={{ ...checkboxLabelStyle, opacity: 0.65 }}>
            <input
              type="checkbox"
              checked={toBool(options.xlsx.includeCharts)}
              onChange={(e) => setXlsx({ includeCharts: e.currentTarget.checked })}
              disabled
            />
            Include charts (v2)
          </label>
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>Sheet name</div>
          <input
            aria-label="XLSX sheet name"
            type="text"
            value={options.xlsx.sheetName ?? ''}
            onChange={(e) => setXlsx({ sheetName: e.currentTarget.value.trim() ? e.currentTarget.value : undefined })}
            placeholder="Default"
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  );
}
