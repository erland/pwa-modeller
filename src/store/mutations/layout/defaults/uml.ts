// Default per-node presentation attributes for UML views.

export function defaultUmlNodePresentationAttrs(elementType: string): Record<string, unknown> | undefined {
  // Only apply to class/interface nodes for now.
  if (elementType === 'uml.class' || elementType === 'uml.associationClass' || elementType === 'uml.interface') {
    return { showAttributes: true, showOperations: true, collapsed: false };
  }

  // Activity diagrams: store a lightweight shape hint on the view node so renderers can evolve without changing model semantics.
  if (elementType.startsWith('uml.') && (elementType.endsWith('Node') || elementType === 'uml.action' || elementType === 'uml.activity' || elementType === 'uml.objectNode')) {
    const umlShape =
      elementType === 'uml.action'
        ? 'action'
        : elementType === 'uml.initialNode'
          ? 'initial'
          : elementType === 'uml.activityFinalNode'
            ? 'activityFinal'
            : elementType === 'uml.flowFinalNode'
              ? 'flowFinal'
              : elementType === 'uml.decisionNode'
                ? 'decision'
                : elementType === 'uml.mergeNode'
                  ? 'merge'
                  : elementType === 'uml.forkNode'
                    ? 'fork'
                    : elementType === 'uml.joinNode'
                      ? 'join'
                      : elementType === 'uml.objectNode'
                        ? 'object'
                        : elementType === 'uml.activity'
                          ? 'activity'
                          : undefined;
    if (umlShape) {
      // Default fork/join orientation is horizontal; can later be changed per node.
      const orientation = elementType === 'uml.forkNode' || elementType === 'uml.joinNode' ? 'horizontal' : undefined;
      return { umlShape, ...(orientation ? { umlOrientation: orientation } : {}) };
    }
  }

  return undefined;
}

export function defaultUmlNodeSize(elementType: string): { width: number; height: number } | undefined {
  // Activity diagram defaults (v1)
  switch (elementType) {
    case 'uml.action':
      return { width: 160, height: 80 };
    case 'uml.initialNode':
      return { width: 60, height: 60 };
    case 'uml.activityFinalNode':
      return { width: 70, height: 70 };
    case 'uml.flowFinalNode':
      return { width: 70, height: 70 };
    case 'uml.decisionNode':
    case 'uml.mergeNode':
      return { width: 90, height: 70 };
    case 'uml.forkNode':
    case 'uml.joinNode':
      return { width: 140, height: 34 };
    case 'uml.objectNode':
      return { width: 140, height: 60 };
    case 'uml.activity':
      return { width: 260, height: 180 };
    default:
      return undefined;
  }
}

