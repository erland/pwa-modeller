import type { QualifiedElementType, QualifiedRelationshipType } from '../../domain/types';
import { ELEMENT_TYPES, RELATIONSHIP_TYPES } from '../../domain/config/catalog';

/**
 * Central mapping notes for an EA XMI UML importer.
 *
 * EA (and XMI in general) can encode UML constructs in multiple ways depending on exporter settings.
 * These maps are intentionally conservative: they cover common UML meta-classes and allow the importer
 * to fall back gracefully while preserving original meta-class info via `externalIds`/`taggedValues`.
 */

/**
 * Maps common UML meta-class names (as they may appear in XMI) to this app's qualified element types.
 *
 * Notes:
 * - UML `Package` is usually represented as folders (see policy.ts). `uml.package` exists for cases
 *   where a package is explicitly used as a diagram node (diagram import milestone).
 * - `Comment` is mapped to `uml.note`.
 */
export const EA_XMI_UML_ELEMENT_TYPE_MAP: Readonly<Record<string, QualifiedElementType>> = {
  Class: 'uml.class',
  Interface: 'uml.interface',
  Enumeration: 'uml.enum',
  Enum: 'uml.enum',
  DataType: 'uml.datatype',
  PrimitiveType: 'uml.primitiveType',
  Package: 'uml.package',
  Component: 'uml.component',
  Artifact: 'uml.artifact',
  Node: 'uml.node',
  Device: 'uml.device',
  ExecutionEnvironment: 'uml.executionEnvironment',
  Actor: 'uml.actor',
  UseCase: 'uml.usecase',
  Comment: 'uml.note',
  Note: 'uml.note',
};

/**
 * Maps common UML relationship meta-class names (as they may appear in XMI) to this app's qualified relationship types.
 *
 * Notes:
 * - `Association` covers plain associations and can include aggregation/composition via end properties.
 * - EA can represent `include`/`extend` either as dedicated relationships or as `Dependency` with stereotypes.
 */
export const EA_XMI_UML_REL_TYPE_MAP: Readonly<Record<string, QualifiedRelationshipType>> = {
  Association: 'uml.association',
  Dependency: 'uml.dependency',
  Generalization: 'uml.generalization',
  Realization: 'uml.realization',
  InterfaceRealization: 'uml.realization',
  Include: 'uml.include',
  Extend: 'uml.extend',
  Deployment: 'uml.deployment',
  CommunicationPath: 'uml.communicationPath',
};

export interface InferUmlElementTypeArgs {
  /** UML meta-class name, e.g. "Class", "Component", "DataType" */
  metaclass?: string | null;
  /** Optional stereotype hint, e.g. "boundary", "control"; importer should still store it as taggedValue/attrs. */
  stereotype?: string | null;
}

/**
 * Infers the qualified element type for a UML element based on meta-class and (optionally) stereotype hints.
 *
 * The importer should still preserve the original meta-class in `externalIds`/`taggedValues` even when
 * this returns a known type.
 */
export function inferUmlQualifiedElementTypeFromEaClassifier(
  args: InferUmlElementTypeArgs,
): QualifiedElementType | undefined {
  const mc = (args.metaclass ?? '').trim();
  if (mc) {
    const hit = EA_XMI_UML_ELEMENT_TYPE_MAP[mc];
    if (hit) return hit;
  }

  // If a tool exports a generic "Classifier" etc, do not guess aggressively.
  return undefined;
}

export interface InferUmlRelationshipTypeArgs {
  metaclass?: string | null;
  /** Optional stereotype hint (EA sometimes encodes include/extend as dependency with stereotype). */
  stereotype?: string | null;
}

export function inferUmlQualifiedRelationshipTypeFromEaClassifier(
  args: InferUmlRelationshipTypeArgs,
): QualifiedRelationshipType | undefined {
  const mc = (args.metaclass ?? '').trim();
  if (mc) {
    const hit = EA_XMI_UML_REL_TYPE_MAP[mc];
    if (hit) return hit;
  }

  const st = (args.stereotype ?? '').trim().toLowerCase();
  if (st === 'include') return 'uml.include';
  if (st === 'extend') return 'uml.extend';
  if (st === 'deployment') return 'uml.deployment';

  return undefined;
}

// -------------------------
// ArchiMate (EA profile tags)
// -------------------------

/**
 * The XML helper `localName()` in this repo lowercases tag local names.
 * EA profile tags may appear as e.g:
 *  - ArchiMate3:ArchiMate_BusinessActor  (-> localName "archimate_businessactor")
 *  - ArchiMate3:archimate_businessactor  (-> localName "archimate_businessactor")
 *  - ArchiMate_BusinessActor             (-> localName "archimate_businessactor")
 *
 * To map these robustly, we normalize both incoming tokens and our catalog values
 * to a comparable key form.
 */
function keyify(s: string): string {
  return (s ?? '')
    .trim()
    .toLowerCase()
    // remove anything that isn't a letter/number to tolerate "_" and other separators
    .replace(/[^a-z0-9]/g, '');
}

const ARCHIMATE_ELEMENT_BY_KEY: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const t of ELEMENT_TYPES as unknown as string[]) {
    out[keyify(t)] = t;
  }
  return out;
})();

const ARCHIMATE_REL_BY_KEY: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const t of RELATIONSHIP_TYPES as unknown as string[]) {
    out[keyify(t)] = t;
  }
  return out;
})();

function normalizeArchimateProfileLocalName(localName: string): string {
  // EA profile tags commonly look like:
  //  - "ArchiMate_BusinessActor" (or lowercased variants due to our XML helper)
  //  - "ArchiMate_BusinessProcess"
  //  - "archimate_businessprocess"
  // We keep this forgiving and only try to strip the leading "archimate" prefix.
  const ln = (localName ?? '').trim();
  if (!ln) return '';

  // Strip common ArchiMate prefixes (case-insensitive), with optional version digit(s).
  // Examples:
  //  - archimate_businessactor -> businessactor
  //  - archimate3_businessactor -> businessactor
  //  - ArchiMate_BusinessActor -> BusinessActor
  const stripped = ln.replace(/^archimate\d*(?:[_-])?/i, '').trim();
  return stripped || ln;
}

/**
 * Best-effort mapping from EA ArchiMate profile tag localName (e.g. "ArchiMate_BusinessActor")
 * to this app's ArchiMate element type id (e.g. "BusinessActor").
 */
export function inferArchimateElementTypeFromEaProfileTagLocalName(localName: string): string | undefined {
  const t = normalizeArchimateProfileLocalName(localName);
  if (!t) return undefined;
  return ARCHIMATE_ELEMENT_BY_KEY[keyify(t)] ?? undefined;
}

/**
 * Best-effort mapping from EA ArchiMate profile tag localName (e.g. "ArchiMate_Flow")
 * to this app's ArchiMate relationship type id (e.g. "Flow").
 */
export function inferArchimateRelationshipTypeFromEaProfileTagLocalName(localName: string): string | undefined {
  const t = normalizeArchimateProfileLocalName(localName);
  if (!t) return undefined;
  return ARCHIMATE_REL_BY_KEY[keyify(t)] ?? undefined;
}

/**
 * When a profile tag doesn't map cleanly, this returns the best "source" token to preserve.
 * Example: "ArchiMate_BusinessActor" -> "BusinessActor".
 */
export function getArchimateSourceTypeTokenFromEaProfileTagLocalName(localName: string): string | undefined {
  const t = normalizeArchimateProfileLocalName(localName);
  if (!t) return undefined;
  // Prefer returning a canonical known token when possible.
  return (
    ARCHIMATE_ELEMENT_BY_KEY[keyify(t)] ??
    ARCHIMATE_REL_BY_KEY[keyify(t)] ??
    t
  );
}

