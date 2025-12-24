import { useMemo, useState } from 'react';

import type { ElementReportCategoryId } from '../../domain';
import { generateElementReport, generateViewInventoryReport, rowsToCsv } from '../../domain';
import { downloadTextFile, sanitizeFileNameWithExtension } from '../../store';
import { useModelStore } from '../../store/useModelStore';

import '../../styles/crud.css';

type Tab = 'elements' | 'views';

const ELEMENT_CATEGORIES: Array<{ id: ElementReportCategoryId; label: string }> = [
  { id: 'all', label: 'All elements' },
  { id: 'BusinessProcess', label: 'Business Processes' },
  { id: 'ApplicationComponent', label: 'Application Components' },
  { id: 'Capability', label: 'Capabilities' }
];

export function ReportsWorkspace() {
  const model = useModelStore((s) => s.model);

  const [activeTab, setActiveTab] = useState<Tab>('elements');
  const [category, setCategory] = useState<ElementReportCategoryId>('all');

  const elementRows = useMemo(() => (model ? generateElementReport(model, category) : []), [model, category]);
  const viewRows = useMemo(() => (model ? generateViewInventoryReport(model) : []), [model]);

  const canExport = Boolean(model);

  function exportElementsCsv() {
    if (!model) return;
    const csv = rowsToCsv(elementRows, [
      { key: 'name', header: 'Name' },
      { key: 'type', header: 'Type' },
      { key: 'layer', header: 'Layer' },
      { key: 'folderPath', header: 'Folder' }
    ]);
    const base = `${model.metadata.name}-elements-${category === 'all' ? 'all' : category}`;
    downloadTextFile(sanitizeFileNameWithExtension(base, 'csv'), csv, 'text/csv');
  }

  function exportViewsCsv() {
    if (!model) return;
    const csv = rowsToCsv(viewRows, [
      { key: 'name', header: 'Name' },
      { key: 'viewpoint', header: 'Viewpoint' },
      { key: 'description', header: 'Description' },
      { key: 'folderPath', header: 'Folder' }
    ]);
    const base = `${model.metadata.name}-views`;
    downloadTextFile(sanitizeFileNameWithExtension(base, 'csv'), csv, 'text/csv');
  }

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
              <p className="crudHint">Filter by a common element category and export as CSV.</p>
            </div>
            <div className="toolbar" aria-label="Element report toolbar">
              <div className="toolbarGroup">
                <label htmlFor="element-report-category">Category</label>
                <select
                  id="element-report-category"
                  className="selectInput"
                  value={category}
                  onChange={(e) => setCategory(e.currentTarget.value as ElementReportCategoryId)}
                >
                  {ELEMENT_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
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
                <th>Name</th>
                <th>Type</th>
                <th>Layer</th>
                <th>Folder</th>
              </tr>
            </thead>
            <tbody>
              {elementRows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ opacity: 0.8 }}>
                    No matching elements.
                  </td>
                </tr>
              ) : (
                elementRows.map((r) => (
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
      ) : (
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
                <th>Name</th>
                <th>Viewpoint</th>
                <th>Description</th>
                <th>Folder</th>
              </tr>
            </thead>
            <tbody>
              {viewRows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ opacity: 0.8 }}>
                    No views yet.
                  </td>
                </tr>
              ) : (
                viewRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name || '(unnamed)'}</td>
                    <td>{r.viewpoint}</td>
                    <td>{r.description}</td>
                    <td>{r.folderPath}</td>
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
