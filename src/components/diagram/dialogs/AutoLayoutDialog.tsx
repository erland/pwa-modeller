import { useEffect, useMemo, useState } from 'react';

import type { AutoLayoutOptions, EdgeRoutingStyle, LayoutDirection, View } from '../../../domain';

import { Dialog } from '../../dialog/Dialog';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialOptions: AutoLayoutOptions;
  onRun: (options: AutoLayoutOptions) => void;

  /** Optional: used for showing notation-specific presets and hints. */
  viewKind?: View['kind'] | null;
  /** Optional: enables "keep selected fixed" UX affordance. */
  hasSelection?: boolean;
};

const SPACING_PRESETS: Array<{ label: string; value: number }> = [
  { label: 'Compact', value: 60 },
  { label: 'Normal', value: 80 },
  { label: 'Spacious', value: 120 },
];

export function AutoLayoutDialog({ isOpen, onClose, initialOptions, onRun, viewKind, hasSelection = false }: Props) {
  const [direction, setDirection] = useState<LayoutDirection>('RIGHT');
  const [spacing, setSpacing] = useState<number>(80);
  const [edgeRouting, setEdgeRouting] = useState<EdgeRoutingStyle>('POLYLINE');
  const [scope, setScope] = useState<'all' | 'selection'>('all');
  const [respectLocked, setRespectLocked] = useState<boolean>(true);
  const [lockSelection, setLockSelection] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setDirection(initialOptions.direction ?? 'RIGHT');
    setSpacing(initialOptions.spacing ?? 80);
    setEdgeRouting(initialOptions.edgeRouting ?? 'POLYLINE');
    setScope(initialOptions.scope ?? 'all');
    setRespectLocked(initialOptions.respectLocked ?? true);
    setLockSelection(initialOptions.lockSelection ?? false);
  }, [isOpen, initialOptions.direction, initialOptions.edgeRouting, initialOptions.respectLocked, initialOptions.scope, initialOptions.spacing, initialOptions.lockSelection]);

  const presets = useMemo(() => {
    if (viewKind === 'bpmn') {
      return [
        { label: 'Flow L→R', apply: { direction: 'RIGHT' as LayoutDirection, edgeRouting: 'ORTHOGONAL' as EdgeRoutingStyle, spacing: 100 } },
        { label: 'Flow T→B', apply: { direction: 'DOWN' as LayoutDirection, edgeRouting: 'ORTHOGONAL' as EdgeRoutingStyle, spacing: 100 } },
      ];
    }
    if (viewKind === 'uml') {
      return [
        { label: 'Compact', apply: { spacing: 60 } },
        { label: 'Spaced', apply: { spacing: 120 } },
        { label: 'Hierarchy', apply: { direction: 'DOWN' as LayoutDirection, edgeRouting: 'ORTHOGONAL' as EdgeRoutingStyle, spacing: 120 } },
      ];
    }
    // ArchiMate (and generic): keep it simple.
    return [
      { label: 'Default', apply: { direction: 'RIGHT' as LayoutDirection, edgeRouting: 'POLYLINE' as EdgeRoutingStyle, spacing: 80 } },
      { label: 'Compact', apply: { spacing: 60 } },
      { label: 'Spaced', apply: { spacing: 120 } },
    ];
  }, [viewKind]);

  const spacingPreset = useMemo(() => {
    const hit = SPACING_PRESETS.find((p) => p.value === spacing);
    return hit?.value ?? 0;
  }, [spacing]);

  return (
    <Dialog
      title="Auto layout"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="shellButton" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              const opts: AutoLayoutOptions = {
                direction,
                spacing,
                edgeRouting,
                scope,
                respectLocked,
                lockSelection,
              };
              onRun(opts);
            }}
          >
            Run
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="hintText" style={{ margin: 0 }}>
          Arranges nodes using a layered layout. Locked nodes can be kept fixed.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} aria-label="Auto layout presets">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className="miniLinkButton"
              onClick={() => {
                if (p.apply.direction) setDirection(p.apply.direction);
                if (p.apply.edgeRouting) setEdgeRouting(p.apply.edgeRouting);
                if (typeof p.apply.spacing === 'number') setSpacing(p.apply.spacing);
              }}
              title="Apply preset"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'center' }}>
          <label htmlFor="auto-layout-scope">Scope</label>
          <select
            id="auto-layout-scope"
            className="selectInput"
            data-autofocus="true"
            value={scope}
            onChange={(e) => setScope(e.target.value as 'all' | 'selection')}
            title="Layout scope"
          >
            <option value="all">All nodes in view</option>
            <option value="selection">Selected nodes</option>
          </select>

          <label htmlFor="auto-layout-direction">Direction</label>
          <select
            id="auto-layout-direction"
            className="selectInput"
            value={direction}
            onChange={(e) => setDirection(e.target.value as LayoutDirection)}
            title="Layout direction"
          >
            <option value="RIGHT">Left to right</option>
            <option value="DOWN">Top to bottom</option>
          </select>

          <label htmlFor="auto-layout-edge-routing">Edge routing</label>
          <select
            id="auto-layout-edge-routing"
            className="selectInput"
            value={edgeRouting}
            onChange={(e) => setEdgeRouting(e.target.value as EdgeRoutingStyle)}
            title="Preferred edge routing"
          >
            <option value="POLYLINE">Polyline</option>
            <option value="ORTHOGONAL">Orthogonal</option>
          </select>

          <label htmlFor="auto-layout-spacing">Spacing</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select
              id="auto-layout-spacing"
              className="selectInput"
              value={spacingPreset}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v <= 0) return;
                setSpacing(v);
              }}
              title="Spacing preset"
            >
              {SPACING_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              <option value={0}>Custom</option>
            </select>
            <input
              type="number"
              className="textInput"
              value={spacing}
              min={0}
              step={10}
              onChange={(e) => setSpacing(Number(e.target.value))}
              title="Spacing in pixels"
              style={{ width: 100 }}
            />
          </div>

          <label htmlFor="auto-layout-respect-locked">Locked nodes</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              id="auto-layout-respect-locked"
              type="checkbox"
              checked={respectLocked}
              onChange={(e) => setRespectLocked(e.target.checked)}
            />
            Keep locked nodes fixed
          </label>

          <label htmlFor="auto-layout-lock-selection">Selection</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: hasSelection ? 1 : 0.6 }}>
            <input
              id="auto-layout-lock-selection"
              type="checkbox"
              checked={lockSelection}
              disabled={!hasSelection}
              onChange={(e) => setLockSelection(e.target.checked)}
            />
            Keep selected nodes fixed
          </label>
        </div>
      </div>
    </Dialog>
  );
}
