# EA XMI import landing zones (UML)

This note documents the intended **landing zones** for an upcoming *Sparx Enterprise Architect (EA)* UML import using **XMI**.

## Principles

- The UML **package namespace hierarchy** becomes **folders** in the navigator (primary representation).
- **UML semantics** lands on **domain elements/relationships** via `element.attrs` and `relationship.attrs`.
- **Diagram geometry** (view objects, coordinates, sizes, bends) is a separate milestone.

## Packages

- UML Package in XMI: import into **folders** (see `policy.ts`).
- Only create `uml.package` **elements** when packages are explicitly drawn as diagram nodes (or if an importer option requests it).

## Elements

Imported UML elements should map to qualified type ids (`uml.*`). Typical mappings:

- `uml:Class` -> `uml.class`
- `uml:Interface` -> `uml.interface`
- `uml:Enumeration` -> `uml.enum`
- `uml:DataType` -> `uml.datatype`
- `uml:PrimitiveType` -> `uml.primitiveType`
- `uml:Component` -> `uml.component`
- `uml:Artifact` -> `uml.artifact`
- `uml:Node` -> `uml.node`
- `uml:Device` -> `uml.device`
- `uml:ExecutionEnvironment` -> `uml.executionEnvironment`
- `uml:Actor` -> `uml.actor`
- `uml:UseCase` -> `uml.usecase`
- `uml:Comment` -> `uml.note`

## Classifier members

For classifiers (class/interface/enum/datatype/…):

- Attributes land in `element.attrs.attributes`.
- Operations land in `element.attrs.operations`.
- Parameters land in `operation.params`.

The importer should prefer structured data over view-local text fields.

## Relationships

Relationships should map to qualified type ids (`uml.*`). Typical mappings:

- `uml:Association` -> `uml.association` (aggregation/composition is represented by end metadata)
- `uml:Dependency` -> `uml.dependency`
- `uml:Generalization` -> `uml.generalization`
- `uml:InterfaceRealization` / `uml:Realization` -> `uml.realization`
- `uml:Include` -> `uml.include`
- `uml:Extend` -> `uml.extend`
- `uml:Deployment` -> `uml.deployment`
- `uml:CommunicationPath` -> `uml.communicationPath`

### Association end metadata

When the source provides end information, store it on `relationship.attrs`:

- `sourceRole`, `targetRole`
- `sourceMultiplicity`, `targetMultiplicity`
- `sourceNavigable`, `targetNavigable`
- `stereotype` (optional)

## External IDs and tagged values

- `element.externalIds` / `relationship.externalIds` should include stable source ids (e.g. `xmi:id`).
- Stereotypes and EA tagged values should be preserved in `taggedValues` whenever possible.

## Diagram import (later)

Diagram objects (positions/sizes), connector routing, and per-diagram package shapes should be imported as IR views/nodes/connections in a later milestone.
