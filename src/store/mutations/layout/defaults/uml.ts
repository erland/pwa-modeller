// Default per-node presentation attributes for UML views.

export function defaultUmlNodePresentationAttrs(elementType: string): Record<string, unknown> | undefined {
  // Only apply to class/interface nodes for now.
  if (elementType === 'uml.class' || elementType === 'uml.interface') {
    return { showAttributes: true, showOperations: true, collapsed: false };
  }
  return undefined;
}


