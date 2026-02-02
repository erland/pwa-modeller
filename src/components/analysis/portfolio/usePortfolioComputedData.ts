import { useMemo } from 'react';

import type { Element, Model } from '../../../domain';
import { readNumericPropertyFromElement } from '../../../domain';
import { buildAnalysisGraph, buildPortfolioPopulation, computeNodeMetric } from '../../../domain/analysis';
import type { AnalysisAdapter } from '../../../analysis/adapters/AnalysisAdapter';
import { getEffectiveTagsForElement, overlayStore, useOverlayStore } from '../../../store/overlay';

import type { GroupBy, SortDir, SortKey } from './types';
import { percentRounded } from './utils';

type Args = {
  model: Model;
  // Adapter is passed through to buildPortfolioPopulation, which expects a notation-specific adapter.
  adapter: AnalysisAdapter;
  layersSorted: string[];
  typesSorted: string[];
  search: string;
  metricKey: string;
  hideMissingMetric: boolean;
  showDegree: boolean;
  showReach3: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  groupBy: GroupBy;
  hasLayerFacet: boolean;
};

export function usePortfolioComputedData({
  model,
  adapter,
  layersSorted,
  typesSorted,
  search,
  metricKey,
  hideMissingMetric,
  showDegree,
  showReach3,
  sortKey,
  sortDir,
  groupBy,
  hasLayerFacet
}: Args) {
  const overlayVersion = useOverlayStore((s) => s.getVersion());
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

  type Row = (typeof rows)[number];

  const valueByElementId = useMemo(() => {
    if (!metricKey) return {} as Record<string, number | undefined>;
    const out: Record<string, number | undefined> = {};
    const getTaggedValues = (el: Element) => getEffectiveTagsForElement(model, el, overlayStore).effectiveTaggedValues;
    for (const r of rows) {
      out[r.elementId] = readNumericPropertyFromElement(model.elements?.[r.elementId], metricKey, { getTaggedValues });
    }
    return out;
  }, [metricKey, model, rows, overlayVersion]);

  const metricRange = useMemo(() => {
    if (!metricKey) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const r of rows) {
      const v = valueByElementId[r.elementId];
      if (v === undefined) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
  }, [metricKey, rows, valueByElementId]);

  const completeness = useMemo(() => {
    const total = rows.length;
    if (!metricKey) {
      return { total, present: 0, missing: 0, percent: null as number | null };
    }
    let present = 0;
    for (const r of rows) {
      if (valueByElementId[r.elementId] !== undefined) present++;
    }
    const missing = Math.max(0, total - present);
    const percent = percentRounded(present, total);
    return { total, present, missing, percent };
  }, [metricKey, rows, valueByElementId]);

  const displayRows = useMemo(() => {
    if (!metricKey || !hideMissingMetric) return rows;
    return rows.filter((r) => valueByElementId[r.elementId] !== undefined);
  }, [hideMissingMetric, metricKey, rows, valueByElementId]);

  const graph = useMemo(() => buildAnalysisGraph(model), [model]);

  const visibleNodeIds = useMemo(() => displayRows.map((r) => r.elementId), [displayRows]);

  const needsDegree = showDegree || sortKey === 'degree';
  const degreeByElementId = useMemo(() => {
    if (!needsDegree || visibleNodeIds.length === 0) return {} as Record<string, number | undefined>;
    return computeNodeMetric(graph, 'nodeDegree', {
      direction: 'both',
      nodeIds: visibleNodeIds
    });
  }, [graph, needsDegree, visibleNodeIds]);

  const needsReach3 = showReach3 || sortKey === 'reach3';
  const reach3ByElementId = useMemo(() => {
    if (!needsReach3 || visibleNodeIds.length === 0) return {} as Record<string, number | undefined>;
    return computeNodeMetric(graph, 'nodeReach', {
      direction: 'both',
      maxDepth: 3,
      nodeIds: visibleNodeIds
    });
  }, [graph, needsReach3, visibleNodeIds]);

  const rowComparator = useMemo(() => {
    const dirMul = sortDir === 'asc' ? 1 : -1;

    const keyString = (s: string | null | undefined): string => (s ?? '').toString();
    const cmpStr = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

    return (a: Row, b: Row): number => {
      if (sortKey === 'name') return cmpStr(a.label, b.label) * dirMul;
      // For secondary comparisons (tie-breakers), always use Name asc to keep ordering predictable.
      if (sortKey === 'type') return cmpStr(a.typeLabel, b.typeLabel) * dirMul || cmpStr(a.label, b.label);
      if (sortKey === 'layer') return cmpStr(keyString(a.layerLabel), keyString(b.layerLabel)) * dirMul || cmpStr(a.label, b.label);
      if (sortKey === 'degree') {
        const av = degreeByElementId[a.elementId];
        const bv = degreeByElementId[b.elementId];
        const aMissing = av === undefined;
        const bMissing = bv === undefined;
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        if (av === undefined || bv === undefined) return cmpStr(a.label, b.label);
        if (av !== bv) return (av - bv) * dirMul;
        return cmpStr(a.label, b.label);
      }
      if (sortKey === 'reach3') {
        const av = reach3ByElementId[a.elementId];
        const bv = reach3ByElementId[b.elementId];
        const aMissing = av === undefined;
        const bMissing = bv === undefined;
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        if (av === undefined || bv === undefined) return cmpStr(a.label, b.label);
        if (av !== bv) return (av - bv) * dirMul;
        return cmpStr(a.label, b.label);
      }
      // metric
      const av = metricKey ? valueByElementId[a.elementId] : undefined;
      const bv = metricKey ? valueByElementId[b.elementId] : undefined;
      // Keep missing values at the bottom regardless of sort direction.
      const aMissing = av === undefined;
      const bMissing = bv === undefined;
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (av === undefined || bv === undefined) return cmpStr(a.label, b.label);
      if (av !== bv) return (av - bv) * dirMul;
      return cmpStr(a.label, b.label);
    };
  }, [degreeByElementId, metricKey, reach3ByElementId, sortDir, sortKey, valueByElementId]);

  const sortedRows = useMemo(() => {
    // Stable sort.
    return displayRows
      .map((r, i) => ({ r, i }))
      .sort((a, b) => rowComparator(a.r, b.r) || a.i - b.i)
      .map((x) => x.r);
  }, [displayRows, rowComparator]);

  type Group = {
    key: string;
    rows: (typeof sortedRows)[number][];
    rollup: { count: number; sum: number | null; avg: number | null; missing: number };
  };

  const grouped = useMemo((): Group[] | null => {
    if (groupBy === 'none') return null;
    if (groupBy === 'layer' && !hasLayerFacet) return null;

    const keyForRow = (r: (typeof sortedRows)[number]): string => {
      if (groupBy === 'type') return r.typeLabel;
      return r.layerLabel ?? '—';
    };

    const groups = new Map<string, (typeof sortedRows)[number][]>();
    for (const r of sortedRows) {
      const k = keyForRow(r);
      const cur = groups.get(k);
      if (cur) cur.push(r);
      else groups.set(k, [r]);
    }

    const groupKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const indexById: Record<string, number> = {};
    for (let i = 0; i < displayRows.length; i++) indexById[displayRows[i].elementId] = i;

    const stableSort = (arr: (typeof sortedRows)[number][]): (typeof sortedRows)[number][] =>
      arr
        .map((r) => ({ r, i: indexById[r.elementId] ?? 0 }))
        .sort((a, b) => rowComparator(a.r, b.r) || a.i - b.i)
        .map((x) => x.r);

    return groupKeys.map((k) => {
      const rowsInGroup = stableSort(groups.get(k) ?? []);
      let sum = 0;
      let present = 0;
      let missing = 0;
      if (metricKey) {
        for (const r of rowsInGroup) {
          const v = valueByElementId[r.elementId];
          if (v === undefined) missing++;
          else {
            present++;
            sum += v;
          }
        }
      }
      const avg = metricKey && present > 0 ? sum / present : null;
      return {
        key: k,
        rows: rowsInGroup,
        rollup: { count: rowsInGroup.length, sum: metricKey ? sum : null, avg, missing: metricKey ? missing : 0 }
      };
    });
  }, [displayRows, groupBy, hasLayerFacet, metricKey, rowComparator, sortedRows, valueByElementId]);

  const tableRows = useMemo(() => {
    if (!grouped) return sortedRows;
    return grouped.flatMap((g) => g.rows);
  }, [grouped, sortedRows]);

  return {
    rows,
    displayRows,
    valueByElementId,
    metricRange,
    completeness,
    degreeByElementId,
    reach3ByElementId,
    grouped,
    tableRows
  };
}
