import type { CSSProperties } from 'react';

import type { NodeMetricId } from '../../domain';

export type MiniGraphOptions = {
  wrapLabels: boolean;
  autoFitColumns: boolean;
  nodeOverlayMetricId: 'off' | NodeMetricId;
  /** Used when nodeOverlayMetricId === 'nodeReach'. */
  nodeOverlayReachDepth: 2 | 3 | 4;
  /** Used when nodeOverlayMetricId === 'nodePropertyNumber'. */
  nodeOverlayPropertyKey: string;
  /** If true, scale node size based on the active overlay metric value. */
  scaleNodesByOverlayScore: boolean;
};

export const defaultMiniGraphOptions: MiniGraphOptions = {
  wrapLabels: true,
  autoFitColumns: true,
  nodeOverlayMetricId: 'off',
  nodeOverlayReachDepth: 3,
  nodeOverlayPropertyKey: '',
  scaleNodesByOverlayScore: false
};

type Props = {
  options: MiniGraphOptions;
  onChange: (next: MiniGraphOptions) => void;
  /** Optional list of discovered numeric property keys for autocomplete. */
  availablePropertyKeys?: string[];
  style?: CSSProperties;
  checkboxStyle?: CSSProperties;
};

export function MiniGraphOptionsToggles({ options, onChange, availablePropertyKeys, style, checkboxStyle }: Props) {
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
        Preset
        <select
          aria-label="Overlay preset"
          value={(() => {
            if (options.nodeOverlayMetricId === 'off') return 'off';
            if (
              options.nodeOverlayMetricId === 'nodeDegree' &&
              !options.scaleNodesByOverlayScore
            ) {
              return 'degree';
            }
            if (
              options.nodeOverlayMetricId === 'nodeReach' &&
              options.nodeOverlayReachDepth === 3 &&
              !options.scaleNodesByOverlayScore
            ) {
              return 'reach3';
            }
            if (
              options.nodeOverlayMetricId === 'nodePropertyNumber' &&
              options.nodeOverlayPropertyKey.trim() === 'risk' &&
              !options.scaleNodesByOverlayScore
            ) {
              return 'risk';
            }
            return 'custom';
          })()}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (v === 'off') {
              onChange({
                ...options,
                nodeOverlayMetricId: 'off',
                nodeOverlayPropertyKey: '',
                scaleNodesByOverlayScore: false
              });
              return;
            }
            if (v === 'degree') {
              onChange({
                ...options,
                nodeOverlayMetricId: 'nodeDegree',
                nodeOverlayPropertyKey: '',
                scaleNodesByOverlayScore: false
              });
              return;
            }
            if (v === 'reach3') {
              onChange({
                ...options,
                nodeOverlayMetricId: 'nodeReach',
                nodeOverlayReachDepth: 3,
                nodeOverlayPropertyKey: '',
                scaleNodesByOverlayScore: false
              });
              return;
            }
            if (v === 'risk') {
              onChange({
                ...options,
                nodeOverlayMetricId: 'nodePropertyNumber',
                nodeOverlayPropertyKey: 'risk',
                scaleNodesByOverlayScore: false
              });
              return;
            }
            // custom: noop
          }}
          style={{ fontSize: 12 }}
          title="Quick overlay presets"
        >
          <option value="off">Off</option>
          <option value="degree">Degree</option>
          <option value="reach3">Reach (3)</option>
          <option value="risk">Property: risk</option>
          <option value="custom">Custom</option>
        </select>
      </label>

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
            if (v === 'off' || v === 'nodeDegree' || v === 'nodePropertyNumber') {
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
          <option value="nodePropertyNumber">Property…</option>
        </select>

        {options.nodeOverlayMetricId === 'nodePropertyNumber' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              aria-label="Overlay property key"
              type="text"
              value={options.nodeOverlayPropertyKey}
              onChange={(e) => onChange({ ...options, nodeOverlayPropertyKey: e.currentTarget.value })}
              placeholder="e.g. risk or ns:key"
              list="analysisOverlayPropertyKeys"
              style={{ fontSize: 12, width: 140 }}
            />
            {availablePropertyKeys && availablePropertyKeys.length ? (
              <datalist id="analysisOverlayPropertyKeys">
                {availablePropertyKeys.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            ) : null}
          </span>
        ) : null}

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
