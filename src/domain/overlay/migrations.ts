import { OVERLAY_SCHEMA_VERSION } from './types';
import type { OverlayFile } from './types';

/** Returns the schema version for an overlay file, treating missing as v1. */
export function getOverlayFileSchemaVersion(file: OverlayFile): number {
  const v = file.schemaVersion;
  return typeof v === 'number' && Number.isFinite(v) ? v : 1;
}

/**
 * Migrate an overlay file to the current schema version.
 *
 * For now, v1 is the current schema. This function provides a single hook point
 * for future schema evolution.
 */
export function migrateOverlayFileToCurrent(file: OverlayFile): OverlayFile {
  const from = getOverlayFileSchemaVersion(file);
  if (from > OVERLAY_SCHEMA_VERSION) {
    throw new Error(
      `Overlay import failed: file schemaVersion ${from} is newer than supported version ${OVERLAY_SCHEMA_VERSION}`
    );
  }

  // v1 -> v1 (no-op). Future migrations can be added here:
  // if (from === 1) file = migrateV1ToV2(file)
  // …

  return { ...file, schemaVersion: OVERLAY_SCHEMA_VERSION };
}
