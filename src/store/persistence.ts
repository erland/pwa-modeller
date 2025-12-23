import type { Model } from '../domain/types';

export function serializeModel(model: Model): string {
  return JSON.stringify(model, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deserializeModel(data: string): Model {
  const parsed: unknown = JSON.parse(data);
  if (!isRecord(parsed)) {
    throw new Error('Invalid model: root is not an object');
  }

  const id = parsed.id;
  const metadata = parsed.metadata;
  const elements = parsed.elements;
  const relationships = parsed.relationships;
  const views = parsed.views;
  const folders = parsed.folders;
  const schemaVersion = parsed.schemaVersion;

  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('Invalid model: id is missing');
  }
  if (!isRecord(metadata) || typeof metadata.name !== 'string' || metadata.name.trim().length === 0) {
    throw new Error('Invalid model: metadata.name is missing');
  }
  if (!isRecord(elements)) throw new Error('Invalid model: elements must be an object');
  if (!isRecord(relationships)) throw new Error('Invalid model: relationships must be an object');
  if (!isRecord(views)) throw new Error('Invalid model: views must be an object');
  if (!isRecord(folders)) throw new Error('Invalid model: folders must be an object');

  return {
    id,
    metadata: {
      name: metadata.name,
      description: typeof metadata.description === 'string' ? metadata.description : undefined,
      version: typeof metadata.version === 'string' ? metadata.version : undefined,
      owner: typeof metadata.owner === 'string' ? metadata.owner : undefined
    },
    // Trust the payload for now; deeper validation/migrations can be added later.
    elements: elements as Model['elements'],
    relationships: relationships as Model['relationships'],
    views: views as Model['views'],
    folders: folders as Model['folders'],
    schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : 1
  };
}
