import { useMemo, useState } from 'react';

import type {
  ArchimateLayer,
  ElementType,
  RelationshipReportRow,
  ElementReportRow,
  ViewInventoryRow
} from '../../domain';
import { generateElementReport, generateRelationshipReport, generateViewInventoryReport } from '../../domain';
import { useModelStore } from '../../store/useModelStore';

import '../../styles/crud.css';
import { exportReportCsv } from './exportReportCsv';
import { ElementsReportTab } from './tabs/ElementsReportTab';
import { RelationshipsReportTab } from './tabs/RelationshipsReportTab';
import { ViewsReportTab } from './tabs/ViewsReportTab';
import { sortRowsStable, useReportsSorting, type ReportsTab } from './useReportsSorting';

type Tab = ReportsTab;

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

  const { sortByTab, thSortProps, SortHeader } = useReportsSorting();

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

  function exportElementsCsv(sortedRows: ElementReportRow[]) {
    if (!model) return;
    const suffixParts = [layerFilter !== 'all' ? String(layerFilter) : null, typeFilter !== 'all' ? String(typeFilter) : null].filter(Boolean);
    const suffix = suffixParts.length > 0 ? suffixParts.join('-') : 'all';
    exportReportCsv(model.metadata.name, 'elements', sortedRows, [
      { key: 'name', header: 'Name' },
      { key: 'type', header: 'Type' },
      { key: 'layer', header: 'Layer' },
      { key: 'folderPath', header: 'Folder' }
    ], suffix);
  }

  function exportViewsCsv(sortedRows: ViewInventoryRow[]) {
    if (!model) return;
    exportReportCsv(model.metadata.name, 'views', sortedRows, [
      { key: 'name', header: 'Name' },
      { key: 'viewpoint', header: 'Viewpoint' },
      { key: 'documentation', header: 'Documentation' },
      { key: 'folderPath', header: 'Folder' }
    ]);
  }

  function exportRelationshipsCsv(sortedRows: RelationshipReportRow[]) {
    if (!model) return;
    exportReportCsv(model.metadata.name, 'relationships', sortedRows, [
      { key: 'name', header: 'Name' },
      { key: 'type', header: 'Type' },
      { key: 'source', header: 'Source' },
      { key: 'target', header: 'Target' },
      { key: 'documentation', header: 'Documentation' }
    ]);
  }

  const sortedElementRows = useMemo(() => {
    const sort = sortByTab.elements;
    return sortRowsStable<ElementReportRow>(elementRows, sort, (r, k) => (r as Record<string, unknown>)[k]);
  }, [elementRows, sortByTab.elements]);

  const sortedViewRows = useMemo(() => {
    const sort = sortByTab.views;
    return sortRowsStable<ViewInventoryRow>(viewRows, sort, (r, k) => (r as Record<string, unknown>)[k]);
  }, [viewRows, sortByTab.views]);

  const sortedRelationshipRows = useMemo(() => {
    const sort = sortByTab.relationships;
    return sortRowsStable<RelationshipReportRow>(relationshipRows, sort, (r, k) => (r as Record<string, unknown>)[k]);
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
        <ElementsReportTab
          layerFilter={layerFilter}
          typeFilter={typeFilter}
          layerOptions={layerOptions}
          typeOptions={typeOptions}
          onChangeLayer={(next) => {
            setLayerFilter(next);
            // Switching layer changes the available types; reset to All types.
            setTypeFilter('all');
          }}
          onChangeType={(next) => setTypeFilter(next)}
          onExport={() => exportElementsCsv(sortedElementRows)}
          canExport={canExport}
          rows={sortedElementRows}
          thSortProps={thSortProps}
          SortHeader={SortHeader}
        />
      ) : activeTab === 'views' ? (
        <ViewsReportTab
          onExport={() => exportViewsCsv(sortedViewRows)}
          canExport={canExport}
          rows={sortedViewRows}
          thSortProps={thSortProps}
          SortHeader={SortHeader}
        />
      ) : (
        <RelationshipsReportTab
          onExport={() => exportRelationshipsCsv(sortedRelationshipRows)}
          canExport={canExport}
          rows={sortedRelationshipRows}
          thSortProps={thSortProps}
          SortHeader={SortHeader}
        />
      )}
    </div>
  );
}
