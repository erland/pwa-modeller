/**
 * Map BPMN 2.0 XML element localName (lowercased) to the internal BPMN type id used by the modeller.
 *
 * NOTE: The XML helper `localName(el)` already lowercases, but we keep this function defensive.
 */
export function bpmnTypeForNodeLocalName(name: string): string | null {
  const nameLc = (name ?? '').toLowerCase();

  switch (nameLc) {
    // Containers
    case 'participant':
      return 'bpmn.pool';
    case 'lane':
      return 'bpmn.lane';

    // Activities
    case 'task':
      return 'bpmn.task';
    case 'usertask':
      return 'bpmn.userTask';
    case 'servicetask':
      return 'bpmn.serviceTask';
    case 'scripttask':
      return 'bpmn.scriptTask';
    case 'manualtask':
      return 'bpmn.manualTask';
    case 'callactivity':
      return 'bpmn.callActivity';
    case 'subprocess':
      return 'bpmn.subProcess';

    // Events
    case 'startevent':
      return 'bpmn.startEvent';
    case 'endevent':
      return 'bpmn.endEvent';
    case 'intermediatecatchevent':
      return 'bpmn.intermediateCatchEvent';
    case 'intermediatethrowevent':
      return 'bpmn.intermediateThrowEvent';
    case 'boundaryevent':
      return 'bpmn.boundaryEvent';

    // Gateways
    case 'exclusivegateway':
      return 'bpmn.gatewayExclusive';
    case 'parallelgateway':
      return 'bpmn.gatewayParallel';
    case 'inclusivegateway':
      return 'bpmn.gatewayInclusive';
    case 'eventbasedgateway':
      return 'bpmn.gatewayEventBased';

    // Global definitions (not flow nodes, but referenced by event definitions)
    case 'message':
      return 'bpmn.message';
    case 'signal':
      return 'bpmn.signal';
    case 'error':
      return 'bpmn.error';
    case 'escalation':
      return 'bpmn.escalation';

    // Artifacts / data
    case 'textannotation':
      return 'bpmn.textAnnotation';
    case 'dataobjectreference':
      return 'bpmn.dataObjectReference';
    case 'datastorereference':
      return 'bpmn.dataStoreReference';
    case 'group':
      return 'bpmn.group';

    default:
      return null;
  }
}
