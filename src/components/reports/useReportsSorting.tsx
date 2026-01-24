import { useCallback, useState } from 'react';

export type ReportsTab = 'elements' | 'views' | 'relationships';

export type SortDir = 'asc' | 'desc';

export type SortState = {
  key: string;
  dir: SortDir;
};

export type SortByTab = Record<ReportsTab, SortState>;

export function sortRowsStable<T>(
  rows: T[],
  sort: SortState,
  getValue: (row: T, key: string) => unknown
): T[] {
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

export function useReportsSorting(initial?: Partial<SortByTab>) {
  const [sortByTab, setSortByTab] = useState<SortByTab>({
    elements: { key: 'name', dir: 'asc' },
    views: { key: 'name', dir: 'asc' },
    relationships: { key: 'type', dir: 'asc' },
    ...initial
  } as SortByTab);

  const toggleSort = useCallback((tab: ReportsTab, key: string) => {
    setSortByTab((prev) => {
      const cur = prev[tab];
      const nextDir: SortDir = cur.key === key ? (cur.dir === 'asc' ? 'desc' : 'asc') : 'asc';
      return { ...prev, [tab]: { key, dir: nextDir } };
    });
  }, []);

  const thSortProps = useCallback(
    (tab: ReportsTab, key: string): { 'aria-sort'?: 'ascending' | 'descending' | 'none' } => {
      const s = sortByTab[tab];
      if (s.key !== key) return { 'aria-sort': 'none' };
      return { 'aria-sort': s.dir === 'asc' ? 'ascending' : 'descending' };
    },
    [sortByTab]
  );

  function SortHeader({ tab, colKey, label }: { tab: ReportsTab; colKey: string; label: string }) {
    const s = sortByTab[tab];
    const isActive = s.key === colKey;
    const indicator = isActive ? (s.dir === 'asc' ? '▲' : '▼') : '';
    return (
      <button
        type="button"
        className="tableSortButton"
        onClick={() => toggleSort(tab, colKey)}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className="tableSortIndicator" aria-hidden="true">
          {indicator}
        </span>
      </button>
    );
  }

  return {
    sortByTab,
    setSortByTab,
    toggleSort,
    thSortProps,
    SortHeader,
    sortRowsStable
  };
}
