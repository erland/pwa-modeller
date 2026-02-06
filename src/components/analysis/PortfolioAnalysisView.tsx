import { useEffect, useMemo } from 'react';

import type { Model, ModelKind, ElementType } from '../../domain';
import { discoverNumericPropertyKeys } from '../../domain';
import type { Selection } from '../model/selection';
import { getAnalysisAdapter } from '../../analysis/adapters/registry';
import { buildPortfolioPopulation } from '../../domain/analysis';
import { getEffectiveTagsForElement, overlayStore, useOverlayStore } from '../../store/overlay';
import type { TabularData } from '../../export';

import { collectFacetValues, sortElementTypesForDisplay } from './queryPanel/utils';

import '../../styles/crud.css';

import { PortfolioQuerySection } from './portfolio/PortfolioQuerySection';
import { PortfolioResultsSection } from './portfolio/PortfolioResultsSection';
import { usePortfolioUiState } from './portfolio/usePortfolioUiState';
import { usePortfolioComputedData } from './portfolio/usePortfolioComputedData';

export type Props = {
  model: Model;
  modelKind: ModelKind;
  selection: Selection;
  onSelectElement: (elementId: string) => void;
  onExportTableChange?: (table: TabularData | null) => void;
};

export function PortfolioAnalysisView({ model, modelKind, selection, onSelectElement, onExportTableChange }: Props) {
  const overlayVersion = useOverlayStore((s) => s.getVersion());
  const adapter = useMemo(() => getAnalysisAdapter(modelKind), [modelKind]);
  const facetDefs = useMemo(() => adapter.getFacetDefinitions(model), [adapter, model]);
  const hasLayerFacet = facetDefs.some((d) => d.id === 'archimateLayer');
  const hasElementTypeFacet = facetDefs.some((d) => d.id === 'elementType');

  const modelId = model.id;

  const ui = usePortfolioUiState({ modelId, hasLayerFacet });

  const availableLayers = useMemo(
    () => (hasLayerFacet ? collectFacetValues<string>(model, modelKind, 'archimateLayer') : []),
    [hasLayerFacet, model, modelKind]
  );

  const availableElementTypesAll = useMemo(() => {
    if (!hasElementTypeFacet) return [] as ElementType[];
    const types = collectFacetValues<ElementType>(model, modelKind, 'elementType');
    return sortElementTypesForDisplay(types);
  }, [hasElementTypeFacet, model, modelKind]);

  const availableElementTypes = useMemo(() => {
    if (!hasElementTypeFacet) return [] as ElementType[];
    if (!hasLayerFacet || ui.layersSorted.length === 0) return availableElementTypesAll;

    // Limit type options to those that actually occur within the currently selected layers.
    const layerRows = buildPortfolioPopulation({
      model,
      adapter,
      filter: { layers: ui.layersSorted.length ? ui.layersSorted : undefined }
    });

    const allowed = new Set(layerRows.map((r) => r.typeKey).filter((t): t is string => !!t));
    return availableElementTypesAll.filter((t) => allowed.has(String(t)));
  }, [adapter, availableElementTypesAll, hasElementTypeFacet, hasLayerFacet, model, ui.layersSorted]);

  useEffect(() => {
    // If layer selection reduces the available type set, prune any now-invalid type selections.
    if (!hasElementTypeFacet) return;
    if (ui.types.length === 0) return;
    const next = ui.types.filter((t) => availableElementTypes.includes(t));
    if (next.length !== ui.types.length) ui.setTypes(next);
  }, [availableElementTypes, hasElementTypeFacet, ui]);

  const availablePropertyKeys = useMemo(
    () =>
      discoverNumericPropertyKeys(model, {
        getTaggedValues: (el) => getEffectiveTagsForElement(model, el, overlayStore).effectiveTaggedValues
      }),
    [model, overlayVersion]
  );

  const computed = usePortfolioComputedData({
    model,
    adapter,
    layersSorted: ui.layersSorted,
    typesSorted: (ui.typesSorted as unknown as string[]) ?? [],
    search: ui.search,
    metricKey: ui.metricKey,
    hideMissingMetric: ui.hideMissingMetric,
    showDegree: ui.showDegree,
    showReach3: ui.showReach3,
    sortKey: ui.sortKey,
    sortDir: ui.sortDir,
    groupBy: ui.groupBy,
    hasLayerFacet
  });

  const selectedElementId = selection.kind === 'element' ? selection.elementId : null;

  const exportTable: TabularData | null = useMemo(() => {
    if (computed.tableRows.length === 0) return null;

    const headers: string[] = ['elementId', 'name', 'type'];
    if (hasLayerFacet) headers.push('layer');
    headers.push(ui.metricKey ? ui.metricKey : 'metric');
    if (ui.showDegree) headers.push('degree');
    if (ui.showReach3) headers.push('reach3');

    const rows: string[][] = computed.tableRows.map((r) => {
      const v = ui.metricKey ? computed.valueByElementId[r.elementId] : undefined;
      const degree = ui.showDegree ? (computed.degreeByElementId[r.elementId] ?? '') : '';
      const reach3 = ui.showReach3 ? (computed.reach3ByElementId[r.elementId] ?? '') : '';
      const out: string[] = [r.elementId, r.label, r.typeLabel];
      if (hasLayerFacet) out.push(r.layerLabel ?? '');
      out.push(v === undefined ? '' : String(v));
      if (ui.showDegree) out.push(degree === undefined ? '' : String(degree));
      if (ui.showReach3) out.push(reach3 === undefined ? '' : String(reach3));
      return out;
    });

    return { headers, rows };
  }, [computed.degreeByElementId, computed.reach3ByElementId, computed.tableRows, computed.valueByElementId, hasLayerFacet, ui.metricKey, ui.showDegree, ui.showReach3]);

  useEffect(() => {
    onExportTableChange?.(exportTable);
  }, [exportTable, onExportTableChange]);

  return (
    <div className="workspace" aria-label="Portfolio analysis workspace">
      <PortfolioQuerySection
        modelId={modelId}
        availablePropertyKeys={availablePropertyKeys}
        primaryMetricKey={ui.primaryMetricKey}
        setPrimaryMetricKey={ui.setPrimaryMetricKey}
        metricKey={ui.metricKey}
        hideMissingMetric={ui.hideMissingMetric}
        setHideMissingMetric={ui.setHideMissingMetric}
        showDegree={ui.showDegree}
        setShowDegree={ui.setShowDegree}
        showReach3={ui.showReach3}
        setShowReach3={ui.setShowReach3}
        groupBy={ui.groupBy}
        setGroupBy={ui.setGroupBy}
        hasLayerFacet={hasLayerFacet}
        hasElementTypeFacet={hasElementTypeFacet}
        presets={ui.presets}
        selectedPresetId={ui.selectedPresetId}
        setSelectedPresetId={ui.setSelectedPresetId}
        applySelectedPreset={ui.applySelectedPreset}
        savePreset={ui.savePreset}
        deleteSelectedPreset={ui.deleteSelectedPreset}
        hasAnyPopulationFilters={ui.hasAnyPopulationFilters}
        search={ui.search}
        setSearch={ui.setSearch}
        layers={ui.layers}
        layersSorted={ui.layersSorted}
        setLayers={ui.setLayers}
        availableLayers={availableLayers}
        types={ui.types}
        typesSorted={ui.typesSorted}
        setTypes={ui.setTypes}
        availableElementTypes={availableElementTypes}
        clearFilters={ui.clearFilters}
        clearMetric={ui.clearMetric}
      />

      <PortfolioResultsSection
        metricKey={ui.metricKey}
        metricRange={computed.metricRange}
        completeness={computed.completeness}
        displayRows={computed.displayRows}
        grouped={computed.grouped}
        tableRows={computed.tableRows}
        hasLayerFacet={hasLayerFacet}
        showDegree={ui.showDegree}
        showReach3={ui.showReach3}
        degreeByElementId={computed.degreeByElementId}
        reach3ByElementId={computed.reach3ByElementId}
        valueByElementId={computed.valueByElementId}
        selectedElementId={selectedElementId}
        onSelectElement={onSelectElement}
        sortKey={ui.sortKey}
        sortDir={ui.sortDir}
        groupBy={ui.groupBy}
        toggleSort={ui.toggleSort}
        sortIndicator={ui.sortIndicator}
      />
    </div>
  );
}
