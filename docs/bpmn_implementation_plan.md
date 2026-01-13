# BPMN Support Plan for EA Modeller PWA (Notations-ready)

This plan assumes the codebase already includes:
- `view.kind` (`archimate` | `uml` | `bpmn`) with migration + persistence
- notation registry `getNotation(kind)` + guards
- notation-driven node rendering + relationship `RelationshipStyle`
- centralized relationship markers and SVG marker defs
- `View.ownerRef?: { kind; id }` for drill-down linking

Goal: **Add BPMN support** as *separate BPMN views* (no mixing with ArchiMate/UML in the same view), focusing on **Process diagrams** for detailed workflows.

---

## Step 1 — Add BPMN notation module + wire into registry
**What to implement**
- Create `src/notations/bpmn/index.ts` exporting `bpmnNotation: Notation`.
- Update `src/notations/registry.ts` so:
  - `getNotation('bpmn')` returns `bpmnNotation`.

**Define initial BPMN type IDs (strings)**
- Nodes:
  - `bpmn.task`
  - `bpmn.startEvent`, `bpmn.endEvent`
  - `bpmn.gatewayExclusive`
  - `bpmn.pool` (container), `bpmn.lane` (optional in v1)
  - `bpmn.subProcess` (optional v2)
- Relationships:
  - `bpmn.sequenceFlow`
  - `bpmn.messageFlow` (optional v2)
  - `bpmn.association` (optional)

**Notation responsibilities**
- `renderNodeSymbol({ nodeType, title })` renders BPMN shapes (see Step 2).
- `getRelationshipStyle(rel)` maps flow types to styles (see Step 3).
- `canCreateNode` and `canCreateRelationship` enforce minimal BPMN rules (see Step 3).

**Acceptance**
- BPMN views render without crashing, using fallback visuals if needed.

---

## Step 2 — Implement BPMN node rendering (Process diagram v1)
**What to implement**
Implement basic BPMN shapes in `renderNodeSymbol`:

- **Task**: rounded rectangle (optionally icon slot)
- **Start Event**: single thin circle
- **End Event**: double/thick circle
- **Exclusive Gateway**: diamond with “X” marker
- **Pool** (v1 recommended): large rounded rectangle with a left-side header band

**Where**
- `src/notations/bpmn/renderNodeSymbol.tsx`
- `src/notations/bpmn/nodeTypes.ts` for constants and helper rendering

**Minimal node attrs (stored on view node)**
```ts
type BpmnNodeAttrs = {
  name?: string;
  taskType?: 'user' | 'service' | 'manual' | 'script'; // optional
  isCollapsed?: boolean; // for subprocess later
};
```

**Acceptance**
- BPMN nodes render clearly; move/resize works.

---

## Step 3 — Implement BPMN flows (relationship style + markers + basic guards)
**Relationship style mapping**
- `bpmn.sequenceFlow`: solid line + filled arrow
- `bpmn.messageFlow` (optional): dashed line + open arrow
- `bpmn.association` (optional): dotted line + no arrow (or open arrow)

**Markers**
Extend the centralized marker registry (if needed) with:
- `arrowFilled` (for sequence flow)
- optionally `circleSmall` or other BPMN-specific decorators later

Use existing helpers:
- `markerUrl(kind)` and `dasharrayForPattern(pattern)`.

**Guards (minimal v1)**
Implement in `bpmnNotation.canCreateRelationship`:
- Only allow relationship types starting with `bpmn.`
- Sequence flow allowed between:
  - startEvent/task/gateway → task/gateway/endEvent
- Disallow sequence flow into Start Event; disallow out of End Event

(Keep pools/lanes rules for Step 6.)

**Acceptance**
- You can connect nodes with correct arrows/dashes; invalid connections are blocked.

---

## Step 4 — Add BPMN palette + “create BPMN view” UX
**What to implement**
- Add BPMN palette/config:
  - `src/notations/bpmn/palette.ts` (or `src/domain/config/bpmnPalette.ts`)
- Update “Create view” UI to offer:
  - BPMN Process Diagram → creates `View.kind='bpmn'`
- Update diagram toolbar/toolbox:
  - show BPMN node tools when `view.kind==='bpmn'`

**Acceptance**
- User can create BPMN views and place Task/Start/End/Gateway nodes and Sequence Flows via UI.

---

## Step 5 — Add BPMN properties panel editors (v1)
**What to implement**
- Node properties:
  - name
  - node subtype fields (optional): taskType, gateway type (fixed as exclusive for v1)
- Relationship properties:
  - name/label for sequence flow
  - optional: condition expression (string) for outgoing XOR flows

**State updates**
- Use existing generic mutations to update view node attrs and connection attrs.
- If missing, add:
  - `updateViewNodeAttrs(viewId, nodeId, patch)`
  - `updateViewConnectionAttrs(viewId, connId, patch)`

**Acceptance**
- Editing names/labels updates live and persists.

---

## Step 6 — Add Pools (container behavior) and enforce pool rules (recommended v2)
Pools are the biggest BPMN-specific behavior difference.

**What to implement**
- Add `bpmn.pool` as a container-like node:
  - render with header band
  - provides a “containment area”
- Define a simple containment policy:
  - When moving a node into a pool’s bounds, assign `parentId = poolNodeId` (if you have parent support)
  - Or, simpler v1: treat pool as a background shape (no parent), but use it in routing/validation

**Rules**
- Sequence flows must stay within the same pool
- Message flows (if enabled) connect across pools

**Diagram behavior**
- Pool bounds act as obstacles for routing (optional)
- Selection/move/resize should behave predictably

**Acceptance**
- Pools can be used to structure processes; connection rules respect pools.

---

## Step 7 — Drill-down linking ArchiMate → BPMN (schema already done)
**What to implement**
- In ArchiMate properties (Business Process / Business Function):
  - “Create BPMN diagram for this element”
  - creates BPMN view:
    - `kind:'bpmn'`
    - `ownerRef: { kind:'archimate', id:<elementId> }`
- List/open linked BPMN views from the owning ArchiMate element.

**Acceptance**
- From ArchiMate, create/open BPMN detail diagrams.

---

## Notes for starting in a new chat
When starting implementation, provide:
- The current zip of the codebase (with prep steps completed)
- The step number you want implemented next from this plan
- Whether you want Pools in v1 or v2 (recommended: v2, after basic BPMN works)

---
