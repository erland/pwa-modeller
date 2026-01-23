import type { CSSProperties } from 'react';

export type MiniGraphOptions = {
  wrapLabels: boolean;
  autoFitColumns: boolean;
};

export const defaultMiniGraphOptions: MiniGraphOptions = {
  wrapLabels: true,
  autoFitColumns: true
};

type Props = {
  options: MiniGraphOptions;
  onChange: (next: MiniGraphOptions) => void;
  style?: CSSProperties;
  checkboxStyle?: CSSProperties;
};

export function MiniGraphOptionsToggles({ options, onChange, style, checkboxStyle }: Props) {
  const labelStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    opacity: 0.9,
    ...(checkboxStyle ?? {})
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, ...(style ?? {}) }}>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={options.wrapLabels}
          onChange={(e) => onChange({ ...options, wrapLabels: e.currentTarget.checked })}
        />
        Wrap labels
      </label>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={options.autoFitColumns}
          onChange={(e) => onChange({ ...options, autoFitColumns: e.currentTarget.checked })}
        />
        Auto-fit columns
      </label>
    </div>
  );
}
