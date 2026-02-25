# Storage scope policy

This document clarifies which parts of the application state are **dataset-scoped** vs **user-scoped**.

The goal is to make it safe to introduce a future **central/shared storage backend** (real-time collaboration, branching/merging) without accidentally syncing personal UI state.

## Definitions

- **Dataset-scoped**: state that belongs to a specific dataset (model + views) and must be persisted/restored when opening that dataset. In a future server-backed mode, this is the state that will be shared.
- **User-scoped**: state that is local to a browser/device (or user profile) and is **not shared**. It may still be keyed by model/dataset identifiers for convenience, but it remains local-only.

## Dataset-scoped in this PWA

### Model workspace

The following are **dataset-scoped**:

- **Model**: elements, relationships, folders, and dataset-level metadata.
- **Views/diagrams**: node positions, sizes, bendpoints, view objects and presentation state that is part of the model snapshot.

Persistence mechanism:

- Dataset snapshots are stored via `DatasetBackend` (currently IndexedDB via `IndexedDbBackend`, with legacy migration from `localStorage`).

Keys/locations:

- IndexedDB database (see `src/store/datasets/local/indexedDb.ts`).
- Legacy `localStorage` key (migration only): `pwa-modeller:storeState:v2`.

## User-scoped (local-only)

These areas are explicitly **local-only** (not intended for server syncing):

### Overlays

- Overlay entries, required tag configuration, and overlay export markers.
- Stored locally and **keyed by model signature** (computed from the model).

Keys/locations:

- `pwa-modeller:overlayState:v2:<modelSignature>` (with legacy v1 migration)
- `pwa-modeller:overlayExportMarker:v1:<modelSignature>`

### Analysis workspace

- Analysis UI state, presets, and session-like state.
- Stored in `localStorage` and remains local-only.

Examples of keys/locations:

- `ea-modeller:analysis:ui:<modelId>`
- Matrix/portfolio/traceability localStorage keys under `src/components/analysis/*`

### Other user preferences

Examples:

- Shell panel widths
- Theme choice
- Portal/publisher settings

These remain user-scoped and are not part of dataset snapshots.

## Migration notes

- The dataset registry is stored in localStorage and is user-scoped, but it references dataset IDs for local management.
- When server mode is introduced, the registry will likely hold both local datasets and remote dataset references.
