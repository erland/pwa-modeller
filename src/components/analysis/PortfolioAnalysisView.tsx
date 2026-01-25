import { useMemo, useState } from 'react';

import type { Model, ModelKind, ElementType } from '../../domain';
import { getElementTypeLabel } from '../../domain';
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

  const selectedElementId = selection.kind === 'element' ? selection.elementId : null;

  const clearFilters = () => {
    setLayers([]);
    setTypes([]);
    setSearch('');
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

        <div className="toolbarGroup" style={{ minWidth: 0 }}>
          <label style={{ visibility: 'hidden' }} aria-hidden="true">
            Actions
          </label>
          <button type="button" className="shellButton" onClick={clearFilters} disabled={!layers.length && !types.length && !search.trim()}>
            Clear filters
          </button>
        </div>
      </div>

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

      {rows.length === 0 ? (
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
              <th style={{ width: 1 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
                <td>
                  <div className="rowActions">
                    <button type="button" className="miniLinkButton" onClick={() => onSelectElement(r.elementId)}>
                      Select
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="crudHint" style={{ marginTop: 10 }}>
        Showing {rows.length} element{rows.length === 1 ? '' : 's'}. Next step will add metrics columns (heat shading, sorting, export).
      </p>
    </div>
  );
}
