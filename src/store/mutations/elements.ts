import type { Element, Model, TaggedValue } from '../../domain';
import {
  createId,
  removeTaggedValue,
  sanitizeUnknownTypeForElement,
  tidyExternalIds,
  upsertTaggedValue
} from '../../domain';
import type { TaggedValueInput } from './helpers';
import { deleteElementInModel, findFolderIdByKind, getFolder } from './helpers';

export function addElement(model: Model, element: Element, folderId?: string): void {
  model.elements[element.id] = element;

  const targetFolderId = folderId ?? findFolderIdByKind(model, 'root');
  const folder = getFolder(model, targetFolderId);
  if (!folder.elementIds.includes(element.id)) {
    model.folders[targetFolderId] = { ...folder, elementIds: [...folder.elementIds, element.id] };
  }
}

export function updateElement(model: Model, elementId: string, patch: Partial<Omit<Element, 'id'>>): void {
  const current = model.elements[elementId];
  if (!current) throw new Error(`Element not found: ${elementId}`);
  const merged = { ...current, ...patch, id: current.id };
  const sanitized = sanitizeUnknownTypeForElement(merged);
  sanitized.externalIds = tidyExternalIds(sanitized.externalIds);
  model.elements[elementId] = sanitized;
}

export function upsertElementTaggedValue(model: Model, elementId: string, entry: TaggedValueInput): void {
  const current = model.elements[elementId];
  if (!current) throw new Error(`Element not found: ${elementId}`);

  const withId: TaggedValue = {
    id: entry.id && entry.id.trim() ? entry.id : createId('tag'),
    ns: entry.ns,
    key: entry.key,
    type: entry.type,
    value: entry.value
  };

  const nextTaggedValues = upsertTaggedValue(current.taggedValues, withId);
  model.elements[elementId] = {
    ...current,
    taggedValues: nextTaggedValues.length ? nextTaggedValues : undefined
  };
}

export function removeElementTaggedValue(model: Model, elementId: string, taggedValueId: string): void {
  const current = model.elements[elementId];
  if (!current) throw new Error(`Element not found: ${elementId}`);

  const nextTaggedValues = removeTaggedValue(current.taggedValues, taggedValueId);
  model.elements[elementId] = {
    ...current,
    taggedValues: nextTaggedValues.length ? nextTaggedValues : undefined
  };
}

export function deleteElement(model: Model, elementId: string): void {
  deleteElementInModel(model, elementId);
}
