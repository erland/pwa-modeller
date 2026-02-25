import type {
  Element,
  Model,
  ModelMetadata,
  Relationship,
  RelationshipConnector,
  TaggedValue,
} from '../domain';
import { createEmptyModel } from '../domain';

import {
  connectorMutations,
  elementMutations,
  modelMutations,
  bpmnMutations,
  relationshipMutations,
} from './mutations';
import type { TaggedValueInput } from './mutations';

import type { ModelStoreState } from './modelStoreTypes';
import type { ChangeSetRecorder } from './changeSetRecorder';

export type ModelStoreEntityApiDeps = {
  setState: (next: Partial<ModelStoreState>) => void;
  updateModel: (mutator: (model: Model) => void, markDirty?: boolean) => void;
  changeSetRecorder: ChangeSetRecorder;
};

/**
 * Extracted entity-level ModelStore API (metadata, elements, BPMN attrs,
 * relationships, connectors). Keeps `modelStore.ts` smaller and focused.
 */
export function createModelStoreEntityApi(deps: ModelStoreEntityApiDeps) {
  const { setState, updateModel, changeSetRecorder } = deps;

  return {
    // -------------------------
    // Model / metadata
    // -------------------------
    newModel: (metadata: ModelMetadata): void => {
      const model = createEmptyModel(metadata);
      setState({ model, fileName: null, isDirty: false });
    },

    /** Backwards-compatible alias used by tests/earlier steps. */
    createEmptyModel: (metadata: ModelMetadata): void => {
      const model = createEmptyModel(metadata);
      setState({ model, fileName: null, isDirty: false });
    },

    setFileName: (fileName: string | null): void => {
      setState({ fileName });
    },

    markSaved: (): void => {
      setState({ isDirty: false });
    },

    updateModelMetadata: (patch: Partial<ModelMetadata>): void => {
      changeSetRecorder.markModelMetadataChanged();
      updateModel((model) => modelMutations.updateModelMetadata(model, patch));
    },

    updateModelTaggedValues: (taggedValues: TaggedValue[] | undefined): void => {
      changeSetRecorder.markModelMetadataChanged();
      updateModel((model) => modelMutations.updateModelTaggedValues(model, taggedValues));
    },

    // -------------------------
    // Elements
    // -------------------------
    addElement: (element: Element, folderId?: string): void => {
      changeSetRecorder.upsertElement(element.id);
      updateModel((model) => elementMutations.addElement(model, element, folderId));
    },

    updateElement: (elementId: string, patch: Partial<Omit<Element, 'id'>>): void => {
      changeSetRecorder.upsertElement(elementId);
      updateModel((model) => elementMutations.updateElement(model, elementId, patch));
    },

    upsertElementTaggedValue: (elementId: string, entry: TaggedValueInput): void => {
      changeSetRecorder.upsertElement(elementId);
      updateModel((model) => elementMutations.upsertElementTaggedValue(model, elementId, entry));
    },

    removeElementTaggedValue: (elementId: string, taggedValueId: string): void => {
      changeSetRecorder.upsertElement(elementId);
      updateModel((model) => elementMutations.removeElementTaggedValue(model, elementId, taggedValueId));
    },

    deleteElement: (elementId: string): void => {
      changeSetRecorder.deleteElement(elementId);
      updateModel((model) => elementMutations.deleteElement(model, elementId));
    },

    // -------------------------
    // BPMN helpers (semantic attrs)
    // -------------------------
    setBpmnElementAttrs: (elementId: string, patch: Record<string, unknown>): void => {
      changeSetRecorder.upsertElement(elementId);
      updateModel((model) => bpmnMutations.setBpmnElementAttrs(model, elementId, patch));
    },

    setBpmnRelationshipAttrs: (relationshipId: string, patch: Record<string, unknown>): void => {
      changeSetRecorder.upsertRelationship(relationshipId);
      updateModel((model) => bpmnMutations.setBpmnRelationshipAttrs(model, relationshipId, patch));
    },

    setBpmnGatewayDefaultFlow: (gatewayId: string, relationshipId: string | null): void => {
      changeSetRecorder.upsertElement(gatewayId);
      if (relationshipId) changeSetRecorder.upsertRelationship(relationshipId);
      updateModel((model) => bpmnMutations.setGatewayDefaultFlow(model, gatewayId, relationshipId));
    },

    attachBoundaryEvent: (boundaryId: string, hostActivityId: string | null): void => {
      changeSetRecorder.upsertElement(boundaryId);
      if (hostActivityId) changeSetRecorder.upsertElement(hostActivityId);
      updateModel((model) => bpmnMutations.attachBoundaryEvent(model, boundaryId, hostActivityId));
    },

    setBpmnPoolProcessRef: (poolId: string, processId: string | null): void => {
      changeSetRecorder.upsertElement(poolId);
      if (processId) changeSetRecorder.upsertElement(processId);
      updateModel((model) => bpmnMutations.setPoolProcessRef(model, poolId, processId));
    },

    setBpmnLaneFlowNodeRefs: (laneId: string, nodeIds: string[]): void => {
      changeSetRecorder.upsertElement(laneId);
      for (const id of nodeIds) changeSetRecorder.upsertElement(id);
      updateModel((model) => bpmnMutations.setLaneFlowNodeRefs(model, laneId, nodeIds));
    },

    setBpmnTextAnnotationText: (annotationId: string, text: string): void => {
      changeSetRecorder.upsertElement(annotationId);
      updateModel((model) => bpmnMutations.setTextAnnotationText(model, annotationId, text));
    },

    setBpmnDataObjectReferenceRef: (refId: string, dataObjectId: string | null): void => {
      changeSetRecorder.upsertElement(refId);
      if (dataObjectId) changeSetRecorder.upsertElement(dataObjectId);
      updateModel((model) => bpmnMutations.setDataObjectReferenceRef(model, refId, dataObjectId));
    },

    setBpmnDataStoreReferenceRef: (refId: string, dataStoreId: string | null): void => {
      changeSetRecorder.upsertElement(refId);
      if (dataStoreId) changeSetRecorder.upsertElement(dataStoreId);
      updateModel((model) => bpmnMutations.setDataStoreReferenceRef(model, refId, dataStoreId));
    },

    // -------------------------
    // Relationships
    // -------------------------
    addRelationship: (relationship: Relationship, folderId?: string): void => {
      changeSetRecorder.upsertRelationship(relationship.id);
      updateModel((model) => relationshipMutations.addRelationship(model, relationship, folderId));
    },

    updateRelationship: (relationshipId: string, patch: Partial<Omit<Relationship, 'id'>>): void => {
      changeSetRecorder.upsertRelationship(relationshipId);
      updateModel((model) => relationshipMutations.updateRelationship(model, relationshipId, patch));
    },

    upsertRelationshipTaggedValue: (relationshipId: string, entry: TaggedValueInput): void => {
      changeSetRecorder.upsertRelationship(relationshipId);
      updateModel((model) => relationshipMutations.upsertRelationshipTaggedValue(model, relationshipId, entry));
    },

    removeRelationshipTaggedValue: (relationshipId: string, taggedValueId: string): void => {
      changeSetRecorder.upsertRelationship(relationshipId);
      updateModel((model) => relationshipMutations.removeRelationshipTaggedValue(model, relationshipId, taggedValueId));
    },

    deleteRelationship: (relationshipId: string): void => {
      changeSetRecorder.deleteRelationship(relationshipId);
      updateModel((model) => relationshipMutations.deleteRelationship(model, relationshipId));
    },

    // -------------------------
    // Relationship connectors (junctions)
    // -------------------------
    addConnector: (connector: RelationshipConnector): void => {
      changeSetRecorder.upsertConnector(connector.id);
      updateModel((model) => connectorMutations.addConnector(model, connector));
    },

    updateConnector: (connectorId: string, patch: Partial<Omit<RelationshipConnector, 'id'>>): void => {
      changeSetRecorder.upsertConnector(connectorId);
      updateModel((model) => connectorMutations.updateConnector(model, connectorId, patch));
    },

    deleteConnector: (connectorId: string): void => {
      changeSetRecorder.deleteConnector(connectorId);
      updateModel((model) => connectorMutations.deleteConnector(model, connectorId));
    },
  };
}
