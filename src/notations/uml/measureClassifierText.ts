/**
 * Shared UML classifier layout metrics used by:
 * - UML modelling view (React)
 * - SVG export (pure SVG)
 * - Domain layout sizing (fitUmlBoxToText)
 *
 * Keep these constants in sync with notations/uml/renderNodeContent.tsx.
 *
 * NOTE: This module is intentionally React/DOM free.
 */

export const UML_CLASSIFIER_METRICS = {
  // Horizontal padding for header/sections (px)
  padX: 8,

  // Vertical padding for the header block (px)
  headerPadY: 6,

  // Header typography / measured line heights (px)
  stereotypeLineH: 13, // corresponds to fontSize 11 with lineHeight + slack
  stereotypeGap: 2,
  nameLineH: 16, // corresponds to fontSize 13 with lineHeight + slack

  // Section paddings + borders (px)
  sectionPadY: 6,
  sectionBorderH: 1,

  // Section line height (px).
  // React uses fontSize: 12 and lineHeight: 1.25 (~15px). We keep a safety margin
  // to avoid clipping due to rounding and long lines.
  sectionLineH: 17,

  // Extra slack per compartment (px)
  sectionExtraSlack: 6,

  // Global slack added to total height (px)
  globalSlack: 10,

  // Min dimensions
  minWidth: 120,
  minHeight: 60,
} as const;

export type UmlClassifierBoxHeights = {
  headerH: number;
  attributesH: number;
  operationsH: number;
  totalH: number;
};

/**
 * Compute heights for a UML classifier "box with compartments" for a given set of lines.
 *
 * - When a section is enabled (showAttributes/showOperations) we reserve at least 1 line
 *   to avoid an empty-looking compartment.
 * - When collapsed, no compartments are shown.
 */
export function measureUmlClassifierBoxHeights(args: {
  hasStereotype: boolean;
  collapsed: boolean;
  showAttributes: boolean;
  showOperations: boolean;
  attributeLines: number;
  operationLines: number;
}): UmlClassifierBoxHeights {
  const m = UML_CLASSIFIER_METRICS;

  const stereoLineH = args.hasStereotype ? m.stereotypeLineH : 0;
  const stereoGap = args.hasStereotype ? m.stereotypeGap : 0;

  const headerH = m.headerPadY * 2 + stereoLineH + stereoGap + m.nameLineH;

  let attributesH = 0;
  let operationsH = 0;

  if (!args.collapsed) {
    if (args.showAttributes) {
      const lines = Math.max(1, Math.floor(args.attributeLines || 0));
      attributesH = m.sectionBorderH + m.sectionPadY * 2 + m.sectionLineH * lines + m.sectionExtraSlack;
    }
    if (args.showOperations) {
      const lines = Math.max(1, Math.floor(args.operationLines || 0));
      operationsH = m.sectionBorderH + m.sectionPadY * 2 + m.sectionLineH * lines + m.sectionExtraSlack;
    }
  }

  const totalH = Math.max(m.minHeight, Math.ceil(headerH + attributesH + operationsH + m.globalSlack));

  return { headerH, attributesH, operationsH, totalH };
}
