/**
 * Sparx EA (and other UML tools) often represent UML packages in two overlapping ways:
 *   1) As a namespace hierarchy in the repository tree (packages owning packages / elements)
 *   2) As diagram nodes (a package shape drawn on a diagram)
 *
 * If we always import *both* as folders AND as `uml.package` elements, users will end up with
 * duplicated structure: the same package appears as a folder in the navigator and as an element
 * in the model (even when it was never drawn as a node on any diagram).
 *
 * Policy used by the upcoming EA XMI importer:
 *   - Use folders as the primary representation of the UML package namespace hierarchy.
 *   - Only create `uml.package` *elements* when the source explicitly draws a package on a diagram
 *     (this will be handled in the later "diagram import" milestone), OR when an explicit importer
 *     option requests it.
 *
 * This keeps the navigator clean while still allowing package shapes to exist in diagrams.
 */

export type UmlPackageImportRepresentation =
  | 'folders-only'
  | 'folders-plus-diagram-nodes'
  | 'folders-plus-all-packages-as-elements';

/**
 * Default policy: folders for hierarchy; `uml.package` elements only when they are used as diagram nodes.
 */
export const DEFAULT_UML_PACKAGE_IMPORT_REPRESENTATION: UmlPackageImportRepresentation =
  'folders-plus-diagram-nodes';

export interface UmlPackageImportPolicy {
  /**
   * Controls when to materialize UML packages as `uml.package` elements.
   */
  representation: UmlPackageImportRepresentation;

  /**
   * When true, the importer should prefer the most user-friendly folder name for the navigator.
   * For EA this typically means using the package name (not the GUID) and falling back sensibly.
   */
  preferHumanReadableNames: boolean;
}

export const DEFAULT_UML_PACKAGE_IMPORT_POLICY: UmlPackageImportPolicy = {
  representation: DEFAULT_UML_PACKAGE_IMPORT_REPRESENTATION,
  preferHumanReadableNames: true,
};
