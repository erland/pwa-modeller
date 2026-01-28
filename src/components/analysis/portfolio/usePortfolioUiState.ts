import { useEffect, useMemo, useRef, useState } from 'react';

import type { ElementType } from '../../../domain';
import { dedupeSort } from '../queryPanel/utils';
import type { PortfolioPresetStateV1, PortfolioPresetV1 } from '../portfolioPresetsStorage';
import { loadPortfolioPresets, normalizePortfolioPresetState, savePortfolioPresets } from '../portfolioPresetsStorage';
import { loadAnalysisUiState, mergeAnalysisUiState } from '../analysisUiStateStorage';

import type { GroupBy, SortDir, SortKey } from './types';

type Args = {
  modelId: string;
  hasLayerFacet: boolean;
};

export function usePortfolioUiState({ modelId, hasLayerFacet }: Args) {
  const [layers, setLayers] = useState<string[]>([]);
  const [types, setTypes] = useState<ElementType[]>([]);
  const [search, setSearch] = useState('');

  const [primaryMetricKey, setPrimaryMetricKey] = useState('');
  const metricKey = primaryMetricKey.trim();
  const [hideMissingMetric, setHideMissingMetric] = useState(false);

  const [showDegree, setShowDegree] = useState(false);
  const [showReach3, setShowReach3] = useState(false);

  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Presets + persistence (per model).
  const [presets, setPresets] = useState<PortfolioPresetV1[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const didRestoreRef = useRef(false);

  const layersSorted = useMemo(() => dedupeSort(layers), [layers]);
  const typesSorted = useMemo(() => dedupeSort(types as unknown as string[]) as ElementType[], [types]);

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
  }, [
    groupBy,
    hideMissingMetric,
    layersSorted,
    modelId,
    primaryMetricKey,
    search,
    selectedPresetId,
    showDegree,
    showReach3,
    sortDir,
    sortKey,
    typesSorted
  ]);

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

  const hasAnyPopulationFilters = layers.length > 0 || types.length > 0 || !!search.trim();

  return {
    layers,
    setLayers,
    types,
    setTypes,
    search,
    setSearch,
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
    sortKey,
    sortDir,
    setSortKey,
    setSortDir,

    layersSorted,
    typesSorted,
    hasAnyPopulationFilters,

    presets,
    selectedPresetId,
    setSelectedPresetId,
    savePreset,
    deleteSelectedPreset,
    applySelectedPreset,

    clearFilters,
    clearMetric,
    toggleSort,
    sortIndicator
  };
}
