import type { QualifiedElementType, QualifiedRelationshipType } from '../../domain/types';

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
