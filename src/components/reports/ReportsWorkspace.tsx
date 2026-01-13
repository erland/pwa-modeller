import { useMemo, useState } from 'react';

import type {
  ArchimateLayer,
  ElementType,
  RelationshipReportRow,
  ElementReportRow,
  ViewInventoryRow
} from '../../domain';
import { generateElementReport, generateRelationshipReport, generateViewInventoryReport, rowsToCsv } from '../../domain';
import { downloadTextFile, sanitizeFileNameWithExtension } from '../../store';
import { useModelStore } from '../../store/useModelStore';

import '../../styles/crud.css';

type Tab = 'elements' | 'views' | 'relationships';

type SortDir = 'asc' | 'desc';

type SortState = {
  key: string;
  dir: SortDir;
};

const ARCHIMATE_LAYERS: ArchimateLayer[] = [
  'Strategy',
  'Business',
  'Application',
  'Technology',
  'Physical',
  'ImplementationMigration',
  'Motivation'
];

export function ReportsWorkspace() {
  const model = useModelStore((s) => s.model);

  const [activeTab, setActiveTab] = useState<Tab>('elements');
  const [layerFilter, setLayerFilter] = useState<ArchimateLayer | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ElementType | 'all'>('all');

  const [sortByTab, setSortByTab] = useState<Record<Tab, SortState>>({
    elements: { key: 'name', dir: 'asc' },
    views: { key: 'name', dir: 'asc' },
    relationships: { key: 'type', dir: 'asc' }
  });

  const elementRows = useMemo(
    () =>
      model
        ? generateElementReport(model, {
            layer: layerFilter,
            elementType: typeFilter
          })
        : [],
    [model, layerFilter, typeFilter]
  );
  const viewRows = useMemo(() => (model ? generateViewInventoryReport(model) : []), [model]);
  const relationshipRows = useMemo(() => (model ? generateRelationshipReport(model) : []), [model]);

  const layerOptions = useMemo(() => {
    if (!model) return [] as ArchimateLayer[];
    const present = new Set(Object.values(model.elements).map((e) => e.layer).filter((l): l is ArchimateLayer => Boolean(l)));
    return ARCHIMATE_LAYERS.filter((l) => present.has(l));
  }, [model]);

  const typeOptions = useMemo(() => {
    if (!model) return [] as ElementType[];
    const all = Object.values(model.elements);
    const filtered = layerFilter === 'all' ? all : all.filter((e) => e.layer === layerFilter);
    const present = new Set<ElementType>(filtered.map((e) => e.type));
    return Array.from(present).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [model, layerFilter]);

  const canExport = Boolean(model);

  function toggleSort(tab: Tab, key: string) {
    setSortByTab((prev) => {
      const cur = prev[tab];
      const nextDir: SortDir = cur.key === key ? (cur.dir === 'asc' ? 'desc' : 'asc') : 'asc';
      return { ...prev, [tab]: { key, dir: nextDir } };
    });
  }

  function sortRows<T>(rows: T[], sort: SortState, getValue: (row: T, key: string) => unknown): T[] {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return rows
      .map((r, idx) => ({ r, idx }))
      .sort((a, b) => {
        const va = getValue(a.r, sort.key);
        const vb = getValue(b.r, sort.key);
        const sa = String(va ?? '');
        const sb = String(vb ?? '');
        const cmp = sa.localeCompare(sb, undefined, { sensitivity: 'base', numeric: true });
        if (cmp !== 0) return cmp * dir;
        return a.idx - b.idx;
      })
      .map((x) => x.r);
  }

  function thSortProps(tab: Tab, key: string): { 'aria-sort'?: 'ascending' | 'descending' | 'none' } {
    const s = sortByTab[tab];
    if (s.key !== key) return { 'aria-sort': 'none' };
    return { 'aria-sort': s.dir === 'asc' ? 'ascending' : 'descending' };
  }

  function SortHeader({ tab, colKey, label }: { tab: Tab; colKey: string; label: string }) {
    const s = sortByTab[tab];
    const isActive = s.key === colKey;
    const indicator = isActive ? (s.dir === 'asc' ? '▲' : '▼') : '';
    return (
      <button type="button" className="tableSortButton" onClick={() => toggleSort(tab, colKey)} aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className="tableSortIndicator" aria-hidden="true">
          {indicator}
        </span>
      </button>
    );
  }

  function exportElementsCsv() {
    if (!model) return;
    const csv = rowsToCsv(elementRows, [
      { key: 'name', header: 'Name' },
      { key: 'type', header: 'Type' },
      { key: 'layer', header: 'Layer' },
      { key: 'folderPath', header: 'Folder' }
    ]);

    const suffixParts = [layerFilter !== 'all' ? String(layerFilter) : null, typeFilter !== 'all' ? String(typeFilter) : null].filter(Boolean);
    const suffix = suffixParts.length > 0 ? suffixParts.join('-') : 'all';
    const base = `${model.metadata.name}-elements-${suffix}`;
    downloadTextFile(sanitizeFileNameWithExtension(base, 'csv'), csv, 'text/csv');
  }

  function exportViewsCsv() {
    if (!model) return;
    const csv = rowsToCsv(viewRows, [
      { key: 'name', header: 'Name' },
      { key: 'viewpoint', header: 'Viewpoint' },
      { key: 'documentation', header: 'Documentation' },
      { key: 'folderPath', header: 'Folder' }
    ]);
    const base = `${model.metadata.name}-views`;
    downloadTextFile(sanitizeFileNameWithExtension(base, 'csv'), csv, 'text/csv');
  }

  function exportRelationshipsCsv() {
    if (!model) return;
    const csv = rowsToCsv(relationshipRows, [
      { key: 'name', header: 'Name' },
      { key: 'type', header: 'Type' },
      { key: 'source', header: 'Source' },
      { key: 'target', header: 'Target' },
      { key: 'documentation', header: 'Documentation' }
    ]);
    const base = `${model.metadata.name}-relationships`;
    downloadTextFile(sanitizeFileNameWithExtension(base, 'csv'), csv, 'text/csv');
  }

  const sortedElementRows = useMemo(() => {
    const sort = sortByTab.elements;
    return sortRows<ElementReportRow>(elementRows, sort, (r, k) => (r as Record<string, unknown>)[k]);
  }, [elementRows, sortByTab.elements]);

  const sortedViewRows = useMemo(() => {
    const sort = sortByTab.views;
    return sortRows<ViewInventoryRow>(viewRows, sort, (r, k) => (r as Record<string, unknown>)[k]);
  }, [viewRows, sortByTab.views]);

  const sortedRelationshipRows = useMemo(() => {
    const sort = sortByTab.relationships;
    return sortRows<RelationshipReportRow>(relationshipRows, sort, (r, k) => (r as Record<string, unknown>)[k]);
  }, [relationshipRows, sortByTab.relationships]);

  return (
    <div className="workspace" aria-label="Reports workspace">
      <div className="workspaceHeader">
        <h1 className="workspaceTitle">Reports</h1>
        <div className="workspaceTabs" role="tablist" aria-label="Reports tabs">
          <button
            type="button"
            className={`tabButton ${activeTab === 'elements' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={activeTab === 'elements'}
            onClick={() => setActiveTab('elements')}
          >
            Elements
          </button>
          <button
            type="button"
            className={`tabButton ${activeTab === 'views' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={activeTab === 'views'}
            onClick={() => setActiveTab('views')}
          >
            Views
          </button>
          <button
            type="button"
            className={`tabButton ${activeTab === 'relationships' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={activeTab === 'relationships'}
            onClick={() => setActiveTab('relationships')}
          >
            Relationships
          </button>
        </div>
      </div>

      {!model ? (
        <div className="crudSection" style={{ marginTop: 14 }}>
          <div className="crudHeader">
            <div>
              <p className="crudTitle">No model loaded</p>
              <p className="crudHint">Create or open a model to generate reports.</p>
            </div>
          </div>
        </div>
      ) : activeTab === 'elements' ? (
        <section className="crudSection" aria-label="Element list report">
          <div className="crudHeader">
            <div>
              <p className="crudTitle">Element list</p>
              <p className="crudHint">Filter by layer or element type and export as CSV.</p>
            </div>
            <div className="toolbar" aria-label="Element report toolbar">
              <div className="toolbarGroup">
                <label htmlFor="element-report-layer">Layer</label>
                <select
                  id="element-report-layer"
                  className="selectInput"
                  value={layerFilter}
                  onChange={(e) => {
                    const next = e.currentTarget.value as ArchimateLayer | 'all';
                    setLayerFilter(next);
                    // Switching layer changes the available types; reset to All types.
                    setTypeFilter('all');
                  }}
                >
                  <option value="all">All layers</option>
                  {layerOptions.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div className="toolbarGroup">
                <label htmlFor="element-report-type">Element type</label>
                <select
                  id="element-report-type"
                  className="selectInput"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.currentTarget.value as ElementType | 'all')}
                >
                  <option value="all">All types</option>
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="shellButton" onClick={exportElementsCsv} disabled={!canExport}>
                Export as CSV
              </button>
            </div>
          </div>

          <table className="dataTable" aria-label="Element report table">
            <thead>
              <tr>
                <th {...thSortProps('elements', 'name')}><SortHeader tab="elements" colKey="name" label="Name" /></th>
                <th {...thSortProps('elements', 'type')}><SortHeader tab="elements" colKey="type" label="Type" /></th>
                <th {...thSortProps('elements', 'layer')}><SortHeader tab="elements" colKey="layer" label="Layer" /></th>
                <th {...thSortProps('elements', 'folderPath')}><SortHeader tab="elements" colKey="folderPath" label="Folder" /></th>
              </tr>
            </thead>
            <tbody>
              {sortedElementRows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ opacity: 0.8 }}>
                    No matching elements.
                  </td>
                </tr>
              ) : (
                sortedElementRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name || '(unnamed)'}</td>
                    <td className="mono">{r.type}</td>
                    <td>{r.layer}</td>
                    <td>{r.folderPath}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : activeTab === 'views' ? (
        <section className="crudSection" aria-label="View inventory report">
          <div className="crudHeader">
            <div>
              <p className="crudTitle">View inventory</p>
              <p className="crudHint">List all views and export as CSV.</p>
            </div>
            <div className="toolbar" aria-label="View report toolbar">
              <button type="button" className="shellButton" onClick={exportViewsCsv} disabled={!canExport}>
                Export as CSV
              </button>
            </div>
          </div>

          <table className="dataTable" aria-label="View inventory table">
            <thead>
              <tr>
                <th {...thSortProps('views', 'name')}><SortHeader tab="views" colKey="name" label="Name" /></th>
                <th {...thSortProps('views', 'viewpoint')}><SortHeader tab="views" colKey="viewpoint" label="Viewpoint" /></th>
                <th {...thSortProps('views', 'documentation')}><SortHeader tab="views" colKey="documentation" label="Documentation" /></th>
                <th {...thSortProps('views', 'folderPath')}><SortHeader tab="views" colKey="folderPath" label="Folder" /></th>
              </tr>
            </thead>
            <tbody>
              {sortedViewRows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ opacity: 0.8 }}>
                    No views yet.
                  </td>
                </tr>
              ) : (
                sortedViewRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name || '(unnamed)'}</td>
                    <td>{r.viewpoint}</td>
                    <td>{r.documentation}</td>
                    <td>{r.folderPath}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="crudSection" aria-label="Relationship list report">
          <div className="crudHeader">
            <div>
              <p className="crudTitle">Relationship list</p>
              <p className="crudHint">List all relationships and export as CSV.</p>
            </div>
            <div className="toolbar" aria-label="Relationship report toolbar">
              <button type="button" className="shellButton" onClick={exportRelationshipsCsv} disabled={!canExport}>
                Export as CSV
              </button>
            </div>
          </div>

          <table className="dataTable" aria-label="Relationship report table">
            <thead>
              <tr>
                <th {...thSortProps('relationships', 'name')}><SortHeader tab="relationships" colKey="name" label="Name" /></th>
                <th {...thSortProps('relationships', 'type')}><SortHeader tab="relationships" colKey="type" label="Type" /></th>
                <th {...thSortProps('relationships', 'source')}><SortHeader tab="relationships" colKey="source" label="Source" /></th>
                <th {...thSortProps('relationships', 'target')}><SortHeader tab="relationships" colKey="target" label="Target" /></th>
                <th {...thSortProps('relationships', 'documentation')}><SortHeader tab="relationships" colKey="documentation" label="Documentation" /></th>
              </tr>
            </thead>
            <tbody>
              {sortedRelationshipRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ opacity: 0.8 }}>
                    No relationships yet.
                  </td>
                </tr>
              ) : (
                sortedRelationshipRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name || '(unnamed)'}</td>
                    <td className="mono">{r.type}</td>
                    <td>{r.source}</td>
                    <td>{r.target}</td>
                    <td>{r.documentation}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
