import { createGenericAnalysisAdapter } from './generic';

/**
 * UML Analysis adapter (thin stub).
 *
 * At this stage it delegates to the generic adapter; we can enrich it later
 * with UML-specific facets (e.g., classifier kind, package, stereotype, etc.).
 */
export const umlAnalysisAdapter = createGenericAnalysisAdapter('uml');
