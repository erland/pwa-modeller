import type { ViewNodeLayout } from '../../domain';

export type UmlNodeAttrs = {
  name?: string;
  stereotype?: string;
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

function asString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function asBoolean(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * Extract a safe UmlNodeAttrs shape from a view node.
 *
 * We keep this intentionally permissive for v1: only strings are read, everything else is ignored.
 */
export function readUmlNodeAttrs(node: ViewNodeLayout): UmlNodeAttrs {
  const raw = (node as unknown as { attrs?: unknown }).attrs;
  if (!isRecord(raw)) return {};

  return {
    name: asString(raw.name),
    stereotype: asString(raw.stereotype),
    attributesText: typeof raw.attributesText === 'string' ? raw.attributesText : undefined,
    operationsText: typeof raw.operationsText === 'string' ? raw.operationsText : undefined,

    showAttributes: asBoolean(raw.showAttributes),
    showOperations: asBoolean(raw.showOperations),
    collapsed: asBoolean(raw.collapsed),
  };
}
