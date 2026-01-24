import type { RelationshipReportRow } from '../../../domain';
import { getRelationshipTypeLabel } from '../../../domain';
import type { ReportsTab } from '../useReportsSorting';

type Props = {
  onExport: () => void;
  canExport: boolean;
  rows: RelationshipReportRow[];
  thSortProps: (tab: ReportsTab, key: string) => { 'aria-sort'?: 'ascending' | 'descending' | 'none' };
  SortHeader: (props: { tab: ReportsTab; colKey: string; label: string }) => JSX.Element;
};

export function RelationshipsReportTab({ onExport, canExport, rows, thSortProps, SortHeader }: Props) {
  return (
    <section className="crudSection" aria-label="Relationship list report">
      <div className="crudHeader">
        <div>
          <p className="crudTitle">Relationship list</p>
          <p className="crudHint">List all relationships and export as CSV.</p>
        </div>
        <div className="toolbar" aria-label="Relationship report toolbar">
          <button type="button" className="shellButton" onClick={onExport} disabled={!canExport}>
            Export as CSV
          </button>
        </div>
      </div>

      <table className="dataTable" aria-label="Relationship report table">
        <thead>
          <tr>
            <th {...thSortProps('relationships', 'name')}>
              <SortHeader tab="relationships" colKey="name" label="Name" />
            </th>
            <th {...thSortProps('relationships', 'type')}>
              <SortHeader tab="relationships" colKey="type" label="Type" />
            </th>
            <th {...thSortProps('relationships', 'source')}>
              <SortHeader tab="relationships" colKey="source" label="Source" />
            </th>
            <th {...thSortProps('relationships', 'target')}>
              <SortHeader tab="relationships" colKey="target" label="Target" />
            </th>
            <th {...thSortProps('relationships', 'documentation')}>
              <SortHeader tab="relationships" colKey="documentation" label="Documentation" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ opacity: 0.8 }}>
                No relationships yet.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name || '(unnamed)'}</td>
                <td title={r.type}>{getRelationshipTypeLabel(r.type)}</td>
                <td>{r.source}</td>
                <td>{r.target}</td>
                <td>{r.documentation}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
