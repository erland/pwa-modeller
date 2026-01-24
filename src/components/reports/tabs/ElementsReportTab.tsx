import type { ArchimateLayer, ElementType, ElementReportRow } from '../../../domain';
import type { ReportsTab } from '../useReportsSorting';

type Props = {
  layerFilter: ArchimateLayer | 'all';
  typeFilter: ElementType | 'all';
  layerOptions: ArchimateLayer[];
  typeOptions: ElementType[];
  onChangeLayer: (value: ArchimateLayer | 'all') => void;
  onChangeType: (value: ElementType | 'all') => void;
  onExport: () => void;
  canExport: boolean;

  rows: ElementReportRow[];
  thSortProps: (tab: ReportsTab, key: string) => { 'aria-sort'?: 'ascending' | 'descending' | 'none' };
  SortHeader: (props: { tab: ReportsTab; colKey: string; label: string }) => JSX.Element;
};

export function ElementsReportTab({
  layerFilter,
  typeFilter,
  layerOptions,
  typeOptions,
  onChangeLayer,
  onChangeType,
  onExport,
  canExport,
  rows,
  thSortProps,
  SortHeader
}: Props) {
  return (
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
              onChange={(e) => onChangeLayer(e.currentTarget.value as ArchimateLayer | 'all')}
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
              onChange={(e) => onChangeType(e.currentTarget.value as ElementType | 'all')}
            >
              <option value="all">All types</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="shellButton" onClick={onExport} disabled={!canExport}>
            Export as CSV
          </button>
        </div>
      </div>

      <table className="dataTable" aria-label="Element report table">
        <thead>
          <tr>
            <th {...thSortProps('elements', 'name')}>
              <SortHeader tab="elements" colKey="name" label="Name" />
            </th>
            <th {...thSortProps('elements', 'type')}>
              <SortHeader tab="elements" colKey="type" label="Type" />
            </th>
            <th {...thSortProps('elements', 'layer')}>
              <SortHeader tab="elements" colKey="layer" label="Layer" />
            </th>
            <th {...thSortProps('elements', 'folderPath')}>
              <SortHeader tab="elements" colKey="folderPath" label="Folder" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ opacity: 0.8 }}>
                No matching elements.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
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
  );
}
