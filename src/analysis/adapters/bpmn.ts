import { createGenericAnalysisAdapter } from './generic';

/**
 * BPMN Analysis adapter (thin stub).
 *
 * At this stage it delegates to the generic adapter; we can enrich it later
 * with BPMN-specific facets (e.g., element category, pool/lane, process, etc.).
 */
export const bpmnAnalysisAdapter = createGenericAnalysisAdapter('bpmn');
