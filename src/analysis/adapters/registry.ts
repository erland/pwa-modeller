import type { ModelKind } from '../../domain/types';
import type { AnalysisAdapter } from './AnalysisAdapter';
import { archimateAnalysisAdapter } from './archimate';
import { bpmnAnalysisAdapter } from './bpmn';
import { createGenericAnalysisAdapter } from './generic';
import { umlAnalysisAdapter } from './uml';

const registry: Record<ModelKind, AnalysisAdapter> = {
  archimate: archimateAnalysisAdapter,
  uml: umlAnalysisAdapter,
  bpmn: bpmnAnalysisAdapter
};

/**
 * Get the notation-specific Analysis adapter.
 *
 * Step 6: ArchiMate has a real adapter, others use thin stubs that currently
 * delegate to a generic, notation-agnostic adapter.
 */
export function getAnalysisAdapter(kind: ModelKind): AnalysisAdapter {
  return registry[kind];
}

/**
 * Runtime-safe variant for situations where persisted data may contain an
 * unexpected modelKind. Prefer `getAnalysisAdapter` when types guarantee it.
 */
export function getAnalysisAdapterOrGeneric(kind: unknown): AnalysisAdapter {
  if (kind === 'archimate') return registry.archimate;
  if (kind === 'uml') return registry.uml;
  if (kind === 'bpmn') return registry.bpmn;
  // Default generic adapter with a stable id (we pick 'archimate' purely as a
  // ModelKind-compatible id; semantics remain generic).
  return createGenericAnalysisAdapter('archimate');
}
