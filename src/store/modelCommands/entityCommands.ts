import type { ModelStoreWiring } from '../modelStoreWiring';

export function createEntityCommands(entityApi: ModelStoreWiring['entityApi']) {
  return {
    newModel: (...args: Parameters<ModelStoreWiring['entityApi']['newModel']>) => entityApi.newModel(...args),
    createEmptyModel: (...args: Parameters<ModelStoreWiring['entityApi']['createEmptyModel']>) => entityApi.createEmptyModel(...args),
    setFileName: (...args: Parameters<ModelStoreWiring['entityApi']['setFileName']>) => entityApi.setFileName(...args),
    markSaved: (...args: Parameters<ModelStoreWiring['entityApi']['markSaved']>) => entityApi.markSaved(...args),
    updateModelMetadata: (...args: Parameters<ModelStoreWiring['entityApi']['updateModelMetadata']>) => entityApi.updateModelMetadata(...args),
    updateModelTaggedValues: (...args: Parameters<ModelStoreWiring['entityApi']['updateModelTaggedValues']>) => entityApi.updateModelTaggedValues(...args),
    addElement: (...args: Parameters<ModelStoreWiring['entityApi']['addElement']>) => entityApi.addElement(...args),
    updateElement: (...args: Parameters<ModelStoreWiring['entityApi']['updateElement']>) => entityApi.updateElement(...args),
    upsertElementTaggedValue: (...args: Parameters<ModelStoreWiring['entityApi']['upsertElementTaggedValue']>) => entityApi.upsertElementTaggedValue(...args),
    removeElementTaggedValue: (...args: Parameters<ModelStoreWiring['entityApi']['removeElementTaggedValue']>) => entityApi.removeElementTaggedValue(...args),
    deleteElement: (...args: Parameters<ModelStoreWiring['entityApi']['deleteElement']>) => entityApi.deleteElement(...args),
    setBpmnElementAttrs: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnElementAttrs']>) => entityApi.setBpmnElementAttrs(...args),
    setBpmnRelationshipAttrs: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnRelationshipAttrs']>) => entityApi.setBpmnRelationshipAttrs(...args),
    setBpmnGatewayDefaultFlow: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnGatewayDefaultFlow']>) => entityApi.setBpmnGatewayDefaultFlow(...args),
    attachBoundaryEvent: (...args: Parameters<ModelStoreWiring['entityApi']['attachBoundaryEvent']>) => entityApi.attachBoundaryEvent(...args),
    setBpmnPoolProcessRef: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnPoolProcessRef']>) => entityApi.setBpmnPoolProcessRef(...args),
    setBpmnLaneFlowNodeRefs: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnLaneFlowNodeRefs']>) => entityApi.setBpmnLaneFlowNodeRefs(...args),
    setBpmnTextAnnotationText: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnTextAnnotationText']>) => entityApi.setBpmnTextAnnotationText(...args),
    setBpmnDataObjectReferenceRef: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnDataObjectReferenceRef']>) => entityApi.setBpmnDataObjectReferenceRef(...args),
    setBpmnDataStoreReferenceRef: (...args: Parameters<ModelStoreWiring['entityApi']['setBpmnDataStoreReferenceRef']>) => entityApi.setBpmnDataStoreReferenceRef(...args),
    addRelationship: (...args: Parameters<ModelStoreWiring['entityApi']['addRelationship']>) => entityApi.addRelationship(...args),
    updateRelationship: (...args: Parameters<ModelStoreWiring['entityApi']['updateRelationship']>) => entityApi.updateRelationship(...args),
    upsertRelationshipTaggedValue: (...args: Parameters<ModelStoreWiring['entityApi']['upsertRelationshipTaggedValue']>) => entityApi.upsertRelationshipTaggedValue(...args),
    removeRelationshipTaggedValue: (...args: Parameters<ModelStoreWiring['entityApi']['removeRelationshipTaggedValue']>) => entityApi.removeRelationshipTaggedValue(...args),
    deleteRelationship: (...args: Parameters<ModelStoreWiring['entityApi']['deleteRelationship']>) => entityApi.deleteRelationship(...args),
    addConnector: (...args: Parameters<ModelStoreWiring['entityApi']['addConnector']>) => entityApi.addConnector(...args),
    updateConnector: (...args: Parameters<ModelStoreWiring['entityApi']['updateConnector']>) => entityApi.updateConnector(...args),
    deleteConnector: (...args: Parameters<ModelStoreWiring['entityApi']['deleteConnector']>) => entityApi.deleteConnector(...args),
  };
}

export type EntityCommands = ReturnType<typeof createEntityCommands>;