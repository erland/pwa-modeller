import type { Model, ModelMetadata, TaggedValue } from '../../domain';
import { tidyTaggedValuesFromUi } from './helpers';

export function updateModelMetadata(model: Model, patch: Partial<ModelMetadata>): void {
  model.metadata = { ...model.metadata, ...patch };
}

export function updateModelTaggedValues(model: Model, taggedValues: TaggedValue[] | undefined): void {
  model.taggedValues = tidyTaggedValuesFromUi(taggedValues);
}
