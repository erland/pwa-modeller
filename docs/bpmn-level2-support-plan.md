# BPMN “Level 2” Support Plan (Editable Semantics)

Goal: extend the app’s BPMN support beyond “recognize + render” so users can **edit meaningful BPMN semantics** (types, event defs, gateway kinds, boundary attachments, conditions, etc.) without committing to “full BPMN tool” scope.

This plan assumes your current architecture:
- **Domain truth** in `src/domain/*`
- **Notation plug-in** in `src/notations/bpmn/*`
- **UI properties** in `src/components/model/properties/*`
- **Diagram interaction** in `src/components/diagram/*`
- **Mutations/store** in `src/store/*`

Each step below is intentionally sized so it can be implemented in **one LLM prompt**.

---

## Step 1 — Expand BPMN catalog (types + labels + palette + rendering defaults)

**Objective:** Make the editor aware of the “Level 2” element/relationship set and able to render them distinctly.

**Implement**
- Extend BPMN type IDs + labels in:
  - `src/domain/config/catalog.ts`
  - `src/domain/config/viewpoints.ts` (bpmn-process palette)
- Extend BPMN notation registration:
  - `src/notations/bpmn/index.ts` (catalog exposures + defaults)
- Add/adjust rendering mapping (icons/markers) so new types aren’t all identical:
  - diagram node rendering mapping used by BPMN notation (where you currently style `task`, `startEvent`, etc.)
- Extend relationship styles:
  - add at least `association` (dashed), and keep `sequenceFlow`/`messageFlow`.

**Recommended initial Level-2 type set**
- **Containers:** `participant` (pool), `lane`
- **Activities:** `task`, `userTask`, `serviceTask`, `scriptTask`, `manualTask`, `callActivity`, `subProcess`
- **Events:** `startEvent`, `endEvent`, `intermediateCatchEvent`, `intermediateThrowEvent`, `boundaryEvent`
- **Gateways:** `exclusiveGateway`, `parallelGateway`, `inclusiveGateway`, `eventBasedGateway`
- **Artifacts (optional but common):** `textAnnotation`
- **Relationships:** `sequenceFlow`, `messageFlow`, `association`

**Done when**
- The palette shows these types, and dropping them on a BPMN view produces correctly typed elements with sensible default styling.

---

## Step 2 — Define BPMN semantic “attrs” schema (typed + future-proof)

**Objective:** Store semantics cleanly without exploding your core model schema.

**Implement**
- Create `src/domain/bpmnAttrs.ts` (or `src/domain/notations/bpmn/attrs.ts`) defining:
  - `BpmnActivityAttrs` (e.g., `loopType`, `multiInstance`, `isCall`, `subProcessType`)
  - `BpmnEventAttrs`:
    - `eventKind` (start/end/intermediate/boundary)
    - `eventDefinition` union: `timer | message | signal | error | escalation | conditional | link | terminate | none`
    - for boundary: `cancelActivity?: boolean`, `attachedToRef?: string`
  - `BpmnGatewayAttrs`:
    - `gatewayKind` union (exclusive/parallel/inclusive/eventBased)
    - optional `defaultFlowRef?: string`
  - `BpmnSequenceFlowAttrs`:
    - `conditionExpression?: string`
    - `isDefault?: boolean`
  - `BpmnMessageFlowAttrs` (optional fields)
- Add light runtime validation helpers (no heavy libs required):
  - `isBpmnEventAttrs(x): x is ...` etc., used by validation + importers later.

**Done when**
- You can set these attrs on elements/relationships and persist/restore them with no TypeScript holes.

---

## Step 3 — Update BPMN notation rules (connectability + allowed relationships + “flow node” detection)

**Objective:** Ensure imported/created BPMN elements behave correctly in the editor.

**Implement**
- In `src/notations/bpmn/index.ts`:
  - Replace narrow `isBpmnFlowNodeType` with a rule like:
    - **connectable** = `bpmn.*` excluding container-only types (`participant`, `lane`, maybe `textAnnotation`).
  - Implement `canCreateRelationship(sourceType, targetType, relType, context)` for:
    - `sequenceFlow` only between flow nodes inside the **same process/participant** (start permissive; tighten in Step 6)
    - `messageFlow` between elements in **different participants** (warn if not; enforce later)
    - `association` from any node to `textAnnotation` (if supported)
  - Add “default relationship type” rules for drag-connect gestures (e.g., sequenceFlow first).

**Done when**
- Users can draw sequence flows between tasks/events/gateways and message flows across pools without “blocked” behavior.

---

## Step 4 — Properties UI for Level-2 semantics (editors + read-only fallbacks)

**Objective:** Expose semantics in the properties panel so models are editable (not just drawable).

**Implement**
- Add BPMN element property sections (reusing your existing property-section patterns):
  - `BpmnTaskPropertiesSection`:
    - task subtype selector (`task`, `userTask`, `serviceTask`, etc.)
    - loop/multi-instance toggles (store in attrs)
  - `BpmnEventPropertiesSection`:
    - event definition selector (timer/message/signal/…)
    - boundary toggles (cancelActivity)
  - `BpmnGatewayPropertiesSection`:
    - gateway kind selector
    - default flow selector (from outgoing sequence flows)
  - Relationship properties:
    - `BpmnSequenceFlowPropertiesSection`: condition expression editor + “default flow” toggle
- Wire these sections in the BPMN notation’s `getElementProperties()` / `getRelationshipProperties()`.

**Done when**
- Selecting a BPMN element shows a BPMN-specific properties section, and changing values updates the model.

---

## Step 5 — Mutations & behaviors (safe updates + boundary attachment behavior)

**Objective:** Make semantic edits and boundary attachments robust and maintain invariants.

**Implement**
- Add mutations for BPMN attrs:
  - `setBpmnAttrs(elementId, partialAttrs)`
  - `setSequenceFlowCondition(relId, expr)`
  - `setGatewayDefaultFlow(gatewayId, relId)`
- Implement boundary event attachment behavior:
  - mutation `attachBoundaryEvent(boundaryId, hostActivityId)`
  - enforce/maintain `attachedToRef` in boundary attrs
  - diagram behavior: when moving host activity, boundary should move with it (store as layout rule or recompute on render)
- Add safe “type change” support:
  - if a user changes an element from `task` → `userTask`, preserve geometry and compatible attrs.

**Done when**
- Boundary events can be attached to an activity and don’t get orphaned during common edits.

---

## Step 6 — Validation rules (BPMN correctness-lite, editor-friendly)

**Objective:** Catch real mistakes without turning validation into a blocker.

**Implement**
- Extend `src/domain/validation/bpmn.ts` to validate:
  - boundary events must have `attachedToRef` pointing to an activity
  - `sequenceFlow` endpoints must be flow nodes
  - `messageFlow` endpoints should be in different participants (warn if not)
  - gateway `defaultFlowRef` must be one of its outgoing sequence flows
  - optional: condition expression present when gateway type suggests it (warn-only)
- Keep rules **warning-first** (not fatal), consistent with your current approach.

**Done when**
- You get actionable warnings for incorrect models and no “warning spam” for valid ones.

---

## Step 7 — Diagram UX polish (creation defaults + connection assists + tests)

**Objective:** Make the extended BPMN feel “native” in daily use.

**Implement**
- Creation defaults:
  - new gateways default to exclusive
  - new tasks default to generic `task`
  - new boundary events default to `timer` (or `none`) + `cancelActivity=true`
- Connection assists:
  - when dragging from a boundary event: default to sequence flow
  - offer messageFlow when crossing participants
- Add regression tests + fixtures:
  - task subtype changes preserve attrs/geometry
  - boundary attach/detach invariants
  - gateway default flow selection
  - condition expression persistence

**Done when**
- A small suite of tests covers the new semantics and prevents regressions while you implement import.

---

## What this plan deliberately does NOT include (Level 3 scope)
- Full execution semantics (token flow correctness)
- Choreography/conversation diagrams
- Full data associations semantics
- Advanced event definition constraints (every OMG nuance)
- Round-trip perfect BPMNDI routing fidelity across tools

---

## After Level 2: you’re ready for EA BPMN 2.0 XML import
Once Level 2 is in place, your importer can map BPMN XML into:
- explicit element types (tasks/events/gateways)
- semantic attrs (event definitions, boundary attachment, flow conditions)
- DI layout (shapes + waypoints)

This drastically reduces importer complexity and avoids “imported but uneditable” models.
