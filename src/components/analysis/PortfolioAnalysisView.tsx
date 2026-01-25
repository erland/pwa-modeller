import { useMemo, useState } from 'react';

import type { Model, ModelKind, ElementType } from '../../domain';
import { discoverNumericPropertyKeys, getElementTypeLabel, readNumericPropertyFromElement } from '../../domain';
import type { Selection } from '../model/selection';
import { getAnalysisAdapter } from '../../analysis/adapters/registry';
import { buildPortfolioPopulation } from '../../domain/analysis';

import { dedupeSort, toggle, collectFacetValues, sortElementTypesForDisplay } from './queryPanel/utils';

import '../../styles/crud.css';

type Props = {
  model: Model;
  modelKind: ModelKind;
  selection: Selection;
  onSelectElement: (elementId: string) => void;
};

function formatMetricValue(v: number): string {
  if (!Number.isFinite(v)) return '';
  // Keep stable, compact formatting.
  const isInt = Math.abs(v - Math.round(v)) < 1e-9;
  return isInt ? String(Math.round(v)) : v.toFixed(2).replace(/\.00$/, '').replace(/(\.[0-9])0$/, '$1');
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function PortfolioAnalysisView({ model, modelKind, selection, onSelectElement }: Props) {
  const adapter = useMemo(() => getAnalysisAdapter(modelKind), [modelKind]);
  const facetDefs = useMemo(() => adapter.getFacetDefinitions(model), [adapter, model]);
  const hasLayerFacet = facetDefs.some((d) => d.id === 'archimateLayer');
  const hasElementTypeFacet = facetDefs.some((d) => d.id === 'elementType');

  const availableLayers = useMemo(
    () => (hasLayerFacet ? collectFacetValues<string>(model, modelKind, 'archimateLayer') : []),
    [hasLayerFacet, model, modelKind]
  );

  const availableElementTypes = useMemo(() => {
    if (!hasElementTypeFacet) return [] as ElementType[];
    const types = collectFacetValues<ElementType>(model, modelKind, 'elementType');
    return sortElementTypesForDisplay(types);
  }, [hasElementTypeFacet, model, modelKind]);

  const [layers, setLayers] = useState<string[]>([]);
  const [types, setTypes] = useState<ElementType[]>([]);
  const [search, setSearch] = useState('');

  const availablePropertyKeys = useMemo(() => discoverNumericPropertyKeys(model), [model]);
  const [primaryMetricKey, setPrimaryMetricKey] = useState('');
  const [hideMissingMetric, setHideMissingMetric] = useState(false);

  // Prune selections when the model changes.
  const layersSorted = useMemo(() => dedupeSort(layers), [layers]);
  const typesSorted = useMemo(() => dedupeSort(types as unknown as string[]) as ElementType[], [types]);

  const rows = useMemo(
    () =>
      buildPortfolioPopulation({
        model,
        adapter,
        filter: {
          layers: layersSorted.length ? layersSorted : undefined,
          types: typesSorted.length ? (typesSorted as unknown as string[]) : undefined,
          search: search.trim() ? search.trim() : undefined
        }
      }),
    [adapter, layersSorted, model, search, typesSorted]
  );

  const metricKey = primaryMetricKey.trim();

  const valueByElementId = useMemo(() => {
    if (!metricKey) return {} as Record<string, number | undefined>;
    const out: Record<string, number | undefined> = {};
    for (const r of rows) {
      out[r.elementId] = readNumericPropertyFromElement(model.elements[r.elementId], metricKey);
    }
    return out;
  }, [metricKey, model.elements, rows]);

  const metricRange = useMemo(() => {
    if (!metricKey) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const r of rows) {
      const v = valueByElementId[r.elementId];
      if (v === undefined) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
  }, [metricKey, rows, valueByElementId]);

  const displayRows = useMemo(() => {
    if (!metricKey || !hideMissingMetric) return rows;
    return rows.filter((r) => valueByElementId[r.elementId] !== undefined);
  }, [hideMissingMetric, metricKey, rows, valueByElementId]);

  const selectedElementId = selection.kind === 'element' ? selection.elementId : null;

  const clearFilters = () => {
    setLayers([]);
    setTypes([]);
    setSearch('');
  };

  const clearMetric = () => {
    setPrimaryMetricKey('');
    setHideMissingMetric(false);
  };

  return (
    <div className="workspace" aria-label="Portfolio analysis workspace">
      <div className="workspaceHeader">
        <h1 className="workspaceTitle">Portfolio analysis</h1>
      </div>

      <div className="toolbar" aria-label="Portfolio population filters">
        <div className="toolbarGroup" style={{ minWidth: 280 }}>
          <label htmlFor="portfolio-search">Search</label>
          <input
            id="portfolio-search"
            className="textInput"
            placeholder="Filter by name…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </div>

        <div className="toolbarGroup" style={{ minWidth: 320 }}>
          <label htmlFor="portfolio-metric">Primary metric</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              id="portfolio-metric"
              className="textInput"
              placeholder="Property key (e.g. cost)"
              value={primaryMetricKey}
              onChange={(e) => setPrimaryMetricKey(e.currentTarget.value)}
              list="portfolio-metric-keys"
            />
            <datalist id="portfolio-metric-keys">
              {availablePropertyKeys.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.9, whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={hideMissingMetric}
                disabled={!metricKey}
                onChange={() => setHideMissingMetric(!hideMissingMetric)}
              />
              Hide missing
            </label>
          </div>
        </div>

        <div className="toolbarGroup" style={{ minWidth: 0 }}>
          <label style={{ visibility: 'hidden' }} aria-hidden="true">
            Actions
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="shellButton"
              onClick={clearFilters}
              disabled={!layers.length && !types.length && !search.trim()}
            >
              Clear filters
            </button>
            <button type="button" className="shellButton" onClick={clearMetric} disabled={!metricKey && !hideMissingMetric}>
              Clear metric
            </button>
          </div>
        </div>
      </div>

      {metricKey && metricRange ? (
        <div style={{ marginTop: 10 }}>
          <div className="analysisHeatLegend" title="Heat scale">
            <span>
              Low (<span className="mono">{formatMetricValue(metricRange.min)}</span>)
            </span>
            <div className="analysisHeatLegendBar" aria-hidden="true" />
            <span>
              High (<span className="mono">{formatMetricValue(metricRange.max)}</span>)
            </span>
          </div>
        </div>
      ) : null}

      <div className="toolbar" style={{ marginTop: 10 }}>
        {hasLayerFacet ? (
          <div className="toolbarGroup" style={{ minWidth: 260 }}>
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
              <button
                type="button"
                className="miniLinkButton"
                onClick={() => setLayers(availableLayers)}
                disabled={availableLayers.length === 0}
              >
                All
              </button>
              <button type="button" className="miniLinkButton" onClick={() => setLayers([])}>
                None
              </button>
            </div>
          </div>
        ) : null}

        {hasElementTypeFacet ? (
          <div className="toolbarGroup" style={{ minWidth: 260 }}>
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
                    <input
                      type="checkbox"
                      checked={typesSorted.includes(t)}
                      onChange={() => setTypes(toggle(typesSorted, t) as ElementType[])}
                    />
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

      {displayRows.length === 0 ? (
        <p className="crudHint" style={{ marginTop: 10 }}>
          No elements match the current filters.
        </p>
      ) : (
        <table className="dataTable" aria-label="Portfolio population table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              {hasLayerFacet ? <th>Layer</th> : null}
              <th style={{ textAlign: 'right' }}>
                {metricKey ? (
                  <span title={`Numeric property: ${metricKey}`}>Metric</span>
                ) : (
                  <span title="Choose a numeric property key to enable the heat metric column">Metric</span>
                )}
              </th>
              <th style={{ width: 1 }} />
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => {
              const v = metricKey ? valueByElementId[r.elementId] : undefined;
              const range = metricRange;
              const intensity =
                metricKey && v !== undefined && range
                  ? range.max === range.min
                    ? 1
                    : clamp01((v - range.min) / (range.max - range.min))
                  : 0;
              const heatAlpha = intensity > 0 ? 0.18 * intensity : 0;
              const heatmapBg = heatAlpha > 0 ? `rgba(var(--analysis-heatmap-fill-rgb), ${heatAlpha})` : undefined;

              return (
              <tr
                key={r.elementId}
                style={
                  selectedElementId === r.elementId
                    ? { background: 'rgba(255,255,255,0.04)' }
                    : undefined
                }
              >
                <td>{r.label}</td>
                <td className="mono">{r.typeLabel}</td>
                {hasLayerFacet ? <td>{r.layerLabel ?? ''}</td> : null}
                <td
                  className="mono"
                  style={{ textAlign: 'right', background: heatmapBg, opacity: metricKey && v === undefined ? 0.6 : 1 }}
                  data-heat={intensity > 0 ? intensity.toFixed(3) : undefined}
                >
                  {metricKey ? (v === undefined ? '—' : formatMetricValue(v)) : '—'}
                </td>
                <td>
                  <div className="rowActions">
                    <button type="button" className="miniLinkButton" onClick={() => onSelectElement(r.elementId)}>
                      Select
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="crudHint" style={{ marginTop: 10 }}>
        Showing {displayRows.length} element{displayRows.length === 1 ? '' : 's'}. Next step will add sorting and CSV export.
      </p>
    </div>
  );
}
