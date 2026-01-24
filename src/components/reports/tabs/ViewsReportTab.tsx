import type { ViewInventoryRow } from '../../../domain';
import type { ReportsTab } from '../useReportsSorting';

type Props = {
  onExport: () => void;
  canExport: boolean;
  rows: ViewInventoryRow[];
  thSortProps: (tab: ReportsTab, key: string) => { 'aria-sort'?: 'ascending' | 'descending' | 'none' };
  SortHeader: (props: { tab: ReportsTab; colKey: string; label: string }) => JSX.Element;
};

export function ViewsReportTab({ onExport, canExport, rows, thSortProps, SortHeader }: Props) {
  return (
    <section className="crudSection" aria-label="View inventory report">
      <div className="crudHeader">
        <div>
          <p className="crudTitle">View inventory</p>
          <p className="crudHint">List all views and export as CSV.</p>
        </div>
        <div className="toolbar" aria-label="View report toolbar">
          <button type="button" className="shellButton" onClick={onExport} disabled={!canExport}>
            Export as CSV
          </button>
        </div>
      </div>

      <table className="dataTable" aria-label="View inventory table">
        <thead>
          <tr>
            <th {...thSortProps('views', 'name')}>
              <SortHeader tab="views" colKey="name" label="Name" />
            </th>
            <th {...thSortProps('views', 'viewpoint')}>
              <SortHeader tab="views" colKey="viewpoint" label="Viewpoint" />
            </th>
            <th {...thSortProps('views', 'documentation')}>
              <SortHeader tab="views" colKey="documentation" label="Documentation" />
            </th>
            <th {...thSortProps('views', 'folderPath')}>
              <SortHeader tab="views" colKey="folderPath" label="Folder" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ opacity: 0.8 }}>
                No views yet.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
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
  );
}
