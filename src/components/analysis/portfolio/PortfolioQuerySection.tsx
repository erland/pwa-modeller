import type { ElementType } from '../../../domain';
import { getElementTypeLabel } from '../../../domain';
import { toggle } from '../queryPanel/utils';

import { AnalysisSection } from '../layout/AnalysisSection';
import type { GroupBy } from './types';

type Props = {
  modelId: string;

  availablePropertyKeys: string[];
  primaryMetricKey: string;
  setPrimaryMetricKey: (v: string) => void;
  metricKey: string;
  hideMissingMetric: boolean;
  setHideMissingMetric: (v: boolean) => void;

  showDegree: boolean;
  setShowDegree: (v: boolean) => void;
  showReach3: boolean;
  setShowReach3: (v: boolean) => void;

  groupBy: GroupBy;
  setGroupBy: (v: GroupBy) => void;

  hasLayerFacet: boolean;
  hasElementTypeFacet: boolean;

  presets: Array<{ id: string; name: string }>;
  selectedPresetId: string;
  setSelectedPresetId: (id: string) => void;
  applySelectedPreset: (id: string) => void;
  savePreset: () => void;
  deleteSelectedPreset: () => void;

  hasAnyPopulationFilters: boolean;

  // filters
  search: string;
  setSearch: (v: string) => void;

  layers: string[];
  layersSorted: string[];
  setLayers: (v: string[]) => void;
  availableLayers: string[];

  types: ElementType[];
  typesSorted: ElementType[];
  setTypes: (v: ElementType[]) => void;
  availableElementTypes: ElementType[];

  clearFilters: () => void;
  clearMetric: () => void;
};

export function PortfolioQuerySection({
  modelId,
  availablePropertyKeys,
  primaryMetricKey,
  setPrimaryMetricKey,
  metricKey,
  hideMissingMetric,
  setHideMissingMetric,
  showDegree,
  setShowDegree,
  showReach3,
  setShowReach3,
  groupBy,
  setGroupBy,
  hasLayerFacet,
  hasElementTypeFacet,
  presets,
  selectedPresetId,
  setSelectedPresetId,
  applySelectedPreset,
  savePreset,
  deleteSelectedPreset,
  hasAnyPopulationFilters,
  search,
  setSearch,
  layers,
  layersSorted,
  setLayers,
  availableLayers,
  types,
  typesSorted,
  setTypes,
  availableElementTypes,
  clearFilters,
  clearMetric
}: Props) {
  const queryActions = (
    <>
      <button type="button" className="shellButton" onClick={clearFilters} disabled={!layers.length && !types.length && !search.trim()}>
        Clear filters
      </button>
      <button type="button" className="shellButton" onClick={clearMetric} disabled={!metricKey && !hideMissingMetric}>
        Clear metric
      </button>
    </>
  );

  return (
    <AnalysisSection title="Query" hint="Define population, metrics, grouping, and presets." actions={queryActions}>
      <div className="toolbar" aria-label="Portfolio population filters" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="toolbarGroup" style={{ minWidth: 320 }}>
          <label htmlFor="portfolio-metric">Primary metric</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              id="portfolio-metric"
              className="textInput"
              placeholder="Property key (e.g. cost)"
              value={primaryMetricKey}
              onChange={(e) => setPrimaryMetricKey(e.currentTarget.value)}
              list="portfolio-metric-keys"
              style={{ width: 'auto', flex: '1 1 220px', minWidth: 180 }}
            />
            <datalist id="portfolio-metric-keys">
              {availablePropertyKeys.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                opacity: 0.9,
                whiteSpace: 'nowrap',
                flex: '0 0 auto'
              }}
            >
              <input type="checkbox" checked={hideMissingMetric} disabled={!metricKey} onChange={() => setHideMissingMetric(!hideMissingMetric)} />
              Hide missing
            </label>
          </div>
        </div>

        <div className="toolbarGroup" style={{ minWidth: 260 }}>
          <label>Extra metrics</label>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={showDegree} onChange={() => setShowDegree(!showDegree)} />
              Degree
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={showReach3} onChange={() => setShowReach3(!showReach3)} />
              Reach(3)
            </label>
          </div>
        </div>

        <div className="toolbarGroup" style={{ minWidth: 220 }}>
          <label htmlFor="portfolio-groupby">Group by</label>
          <select id="portfolio-groupby" className="selectInput" value={groupBy} onChange={(e) => setGroupBy(e.currentTarget.value as GroupBy)}>
            <option value="none">None</option>
            <option value="type">Type</option>
            {hasLayerFacet ? <option value="layer">Layer</option> : null}
          </select>
        </div>

        <div className="toolbarGroup" style={{ minWidth: 320 }}>
          <label htmlFor="portfolio-preset">Preset</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              id="portfolio-preset"
              className="selectInput"
              value={selectedPresetId}
              onChange={(e) => {
                const nextId = e.currentTarget.value;
                setSelectedPresetId(nextId);
                if (nextId) applySelectedPreset(nextId);
              }}
              style={{ minWidth: 200 }}
            >
              <option value="">—</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" className="shellButton" onClick={savePreset} disabled={!modelId}>
              Save preset
            </button>
            <button type="button" className="shellButton" onClick={deleteSelectedPreset} disabled={!selectedPresetId}>
              Delete
            </button>
          </div>
        </div>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.9 }}>
          Filters & presets{hasAnyPopulationFilters ? ' (active)' : ''}
        </summary>

        {/* Filter controls row: keep a clear gap between Search and the facet panels. */}
        <div className="toolbar" style={{ marginTop: 10, flexWrap: 'wrap', alignItems: 'flex-start', gap: 48 }}>
          {/* Search is a result filter, so keep it compact and aligned with the layer/type panels. */}
          <div className="toolbarGroup" style={{ minWidth: 260, maxWidth: 260, flex: '0 0 260px' }}>
            <label htmlFor="portfolio-search">Search</label>
            <input
              id="portfolio-search"
              className="textInput"
              placeholder="Filter by name…"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ minWidth: 0 }}
            />
          </div>

          {/* Keep Layers and Types together as a unit when wrapping on narrow screens. */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              flex: '1 1 560px',
              minWidth: 0
            }}
          >
            {hasLayerFacet ? (
              <div className="toolbarGroup" style={{ minWidth: 260, flex: '1 1 260px' }}>
                <label>
                  Layers ({layersSorted.length}/{availableLayers.length})
                </label>
                <div
                  style={{
                    maxHeight: 160,
                    overflow: 'auto',
                    border: '1px solid var(--border-1)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    background: 'rgba(255,255,255,0.02)'
                  }}
                >
                  {availableLayers.length === 0 ? (
                    <p className="crudHint" style={{ margin: 0 }}>
                      No layers found in the model.
                    </p>
                  ) : (
                    availableLayers.map((l) => (
                      <label
                        key={l}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
                      >
                        <input type="checkbox" checked={layersSorted.includes(l)} onChange={() => setLayers(toggle(layersSorted, l))} />
                        <span title={String(l)}>{String(l)}</span>
                      </label>
                    ))
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="miniLinkButton" onClick={() => setLayers(availableLayers)} disabled={availableLayers.length === 0}>
                    All
                  </button>
                  <button type="button" className="miniLinkButton" onClick={() => setLayers([])}>
                    None
                  </button>
                </div>
              </div>
            ) : null}

            {hasElementTypeFacet ? (
              <div className="toolbarGroup" style={{ minWidth: 260, flex: '1 1 260px' }}>
                <label>
                  Types ({typesSorted.length}/{availableElementTypes.length})
                </label>
                <div
                  style={{
                    maxHeight: 160,
                    overflow: 'auto',
                    border: '1px solid var(--border-1)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    background: 'rgba(255,255,255,0.02)'
                  }}
                >
                  {availableElementTypes.length === 0 ? (
                    <p className="crudHint" style={{ margin: 0 }}>
                      No element types found in the model.
                    </p>
                  ) : (
                    availableElementTypes.map((t) => (
                      <label
                        key={t}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, marginBottom: 6 }}
                      >
                        <input type="checkbox" checked={typesSorted.includes(t)} onChange={() => setTypes(toggle(typesSorted, t) as ElementType[])} />
                        <span title={String(t)}>{getElementTypeLabel(t)}</span>
                      </label>
                    ))
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="miniLinkButton"
                    onClick={() => setTypes(availableElementTypes)}
                    disabled={availableElementTypes.length === 0}
                  >
                    All
                  </button>
                  <button type="button" className="miniLinkButton" onClick={() => setTypes([])}>
                    None
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </details>
    </AnalysisSection>
  );
}
