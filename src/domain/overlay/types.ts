/**
 * Overlay domain types.
 *
 * The overlay is stored separately from the imported "core" model.
 * Matching is performed via the app's existing external-id mechanism:
 * `ExternalIdRef` + `externalKey(ref)`.
 */

/** Canonical JSON overlay file format id (v1). */
export const OVERLAY_FILE_FORMAT_V1 = 'pwa-modeller-overlay@1' as const;

/**
 * Overlay schema version.
 *
 * This is independent from the file format id string. We keep it as a number so we can
 * introduce migrations over time (e.g. new tag conventions, new meta fields, etc.).
 */
export const OVERLAY_SCHEMA_VERSION = 1 as const;

/**
 * On-disk external reference used by overlay files.
 *
 * - `scheme` is typically the exporter/importer name (e.g. `archimate-meff`, `xmi`).
 * - `value` is a stable external id (e.g. `EAID_…`).
 *
 * Implementation detail:
 * The core model uses `ExternalIdRef { system, id, scope? }`.
 * We support encoding `scope` in `scheme` as: `"<system>@<scope>"`.
 */
export type OverlayExternalRef = {
  scheme: string;
  value: string;
};

/**
 * A normalized, de-duplicated, stably-sorted list of overlay refs.
 *
 * Normalization rules are implemented in `normalizeOverlayRefs`.
 */
export type OverlayExternalRefSet = OverlayExternalRef[];

export type OverlayTargetKind = 'element' | 'relationship';

export type OverlayTarget = {
  kind: OverlayTargetKind;
  externalRefs: OverlayExternalRefSet;
};

export type OverlayTagPrimitive = string | number | boolean | null;

// Recursive JSON-ish value type.
//
// NOTE: Some TS versions report TS2456 (circularly references itself) for recursive type
// aliases when the object branch is expressed via `Record<…>`. Using an interface for
// the object branch keeps the recursion legal.
export interface OverlayTagObject {
  [key: string]: OverlayTagValue;
}
export type OverlayTagValue = OverlayTagPrimitive | OverlayTagValue[] | OverlayTagObject;

export type OverlayEntryMeta = {
  source?: 'manual' | 'import' | 'survey' | 'observed' | 'inferred' | string;
  confidence?: 'low' | 'medium' | 'high' | string;
  lastVerified?: string; // ISO date (or datetime)
  note?: string;
};

export type OverlayEntry = {
  /** Optional stable id for the entry (used by in-memory store + persistence). */
  entryId?: string;
  target: OverlayTarget;
  tags: Record<string, OverlayTagValue>;
  meta?: OverlayEntryMeta;
};

export type OverlayModelHint = {
  name?: string;
  signature?: string;
};

export type OverlayFile = {
  format: typeof OVERLAY_FILE_FORMAT_V1 | string;
  /** Optional schema version; if missing, it is treated as version 1. */
  schemaVersion?: number;
  createdAt: string;
  modelHint?: OverlayModelHint;
  entries: OverlayEntry[];
};
