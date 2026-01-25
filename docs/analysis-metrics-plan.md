# Analysis metrics & heatmaps — baseline touchpoints (plan)

This document is a **baseline inventory** of where Analysis is implemented today, plus the **touchpoints** we will extend for heatmaps and score overlays.

The goal is to keep future work small and predictable: each step should be implementable in a single prompt.

## Current touchpoints

### Page / entry
- `src/pages/AnalysisPage.tsx`
  - Wires analysis into the shell and passes `modelKind`, current selection, and `onSelect` callbacks.

### Analysis workspace (UI + local state)
- `src/components/analysis/AnalysisWorkspace.tsx`
  - Owns the Analysis tabs (`related`, `paths`, `traceability`, `matrix`).
  - Owns most Analysis UI state today: filters, matrix row/col sources, maxDepth/maxPaths, etc.
  - Builds Matrix queries (row/col ids + relationshipTypes + direction) and calls `buildRelationshipMatrix`.
  - Loads/saves Matrix presets & snapshots via `matrixPresetsStorage.ts`.

### Query controls
- `src/components/analysis/AnalysisQueryPanel.tsx`
- `src/components/analysis/queryPanel/*`
  - Filter controls for direction / relationship types / layers / element types / depth.
  - (This is where new metric dropdowns/toggles will naturally live.)

### Result rendering
- `src/components/analysis/AnalysisResultTable.tsx`
  - Renders lists of hits and paths.

### Mini-graph rendering
- `src/components/analysis/AnalysisMiniGraph.tsx`
  - Builds `MiniGraphData` via `buildMiniGraphData` and renders it using `MiniColumnGraph`.
  - This is the main touchpoint for **node score overlays** (badges) and **optional node sizing**.

- `src/components/analysis/MiniColumnGraph.tsx`
- `src/components/analysis/MiniGraphOptions.tsx`
- `src/components/analysis/graphLabelLayout.ts`
  - Layout/rendering primitives for the mini column graph.

### Matrix UI
- `src/components/analysis/RelationshipMatrixTable.tsx`
  - Renders the matrix table and exports.
  - This is the main touchpoint for **heatmap shading** and **numeric cell values**.

- `src/components/analysis/RelationshipMatrixCellDialog.tsx`
  - Drill-down UI for relationships in a specific cell.

- `src/components/analysis/exportRelationshipMatrixCsv.ts`
  - CSV export (entire matrix + missing-links list).

- `src/components/analysis/matrixPresetsStorage.ts`
  - Persists presets/snapshots to `localStorage` under keys:
    - `ea-modeller:analysis:matrix:presets:<modelId>`
    - `ea-modeller:analysis:matrix:snapshots:<modelId>`

### Traceability explorer
- `src/components/analysis/TraceabilityExplorer.tsx`
  - Graph expansion UI.

- `src/analysis/traceability/expand.ts`
  - Expansion engine (adapter-aware directedness).

## Domain analysis engine

### Graph + traversal
- `src/domain/analysis/graph.ts` — analysis graph representation
- `src/domain/analysis/traverse.ts` — traversal steps

### Queries
- `src/domain/analysis/queries/relatedElements.ts`
- `src/domain/analysis/queries/pathsBetween.ts`

### Matrix
- `src/domain/analysis/relationshipMatrix.ts`

### Mini-graph projection
- `src/domain/analysis/miniGraph.ts`

## Adapter layer

- `src/analysis/adapters/AnalysisAdapter.ts` — adapter interface
- `src/analysis/adapters/registry.ts` — selects adapter for `modelKind`
- `src/analysis/adapters/archimate.ts` — real facets (layer/type)
- `src/analysis/adapters/bpmn.ts`, `src/analysis/adapters/uml.ts` — generic (currently)

The adapter is the right place to add **semantic score sources** later (e.g. property mappings for risk/lifecycle/cost).

## Store hooks / options normalization

- `src/store/analysis.ts`
  - `stableAnalysisKey(opts)` creates memoization keys for `useAnalysisRelatedElements` and `useAnalysisPathsBetween`.
  - Options include: `direction`, `maxDepth`, `includeStart`, `maxPaths`, `maxPathLength`, `relationshipTypes`, `layers`, `elementTypes`.

Heatmap/overlay options are **not** part of these domain queries today (they will be added separately).

---

## Planned new option keys (for Step 1+)

These are proposed keys for Analysis UI state. Where they live will depend on whether we keep them local to `AnalysisWorkspace` or push some into store/localStorage.

### Matrix metrics + heatmap
- `matrixMetricId: 'off' | 'matrixRelationshipCount' | 'matrixWeightedCount' | …`
- `matrixMetricParams: Record<string, unknown>`
- `matrixHeatmapEnabled: boolean`
- `matrixShowCellValue: boolean` (or `cellValueMode` enum)

### Node score overlay (mini-graph + traceability graphs)
- `nodeOverlayMetricId: 'off' | 'nodeDegree' | 'nodeReach' | 'nodePropertyNumber' | …`
- `nodeOverlayParams: Record<string, unknown>`
- `nodeOverlayRenderMode: 'badge' | 'badge+size'` (start with `'badge'`)
- `nodeOverlayScaleEnabled: boolean` (optional toggle; Step 6)

### Relationship weights (matrix)
- `relationshipTypeWeights: Record<string, number>`
  - Intended for `matrixWeightedCount`.
  - Should be adapter-aware for labels & available types.

## Planned new files (domain)

- `src/domain/analysis/metrics/`
  - `types.ts`, `registry.ts`, `computeNodeMetric.ts`, `computeMatrixMetric.ts`

This keeps scoring logic pure and re-usable for:
- Matrix cell values + heatmap intensity
- Mini-graph node badges and optional sizing

## Notes / constraints

- Keep **visual channels** minimal:
  - Matrix: color intensity + optional numeric value.
  - Graph: badge first; size scaling optional.
- Prefer CSS variables for coloring (do not hardcode palettes in TS).
- Metrics should be computed only for what is visible / needed (avoid O(N^2) work for large models).
