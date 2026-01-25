import type { CSSProperties } from 'react';

import type { NodeMetricId } from '../../domain';

export type MiniGraphOptions = {
  wrapLabels: boolean;
  autoFitColumns: boolean;
  nodeOverlayMetricId: 'off' | NodeMetricId;
  /** Used when nodeOverlayMetricId === 'nodeReach'. */
  nodeOverlayReachDepth: 2 | 3 | 4;
  /** If true, scale node size based on the active overlay metric value. */
  scaleNodesByOverlayScore: boolean;
};

export const defaultMiniGraphOptions: MiniGraphOptions = {
  wrapLabels: true,
  autoFitColumns: true,
  nodeOverlayMetricId: 'off',
  nodeOverlayReachDepth: 3,
  scaleNodesByOverlayScore: false
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

      <label style={labelStyle}>
        Overlay
        <select
          aria-label="Node overlay"
          value={
            options.nodeOverlayMetricId === 'nodeReach'
              ? (`nodeReach:${options.nodeOverlayReachDepth}` as const)
              : options.nodeOverlayMetricId
          }
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (v === 'off' || v === 'nodeDegree') {
              onChange({ ...options, nodeOverlayMetricId: v });
              return;
            }
            if (v.startsWith('nodeReach:')) {
              const depth = Number(v.split(':')[1]) as 2 | 3 | 4;
              onChange({ ...options, nodeOverlayMetricId: 'nodeReach', nodeOverlayReachDepth: depth });
              return;
            }
            // Fallback: treat unknown values as off.
            onChange({ ...options, nodeOverlayMetricId: 'off' });
          }}
          style={{ fontSize: 12 }}
        >
          <option value="off">Off</option>
          <option value="nodeDegree">Degree</option>
          <option value="nodeReach:2">Reach (2)</option>
          <option value="nodeReach:3">Reach (3)</option>
          <option value="nodeReach:4">Reach (4)</option>
        </select>
      </label>

      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={options.scaleNodesByOverlayScore}
          disabled={options.nodeOverlayMetricId === 'off'}
          onChange={(e) => onChange({ ...options, scaleNodesByOverlayScore: e.currentTarget.checked })}
        />
        Size by score
      </label>
    </div>
  );
}
