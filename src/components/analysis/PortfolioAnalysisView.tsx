import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import type { Model, ModelKind, ElementType } from '../../domain';
import { discoverNumericPropertyKeys, getElementTypeLabel, readNumericPropertyFromElement, rowsToCsv } from '../../domain';
import type { Selection } from '../model/selection';
import { getAnalysisAdapter } from '../../analysis/adapters/registry';
import { buildAnalysisGraph, buildPortfolioPopulation, computeNodeMetric } from '../../domain/analysis';
import { downloadTextFile, sanitizeFileNameWithExtension } from '../../store';

import { loadAnalysisUiState, mergeAnalysisUiState } from './analysisUiStateStorage';
import { loadPortfolioPresets, savePortfolioPresets, normalizePortfolioPresetState } from './portfolioPresetsStorage';
import type { PortfolioPresetStateV1, PortfolioPresetV1 } from './portfolioPresetsStorage';

import { dedupeSort, toggle, collectFacetValues, sortElementTypesForDisplay } from './queryPanel/utils';

import '../../styles/crud.css';

type Props = {
  model: Model;
  modelKind: ModelKind;
  selection: Selection;
  onSelectElement: (elementId: string) => void;
};

type SortKey = 'name' | 'type' | 'layer' | 'metric' | 'degree' | 'reach3';
type SortDir = 'asc' | 'desc';
type GroupBy = 'none' | 'type' | 'layer';

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

function toTestIdKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function percentRounded(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
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

  const availableElementTypesAll = useMemo(() => {
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

  const [showDegree, setShowDegree] = useState(false);
  const [showReach3, setShowReach3] = useState(false);

  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Presets + persistence (per model).
  const modelId = model.id;
  const [presets, setPresets] = useState<PortfolioPresetV1[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const didRestoreRef = useRef(false);

  // Prune selections when the model changes.
  const layersSorted = useMemo(() => dedupeSort(layers), [layers]);
  const typesSorted = useMemo(() => dedupeSort(types as unknown as string[]) as ElementType[], [types]);

  const availableElementTypes = useMemo(() => {
    if (!hasElementTypeFacet) return [] as ElementType[];
    if (!hasLayerFacet || layersSorted.length === 0) return availableElementTypesAll;

    // Limit type options to those that actually occur within the currently selected layers.
    const layerRows = buildPortfolioPopulation({
      model,
      adapter,
      filter: { layers: layersSorted.length ? layersSorted : undefined }
    });

    const allowed = new Set(layerRows.map((r) => r.typeKey).filter((t): t is string => !!t));
    return availableElementTypesAll.filter((t) => allowed.has(String(t)));
  }, [adapter, availableElementTypesAll, hasElementTypeFacet, hasLayerFacet, layersSorted, model]);

  useEffect(() => {
    // If layer selection reduces the available type set, prune any now-invalid type selections.
    if (!hasElementTypeFacet) return;
    if (types.length === 0) return;
    const next = types.filter((t) => availableElementTypes.includes(t));
    if (next.length !== types.length) setTypes(next);
  }, [availableElementTypes, hasElementTypeFacet, setTypes, types]);


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

  const completeness = useMemo(() => {
    const total = rows.length;
    if (!metricKey) {
      return { total, present: 0, missing: 0, percent: null as number | null };
    }
    let present = 0;
    for (const r of rows) {
      if (valueByElementId[r.elementId] !== undefined) present++;
    }
    const missing = Math.max(0, total - present);
    const percent = percentRounded(present, total);
    return { total, present, missing, percent };
  }, [metricKey, rows, valueByElementId]);

  const displayRows = useMemo(() => {
    if (!metricKey || !hideMissingMetric) return rows;
    return rows.filter((r) => valueByElementId[r.elementId] !== undefined);
  }, [hideMissingMetric, metricKey, rows, valueByElementId]);

  const graph = useMemo(() => buildAnalysisGraph(model), [model]);

  const visibleNodeIds = useMemo(() => displayRows.map((r) => r.elementId), [displayRows]);

  const needsDegree = showDegree || sortKey === 'degree';
  const degreeByElementId = useMemo(() => {
    if (!needsDegree || visibleNodeIds.length === 0) return {} as Record<string, number | undefined>;
    return computeNodeMetric(graph, 'nodeDegree', {
      direction: 'both',
      nodeIds: visibleNodeIds
    });
  }, [graph, needsDegree, visibleNodeIds]);

  const needsReach3 = showReach3 || sortKey === 'reach3';
  const reach3ByElementId = useMemo(() => {
    if (!needsReach3 || visibleNodeIds.length === 0) return {} as Record<string, number | undefined>;
    return computeNodeMetric(graph, 'nodeReach', {
      direction: 'both',
      maxDepth: 3,
      nodeIds: visibleNodeIds
    });
  }, [graph, needsReach3, visibleNodeIds]);

  const rowComparator = useMemo(() => {
    const dirMul = sortDir === 'asc' ? 1 : -1;

    const keyString = (s: string | null | undefined): string => (s ?? '').toString();
    const cmpStr = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

    return (a: (typeof displayRows)[number], b: (typeof displayRows)[number]): number => {
      if (sortKey === 'name') return cmpStr(a.label, b.label) * dirMul;
      // For secondary comparisons (tie-breakers), always use Name asc to keep ordering predictable.
      if (sortKey === 'type') return cmpStr(a.typeLabel, b.typeLabel) * dirMul || cmpStr(a.label, b.label);
      if (sortKey === 'layer') return cmpStr(keyString(a.layerLabel), keyString(b.layerLabel)) * dirMul || cmpStr(a.label, b.label);
      if (sortKey === 'degree') {
        const av = degreeByElementId[a.elementId];
        const bv = degreeByElementId[b.elementId];
        const aMissing = av === undefined;
        const bMissing = bv === undefined;
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        if (av === undefined || bv === undefined) return cmpStr(a.label, b.label);
        if (av !== bv) return (av - bv) * dirMul;
        return cmpStr(a.label, b.label);
      }
      if (sortKey === 'reach3') {
        const av = reach3ByElementId[a.elementId];
        const bv = reach3ByElementId[b.elementId];
        const aMissing = av === undefined;
        const bMissing = bv === undefined;
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        if (av === undefined || bv === undefined) return cmpStr(a.label, b.label);
        if (av !== bv) return (av - bv) * dirMul;
        return cmpStr(a.label, b.label);
      }
      // metric
      const av = metricKey ? valueByElementId[a.elementId] : undefined;
      const bv = metricKey ? valueByElementId[b.elementId] : undefined;
      // Keep missing values at the bottom regardless of sort direction.
      const aMissing = av === undefined;
      const bMissing = bv === undefined;
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (av === undefined || bv === undefined) return cmpStr(a.label, b.label);
      if (av !== bv) return (av - bv) * dirMul;
      return cmpStr(a.label, b.label);
    };
  }, [degreeByElementId, metricKey, reach3ByElementId, sortDir, sortKey, valueByElementId]);

  const sortedRows = useMemo(() => {
    // Stable sort.
    return displayRows
      .map((r, i) => ({ r, i }))
      .sort((a, b) => rowComparator(a.r, b.r) || a.i - b.i)
      .map((x) => x.r);
  }, [displayRows, rowComparator]);

  const grouped = useMemo(() => {
    if (groupBy === 'none') return null;
    if (groupBy === 'layer' && !hasLayerFacet) return null;

    const keyForRow = (r: (typeof sortedRows)[number]): string => {
      if (groupBy === 'type') return r.typeLabel;
      return r.layerLabel ?? '—';
    };

    const groups = new Map<string, (typeof sortedRows)[number][]>();
    for (const r of sortedRows) {
      const k = keyForRow(r);
      const cur = groups.get(k);
      if (cur) cur.push(r);
      else groups.set(k, [r]);
    }

    const groupKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const indexById: Record<string, number> = {};
    for (let i = 0; i < displayRows.length; i++) indexById[displayRows[i].elementId] = i;

    const stableSort = (arr: (typeof sortedRows)[number][]): (typeof sortedRows)[number][] =>
      arr
        .map((r) => ({ r, i: indexById[r.elementId] ?? 0 }))
        .sort((a, b) => rowComparator(a.r, b.r) || a.i - b.i)
        .map((x) => x.r);

    return groupKeys.map((k) => {
      const rowsInGroup = stableSort(groups.get(k) ?? []);
      let sum = 0;
      let present = 0;
      let missing = 0;
      if (metricKey) {
        for (const r of rowsInGroup) {
          const v = valueByElementId[r.elementId];
          if (v === undefined) missing++;
          else {
            present++;
            sum += v;
          }
        }
      }
      const avg = metricKey && present > 0 ? sum / present : null;
      return { key: k, rows: rowsInGroup, rollup: { count: rowsInGroup.length, sum: metricKey ? sum : null, avg, missing: metricKey ? missing : 0 } };
    });
  }, [displayRows, groupBy, hasLayerFacet, metricKey, rowComparator, sortedRows, valueByElementId]);

  const tableRows = useMemo(() => {
    if (!grouped) return sortedRows;
    return grouped.flatMap((g) => g.rows);
  }, [grouped, sortedRows]);

  // Restore persisted UI state + presets when the model changes.
  useEffect(() => {
    didRestoreRef.current = false;
  }, [modelId]);

  useEffect(() => {
    if (!modelId || didRestoreRef.current) return;
    didRestoreRef.current = true;

    // Presets
    setPresets(loadPortfolioPresets(modelId));

    // UI state
    const ui = loadAnalysisUiState(modelId)?.portfolio;
    if (!ui) return;

    if (Array.isArray(ui.layers)) setLayers(ui.layers.filter((x) => typeof x === 'string'));
    if (Array.isArray(ui.types)) setTypes(ui.types.filter((x) => typeof x === 'string') as unknown as ElementType[]);
    if (typeof ui.search === 'string') setSearch(ui.search);
    if (typeof ui.primaryMetricKey === 'string') setPrimaryMetricKey(ui.primaryMetricKey);
    if (typeof ui.hideMissingMetric === 'boolean') setHideMissingMetric(ui.hideMissingMetric);
    if (typeof ui.showDegree === 'boolean') setShowDegree(ui.showDegree);
    if (typeof ui.showReach3 === 'boolean') setShowReach3(ui.showReach3);
    if (ui.groupBy === 'none' || ui.groupBy === 'type' || ui.groupBy === 'layer') setGroupBy(ui.groupBy);
    if (ui.sortKey) setSortKey(ui.sortKey as SortKey);
    if (ui.sortDir === 'asc' || ui.sortDir === 'desc') setSortDir(ui.sortDir);
    if (typeof ui.presetId === 'string') setSelectedPresetId(ui.presetId);
  }, [modelId]);

  // Persist UI state (skip in tests to avoid cross-test storage leakage).
  useEffect(() => {
    if (!modelId) return;
    // Avoid relying on Node globals (e.g. `process`) since this is browser code.
    // In Jest/JSDOM runs, skip persistence to prevent cross-test localStorage leakage.
    const isJsDom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent ?? '');
    if (isJsDom) return;
    const handle = window.setTimeout(() => {
      mergeAnalysisUiState(modelId, {
        portfolio: {
          presetId: selectedPresetId || undefined,
          layers: layersSorted,
          types: (typesSorted as unknown as string[]) ?? [],
          search,
          primaryMetricKey,
          hideMissingMetric,
          showDegree,
          showReach3,
          groupBy,
          sortKey,
          sortDir
        }
      });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [groupBy, hideMissingMetric, layersSorted, modelId, primaryMetricKey, search, selectedPresetId, showDegree, showReach3, sortDir, sortKey, typesSorted]);

  // If a user hides a column that is currently used for sorting, fall back to Name.
  // (Keeps UI behavior predictable and avoids sorting by a hidden column.)
  useEffect(() => {
    if (sortKey === 'degree' && !showDegree) {
      setSortKey('name');
      setSortDir('asc');
    }
    if (sortKey === 'reach3' && !showReach3) {
      setSortKey('name');
      setSortDir('asc');
    }
  }, [showDegree, showReach3, sortKey]);

  useEffect(() => {
    if (groupBy === 'layer' && !hasLayerFacet) setGroupBy('none');
  }, [groupBy, hasLayerFacet]);

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

  const snapshotPresetState = (): PortfolioPresetStateV1 => ({
    layers: layersSorted,
    types: (typesSorted as unknown as string[]) ?? [],
    search,
    primaryMetricKey,
    hideMissingMetric,
    showDegree,
    showReach3,
    groupBy,
    sortKey,
    sortDir
  });

  const applyPresetState = (state: PortfolioPresetStateV1): void => {
    setLayers(state.layers);
    setTypes(state.types as unknown as ElementType[]);
    setSearch(state.search);
    setPrimaryMetricKey(state.primaryMetricKey);
    setHideMissingMetric(state.hideMissingMetric);
    setShowDegree(state.showDegree);
    setShowReach3(state.showReach3);
    setGroupBy(state.groupBy as GroupBy);
    setSortKey(state.sortKey as SortKey);
    setSortDir(state.sortDir as SortDir);
  };

  const createPresetId = (): string => `pp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const savePreset = (): void => {
    const name = window.prompt('Preset name?', '');
    if (!name || !name.trim()) return;
    const next: PortfolioPresetV1 = {
      version: 1,
      id: createPresetId(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      state: snapshotPresetState()
    };
    const updated = [next, ...presets];
    setPresets(updated);
    savePortfolioPresets(modelId, updated);
    setSelectedPresetId(next.id);
  };

  const deleteSelectedPreset = (): void => {
    if (!selectedPresetId) return;
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    const ok = window.confirm(`Delete preset "${preset.name}"?`);
    if (!ok) return;
    const updated = presets.filter((p) => p.id !== selectedPresetId);
    setPresets(updated);
    savePortfolioPresets(modelId, updated);
    setSelectedPresetId('');
  };

  const applySelectedPreset = (presetId: string): void => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    const state = normalizePortfolioPresetState(preset.state);
    applyPresetState(state);
  };

  const toggleSort = (nextKey: SortKey): void => {
    if (nextKey === 'metric' && !metricKey) return;
    if (nextKey === 'layer' && !hasLayerFacet) return;
    if (nextKey === 'degree' && !showDegree) return;
    if (nextKey === 'reach3' && !showReach3) return;
    setSortKey((cur) => {
      if (cur !== nextKey) {
        setSortDir('asc');
        return nextKey;
      }
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return cur;
    });
  };

  const sortIndicator = (k: SortKey): string => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const modelName = model.metadata?.name || 'model';

  const exportCsv = (): void => {
    if (tableRows.length === 0) return;
    const base = metricKey ? `${modelName}-portfolio-${metricKey}` : `${modelName}-portfolio`;

    const columns: Array<{ key: string; header: string }> = [
      { key: 'elementId', header: 'elementId' },
      { key: 'name', header: 'name' },
      { key: 'type', header: 'type' }
    ];
    if (hasLayerFacet) columns.push({ key: 'layer', header: 'layer' });
    columns.push({ key: 'metric', header: metricKey ? metricKey : 'metric' });
    if (showDegree) columns.push({ key: 'degree', header: 'degree' });
    if (showReach3) columns.push({ key: 'reach3', header: 'reach3' });

    const exportRows: Record<string, unknown>[] = tableRows.map((r) => {
      const v = metricKey ? valueByElementId[r.elementId] : undefined;
      const degree = showDegree ? (degreeByElementId[r.elementId] ?? '') : '';
      const reach3 = showReach3 ? (reach3ByElementId[r.elementId] ?? '') : '';
      return {
        elementId: r.elementId,
        name: r.label,
        type: r.typeLabel,
        layer: r.layerLabel ?? '',
        metric: v ?? '',
        degree,
        reach3
      };
    });

    const csv = rowsToCsv(
      exportRows as unknown as Record<string, unknown>[],
      columns.map((c) => ({ key: c.key as never, header: c.header })) as never
    );
    downloadTextFile(sanitizeFileNameWithExtension(base, 'csv'), csv, 'text/csv');
  };

  return (
    <div className="workspace" aria-label="Portfolio analysis workspace">
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
          <select
            id="portfolio-groupby"
            className="textInput"
            value={groupBy}
            onChange={(e) => setGroupBy(e.currentTarget.value as GroupBy)}
          >
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
              className="textInput"
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

        <div className="toolbarGroup" style={{ minWidth: 0 }}>
          <label style={{ visibility: 'hidden' }} aria-hidden="true">
            Actions
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="shellButton"
              onClick={exportCsv}
              disabled={tableRows.length === 0}
              aria-disabled={tableRows.length === 0}
              title="Export the portfolio table as CSV"
            >
              Export CSV
            </button>
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

      <div
        aria-label="Portfolio completeness summary"
        style={{
          marginTop: 10,
          padding: '8px 10px',
          border: '1px solid var(--border-1)',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.02)'
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span>
            Population: <span className="mono" data-testid="portfolio-completeness-total">{completeness.total}</span>
          </span>
          {metricKey ? (
            <>
              <span>
                Has <span className="mono">{metricKey}</span>:{' '}
                <span className="mono" data-testid="portfolio-completeness-present">{completeness.present}</span>{' '}
                (<span className="mono" data-testid="portfolio-completeness-percent">{completeness.percent}%</span>)
              </span>
              <span>
                Missing: <span className="mono" data-testid="portfolio-completeness-missing">{completeness.missing}</span>
              </span>
            </>
          ) : (
            <span className="crudHint" style={{ margin: 0 }}>
              Choose a primary metric to see completeness.
            </span>
          )}
        </div>
      </div>

      {displayRows.length === 0 ? (
        <p className="crudHint" style={{ marginTop: 10 }}>
          No elements match the current filters.
        </p>
      ) : (
        <table className="dataTable" aria-label="Portfolio population table">
          <thead>
            <tr>
              <th>
                <button type="button" className="miniLinkButton" onClick={() => toggleSort('name')} title="Sort by name">
                  Name{sortIndicator('name')}
                </button>
              </th>
              <th>
                <button type="button" className="miniLinkButton" onClick={() => toggleSort('type')} title="Sort by type">
                  Type{sortIndicator('type')}
                </button>
              </th>
              {hasLayerFacet ? (
                <th>
                  <button type="button" className="miniLinkButton" onClick={() => toggleSort('layer')} title="Sort by layer">
                    Layer{sortIndicator('layer')}
                  </button>
                </th>
              ) : null}
              <th style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  className="miniLinkButton"
                  onClick={() => toggleSort('metric')}
                  title={metricKey ? `Sort by numeric property: ${metricKey}` : 'Choose a numeric property key to enable metric sorting'}
                  disabled={!metricKey}
                  aria-disabled={!metricKey}
                >
                  Metric{sortIndicator('metric')}
                </button>
              </th>
              {showDegree ? (
                <th style={{ textAlign: 'right' }}>
                  <button type="button" className="miniLinkButton" onClick={() => toggleSort('degree')} title="Sort by degree">
                    Degree{sortIndicator('degree')}
                  </button>
                </th>
              ) : null}
              {showReach3 ? (
                <th style={{ textAlign: 'right' }}>
                  <button type="button" className="miniLinkButton" onClick={() => toggleSort('reach3')} title="Sort by reach within 3 steps">
                    Reach(3){sortIndicator('reach3')}
                  </button>
                </th>
              ) : null}
              <th style={{ width: 1 }} />
            </tr>
          </thead>
          <tbody>
            {grouped
              ? grouped.map((g) => {
                  const colSpan =
                    1 +
                    1 +
                    (hasLayerFacet ? 1 : 0) +
                    1 +
                    (showDegree ? 1 : 0) +
                    (showReach3 ? 1 : 0) +
                    1;

                  const metricLabel = metricKey ? metricKey : 'metric';
                  const sumText = g.rollup.sum !== null ? formatMetricValue(g.rollup.sum) : '';
                  const avgText = g.rollup.avg !== null ? formatMetricValue(g.rollup.avg) : '';

                  return (
                    <Fragment key={`group-${groupBy}-${g.key}`}>
                      <tr
                        data-testid={`portfolio-group-${groupBy}-${toTestIdKey(g.key)}`}
                        style={{ background: 'rgba(255,255,255,0.03)' }}
                      >
                        <td colSpan={colSpan}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700 }}>{g.key}</span>
                            <span className="crudHint" style={{ margin: 0 }}>
                              Count: <span className="mono">{g.rollup.count}</span>
                              {metricKey ? (
                                <>
                                  {' '}• Sum {metricLabel}: <span className="mono">{sumText || '—'}</span>
                                  {' '}• Avg: <span className="mono">{avgText || '—'}</span>
                                  {' '}• Missing: <span className="mono">{g.rollup.missing}</span>
                                </>
                              ) : null}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {g.rows.map((r) => {
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
                              selectedElementId === r.elementId ? { background: 'rgba(255,255,255,0.04)' } : undefined
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
                            {showDegree ? (
                              <td
                                className="mono"
                                style={{ textAlign: 'right', opacity: degreeByElementId[r.elementId] === undefined ? 0.6 : 1 }}
                              >
                                {degreeByElementId[r.elementId] ?? '—'}
                              </td>
                            ) : null}
                            {showReach3 ? (
                              <td
                                className="mono"
                                style={{ textAlign: 'right', opacity: reach3ByElementId[r.elementId] === undefined ? 0.6 : 1 }}
                              >
                                {reach3ByElementId[r.elementId] ?? '—'}
                              </td>
                            ) : null}
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
                    </Fragment>
                  );
                })
              : tableRows.map((r) => {
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
                {showDegree ? (
                  <td className="mono" style={{ textAlign: 'right', opacity: degreeByElementId[r.elementId] === undefined ? 0.6 : 1 }}>
                    {degreeByElementId[r.elementId] ?? '—'}
                  </td>
                ) : null}
                {showReach3 ? (
                  <td className="mono" style={{ textAlign: 'right', opacity: reach3ByElementId[r.elementId] === undefined ? 0.6 : 1 }}>
                    {reach3ByElementId[r.elementId] ?? '—'}
                  </td>
                ) : null}
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
        Showing {tableRows.length} element{tableRows.length === 1 ? '' : 's'}.
        {grouped ? ` Grouped by ${groupBy}.` : ''} Sorted by {sortKey} ({sortDir}).
      </p>
    </div>
  );
}
