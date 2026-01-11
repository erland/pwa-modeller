import type { Model } from '../../domain';
import { isRecord } from './utils';
import { migrateModel } from './migrations';
import {
  ensureModelFolderExtensions,
  sanitizeModelExternalIds,
  sanitizeModelRelationshipAttrs,
  sanitizeModelTaggedValues,
  sanitizeModelUnknownTypes,
  sanitizeModelViewConnections,
} from './sanitize';

/**
 * Deserialize a model from JSON.
 *
 * Future versions should be able to read older models.
 */
export function deserializeModel(json: string): Model {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed)) throw new Error('Invalid model file (expected an object)');
  if (typeof parsed.id !== 'string' || parsed.id.trim().length === 0) {
    throw new Error('Invalid model file (missing id)');
  }
  if (!isRecord(parsed.metadata) || typeof parsed.metadata.name !== 'string') {
    throw new Error('Invalid model file (missing metadata.name)');
  }
  if (!isRecord(parsed.elements) || !isRecord(parsed.relationships) || !isRecord(parsed.views) || !isRecord(parsed.folders)) {
    throw new Error('Invalid model file (missing collections)');
  }

  return ensureModelFolderExtensions(
    sanitizeModelViewConnections(
      sanitizeModelRelationshipAttrs(
        sanitizeModelUnknownTypes(
          sanitizeModelExternalIds(
            sanitizeModelTaggedValues(migrateModel(parsed as unknown as Model))
          )
        )
      )
    )
  );

}
