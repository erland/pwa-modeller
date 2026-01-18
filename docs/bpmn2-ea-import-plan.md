# BPMN 2.0 XML import plan (Sparx EA -> EA Modeller PWA)

## Goal
Import BPMN 2.0 XML files exported from Sparx Enterprise Architect (EA) into the PWA by converting them to your ImportIR and then reusing the pipeline:

parse -> ImportIR -> normalizeImportIR -> applyImportIR -> applyModelInvariants/validation

## Constraints to design for (EA)
- Export/import is Package-scoped: only the selected package is serialized.
- The export contains both BPMN semantics and diagram-interchange (BPMNDI).
- Some BPMN Types are not serialized by EA (treat as unsupported and warn).


## Step 1 - Add importer skeleton, fixtures, and XML utilities
What I will implement in one prompt:
- New folder: src/import/bpmn2/
  - xml.ts: DOM helpers that are namespace-safe (q/qa by localName, attr, text, requiredAttr, numberAttr, etc.).
  - detectBpmn2.ts: quick sniffing (root definitions + known namespaces) so the UI can auto-detect.
  - parseBpmn2Xml.ts: entry point that returns { importIR, warnings }.
- Test harness:
  - src/__tests__/import/bpmn2/parseBpmn2Xml.test.ts
  - fixtures: src/__tests__/fixtures/bpmn2/ea/*.bpmn (a few real exports from EA)

Definition of done:
- Tests load fixture XML and the parser reaches the definitions element without throwing.
- Parser returns an ImportIR object (can be empty in this step) plus warnings.

## Step 2 - Parse BPMN semantics into ImportIR (core subset)
What I will implement in one prompt:
- Parse bpmn:definitions plus these semantic constructs:
  - process, collaboration, participant, laneSet, lane
  - startEvent, endEvent, intermediateCatchEvent, intermediateThrowEvent
  - task and common specializations if present (userTask, serviceTask, scriptTask)
  - gateways (exclusiveGateway, parallelGateway, inclusiveGateway)
  - sequenceFlow, messageFlow, association (optional)
- Build an idIndex of all parsed elements by @id, then emit:
  - ImportIR.elements for nodes/containers
  - ImportIR.relationships for flows (sourceRef/targetRef)
- Map documentation and name fields.
- Collect warnings for unsupported BPMN element types.

Definition of done:
- Importing a fixture produces non-zero elements and relationships matching the diagram intent.
- IDs are stable and deterministic (prefer using BPMN @id as externalId/tagged value).

## Step 3 - Parse BPMNDI to recreate diagram layout (views + geometry)
What I will implement in one prompt:
- Parse DI elements:
  - bpmndi:BPMNDiagram, bpmndi:BPMNPlane
  - bpmndi:BPMNShape with dc:Bounds
  - bpmndi:BPMNEdge with di:waypoint
- Create ImportIR.views and viewObjects using bounds.
- Create connectors using waypoints if your model supports explicit routing; otherwise approximate.
- Fallback behavior when DI is missing:
  - import semantics anyway
  - create a view with basic auto-layout (simple grid or topological order)

Definition of done:
- At least one EA-exported fixture renders with recognizable layout and routed flows.

## Step 4 - EA-focused normalization and model hygiene
What I will implement in one prompt:
- Add src/import/bpmn2/normalizeBpmn2ImportIR.ts that fixes and stabilizes importer output:
  - Namespace/prefix tolerance (EA may vary prefixes; rely on localName where possible).
  - Skip DI shapes/edges that reference unknown elements, but warn.
  - Clean doc text (CRLF/whitespace normalization).
  - Optionally capture EA-specific tagged values or extensions as tagged values on elements.
- Then run the existing generic normalizeImportIR.

Definition of done:
- Messy/partial fixtures import with warnings instead of crashing.
- Re-importing the same file is deterministic (stable ordering and stable geometry).

## Step 5 - Wire into UI import flow and add a focused regression suite
What I will implement in one prompt:
- Extend your import entry point so that:
  - .bpmn/.xml files are accepted
  - BPMN 2.0 XML is auto-detected using detectBpmn2
  - parseBpmn2Xml -> normalizeBpmn2ImportIR -> normalizeImportIR -> applyImportIR is invoked
- Add regression tests:
  - golden counts (elements/relationships/views/viewObjects)
  - a few exact geometry assertions (bounds and waypoint counts)
  - negative tests (missing refs/unknown elements -> warnings)

Definition of done:
- From the app UI: selecting an EA-exported BPMN file imports a BPMN model and diagram you can select and edit.
- The test suite prevents accidental breakage when you extend BPMN support.

## Suggested v1 scope boundary (deliberately not included)
- Full BPMN coverage (conversation/choreography and every eventDefinition type).
- Exact visual parity for every EA style/marker.
- Round-trip back to EA.

## v1 completion criteria
- Imports common EA BPMN process diagrams with pools/lanes, tasks, events, gateways, and sequence flows.
- Preserves layout via BPMNDI for at least the core shapes and edges.
- Produces clear warnings for unsupported items instead of failing.
