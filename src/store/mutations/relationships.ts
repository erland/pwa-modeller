import type { Model, Relationship, TaggedValue } from '../../domain';
import {
  createId,
  removeTaggedValue,
  sanitizeRelationshipAttrs,
  sanitizeUnknownTypeForRelationship,
  tidyExternalIds,
  upsertTaggedValue
} from '../../domain';
import type { TaggedValueInput } from './helpers';
import { deleteRelationshipInModel, findFolderContainingElement, findFolderIdByKind, getFolder } from './helpers';

export function addRelationship(model: Model, relationship: Relationship): void {
  model.relationships[relationship.id] = relationship;

  // Place the relationship in the same folder as the source element (fallback to root).
  const sourceId = relationship.sourceElementId;
  const targetFolderId = sourceId
    ? findFolderContainingElement(model, sourceId) ?? findFolderIdByKind(model, 'root')
    : findFolderIdByKind(model, 'root');

  const folder = getFolder(model, targetFolderId) as any;
  const relIds: string[] = Array.isArray(folder.relationshipIds) ? folder.relationshipIds : [];
  if (!relIds.includes(relationship.id)) {
    model.folders[targetFolderId] = { ...folder, relationshipIds: [...relIds, relationship.id] };
  }
}

export function updateRelationship(model: Model, relationshipId: string, patch: Partial<Omit<Relationship, 'id'>>): void {
  const current = model.relationships[relationshipId];
  if (!current) throw new Error(`Relationship not found: ${relationshipId}`);

  const merged = { ...current, ...patch, id: current.id };
  merged.attrs = sanitizeRelationshipAttrs(merged.type, merged.attrs);
  const sanitized = sanitizeUnknownTypeForRelationship(merged);
  sanitized.externalIds = tidyExternalIds(sanitized.externalIds);
  model.relationships[relationshipId] = sanitized;
}

export function upsertRelationshipTaggedValue(model: Model, relationshipId: string, entry: TaggedValueInput): void {
  const current = model.relationships[relationshipId];
  if (!current) throw new Error(`Relationship not found: ${relationshipId}`);

  const withId: TaggedValue = {
    id: entry.id && entry.id.trim() ? entry.id : createId('tag'),
    ns: entry.ns,
    key: entry.key,
    type: entry.type,
    value: entry.value
  };

  const nextTaggedValues = upsertTaggedValue(current.taggedValues, withId);
  model.relationships[relationshipId] = {
    ...current,
    taggedValues: nextTaggedValues.length ? nextTaggedValues : undefined
  };
}

export function removeRelationshipTaggedValue(model: Model, relationshipId: string, taggedValueId: string): void {
  const current = model.relationships[relationshipId];
  if (!current) throw new Error(`Relationship not found: ${relationshipId}`);

  const nextTaggedValues = removeTaggedValue(current.taggedValues, taggedValueId);
  model.relationships[relationshipId] = {
    ...current,
    taggedValues: nextTaggedValues.length ? nextTaggedValues : undefined
  };
}

export function deleteRelationship(model: Model, relationshipId: string): void {
  deleteRelationshipInModel(model, relationshipId);
}
