import type { ViewNodeLayout } from '../../domain';

export type UmlNodeAttrs = {
  // Legacy per-node text fields used by some UML node types (e.g. note body).
  // Class/Interface members are semantic and stored on the UML element instead.
  attributesText?: string;
  operationsText?: string;

  // View-local presentation flags (per node instance in a view)
  showAttributes?: boolean;
  showOperations?: boolean;
  collapsed?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asBoolean(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * Extract a safe UmlNodeAttrs shape from a view node.
 */
export function readUmlNodeAttrs(node: ViewNodeLayout): UmlNodeAttrs {
  const raw = (node as unknown as { attrs?: unknown }).attrs;
  if (!isRecord(raw)) return {};

  return {
    attributesText: typeof raw.attributesText === 'string' ? raw.attributesText : undefined,
    operationsText: typeof raw.operationsText === 'string' ? raw.operationsText : undefined,

    showAttributes: asBoolean(raw.showAttributes),
    showOperations: asBoolean(raw.showOperations),
    collapsed: asBoolean(raw.collapsed),
  };
}
