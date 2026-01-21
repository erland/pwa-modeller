// Default node sizes for BPMN views.

export function defaultBpmnNodeSize(elementType: string): { width: number; height: number } {
  // Containers
  if (elementType === 'bpmn.pool') return { width: 680, height: 300 };
  if (elementType === 'bpmn.lane') return { width: 680, height: 140 };

  // Events + gateways benefit from more vertical space because we render a symbol + label.
  if (
    elementType === 'bpmn.startEvent' ||
    elementType === 'bpmn.endEvent' ||
    elementType === 'bpmn.intermediateCatchEvent' ||
    elementType === 'bpmn.intermediateThrowEvent' ||
    elementType === 'bpmn.boundaryEvent' ||
    elementType === 'bpmn.gatewayExclusive' ||
    elementType === 'bpmn.gatewayParallel' ||
    elementType === 'bpmn.gatewayInclusive' ||
    elementType === 'bpmn.gatewayEventBased'
  ) {
    return { width: 120, height: 90 };
  }

  // Artifacts
  if (elementType === 'bpmn.textAnnotation') return { width: 200, height: 100 };

  // Activities
  if (elementType === 'bpmn.subProcess') return { width: 200, height: 120 };
  if (elementType === 'bpmn.callActivity') return { width: 160, height: 80 };

  // Default activity/task
  return { width: 140, height: 70 };
}


