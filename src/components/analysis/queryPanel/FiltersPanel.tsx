import type { AnalysisDirection, ElementType, RelationshipType } from '../../../domain';
import { getElementTypeLabel, getRelationshipTypeLabel } from '../../../domain';

import type { AnalysisMode } from '../AnalysisQueryPanel';

import { dedupeSort, toggle } from './utils';

type Props = {
  mode: AnalysisMode;

  direction: AnalysisDirection;
  onChangeDirection: (dir: AnalysisDirection) => void;

  // Related-only
  maxDepth: number;
  onChangeMaxDepth: (n: number) => void;
  includeStart: boolean;
  onChangeIncludeStart: (v: boolean) => void;

  // Paths-only
  maxPaths: number;
  onChangeMaxPaths: (n: number) => void;
  maxPathLength: number | null;
  onChangeMaxPathLength: (n: number | null) => void;

  // Relationship types
  availableRelationshipTypes: RelationshipType[];
  relationshipTypesSorted: RelationshipType[];
  onChangeRelationshipTypes: (types: RelationshipType[]) => void;

  // Layers
  hasLayerFacet: boolean;
  availableLayers: string[];
  layersSorted: string[];
  onChangeLayers: (layers: string[]) => void;

  // Element types
  hasElementTypeFacet: boolean;
  allowedElementTypes: ElementType[];
  elementTypesSorted: ElementType[];
  onChangeElementTypes: (types: ElementType[]) => void;

  onApplyPreset: (presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') => void;
  hasAnyFilters: boolean;
};

export function FiltersPanel({
  mode,
  direction,
  onChangeDirection,
  maxDepth,
  onChangeMaxDepth,
  includeStart,
  onChangeIncludeStart,
  maxPaths,
  onChangeMaxPaths,
  maxPathLength,
  onChangeMaxPathLength,
  availableRelationshipTypes,
  relationshipTypesSorted,
  onChangeRelationshipTypes,
  hasLayerFacet,
  availableLayers,
  layersSorted,
  onChangeLayers,
  hasElementTypeFacet,
  allowedElementTypes,
  elementTypesSorted,
  onChangeElementTypes,
  onApplyPreset,
  hasAnyFilters
}: Props) {
  const relationshipTypeSetSize = availableRelationshipTypes.length;
  const layerSetSize = availableLayers.length;

  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.9 }}>
        Filters & presets{hasAnyFilters ? ' (active)' : ''}
      </summary>

      <div className="toolbar" style={{ marginTop: 10 }} aria-label="Analysis filters">
        <div className="toolbarGroup">
          <label htmlFor="analysis-direction">Direction</label>
          <select
            id="analysis-direction"
            className="selectInput"
            value={direction}
            onChange={(e) => onChangeDirection(e.currentTarget.value as AnalysisDirection)}
          >
            <option value="both">Both</option>
            <option value="outgoing">Downstream (outgoing)</option>
            <option value="incoming">Upstream (incoming)</option>
          </select>
        </div>

        {mode === 'paths' ? (
          <>
            <div className="toolbarGroup">
              <label htmlFor="analysis-maxPaths">Max paths</label>
              <select
                id="analysis-maxPaths"
                className="selectInput"
                value={String(maxPaths)}
                onChange={(e) => onChangeMaxPaths(Number(e.currentTarget.value))}
              >
                {[1, 2, 3, 5, 10, 15, 20, 30, 50].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className="toolbarGroup">
              <label htmlFor="analysis-maxPathLength">Max path length</label>
              <select
                id="analysis-maxPathLength"
                className="selectInput"
                value={maxPathLength === null ? '' : String(maxPathLength)}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  onChangeMaxPathLength(v ? Number(v) : null);
                }}
              >
                <option value="">Auto (shortest only)</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div className="toolbarGroup">
              <label htmlFor="analysis-maxDepth">{mode === 'traceability' ? 'Expand depth' : 'Max depth'}</label>
              <select
                id="analysis-maxDepth"
                className="selectInput"
                value={String(maxDepth)}
                onChange={(e) => onChangeMaxDepth(Number(e.currentTarget.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
              {mode === 'related' ? (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.85 }}>
                  <input
                    type="checkbox"
                    checked={includeStart}
                    onChange={(e) => onChangeIncludeStart(e.currentTarget.checked)}
                  />
                  Include start element
                </label>
              ) : null}
            </div>
          </>
        )}

        <div className="toolbarGroup" style={{ minWidth: 260 }}>
          <label>
            Relationship types ({relationshipTypesSorted.length}/{relationshipTypeSetSize})
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
            {availableRelationshipTypes.length === 0 ? (
              <p className="crudHint" style={{ margin: 0 }}>
                No relationships in the model.
              </p>
            ) : (
              availableRelationshipTypes.map((t) => (
                <label
                  key={t}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
                >
                  <input
                    type="checkbox"
                    checked={relationshipTypesSorted.includes(t)}
                    onChange={() =>
                      onChangeRelationshipTypes(
                        dedupeSort(toggle(relationshipTypesSorted, t)) as RelationshipType[]
                      )
                    }
                  />
                  <span title={String(t)}>{getRelationshipTypeLabel(t)}</span>
                </label>
              ))
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="miniLinkButton"
              onClick={() => onChangeRelationshipTypes(availableRelationshipTypes.filter((t) => t !== 'Unknown'))}
              disabled={availableRelationshipTypes.length === 0}
            >
              All
            </button>
            <button type="button" className="miniLinkButton" onClick={() => onChangeRelationshipTypes([])}>
              None
            </button>
          </div>
        </div>

        {hasLayerFacet ? (
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
        ) : null}

        {mode === 'related' && hasElementTypeFacet && layersSorted.length > 0 ? (
          <div className="toolbarGroup" style={{ minWidth: 260 }}>
            <label>
              Element types ({elementTypesSorted.length}/{allowedElementTypes.length})
            </label>
            <div
              style={{
                maxHeight: 180,
                overflow: 'auto',
                border: '1px solid var(--border-1)',
                borderRadius: 10,
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.02)'
              }}
            >
              {allowedElementTypes.length === 0 ? (
                <p className="crudHint" style={{ margin: 0 }}>
                  No element types found in the selected layer(s).
                </p>
              ) : (
                allowedElementTypes.map((t) => (
                  <label
                    key={t}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
                  >
                    <input
                      type="checkbox"
                      checked={elementTypesSorted.includes(t)}
                      onChange={() => onChangeElementTypes(dedupeSort(toggle(elementTypesSorted, t)) as ElementType[])}
                    />
                    <span className="mono">{getElementTypeLabel(t)}</span>
                  </label>
                ))
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="miniLinkButton"
                onClick={() => onChangeElementTypes(allowedElementTypes)}
                disabled={allowedElementTypes.length === 0}
              >
                All
              </button>
              <button type="button" className="miniLinkButton" onClick={() => onChangeElementTypes([])}>
                None
              </button>
            </div>
            <p className="crudHint" style={{ marginTop: 8 }}>
              Options are limited to the selected layer(s) and what exists in the model.
            </p>
          </div>
        ) : null}

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
      </div>
    </details>
  );
}