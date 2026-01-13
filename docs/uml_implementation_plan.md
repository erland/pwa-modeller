# UML Support Plan for EA Modeller PWA (Notations-ready)

This plan assumes the codebase already includes:
- `view.kind` (`archimate` | `uml` | `bpmn`)
- `getNotation(kind)` registry + notation guards
- notation-driven diagram rendering (nodes + relationship style + markers)
- cross-diagram schema field `View.ownerRef?: { kind; id }`
- notation contract generalized to string type IDs

Goal: **Add UML support** as *separate UML views* (no mixed ArchiMate/UML in the same view), with optional drill-down links from ArchiMate elements to UML diagrams.

---

## Step 1 — Add UML notation module + wire into registry
**What to implement**
- Create `src/notations/uml/index.ts` exporting `umlNotation: Notation`.
- Update `src/notations/registry.ts` so:
  - `getNotation('uml')` returns `umlNotation`
  - leave `bpmn` fallback as-is for now.

**Contract responsibilities in UML notation**
- `getElementBgVar(nodeType: string): string`  
  - return a neutral background var (e.g. same as existing “Application” or “Technology” var) or introduce a UML-specific CSS var if you prefer.
- `renderNodeSymbol({ nodeType, title }): ReactNode`  
  - for now return a simple UML box (see Step 2).
- `getRelationshipStyle(rel): RelationshipStyle`  
  - implement style mapping for UML relations (see Step 3).
- `canCreateNode({ nodeType }): boolean`  
  - return true only for UML node types you define (strings).
- `canCreateRelationship(…) => GuardResult`  
  - return allowed only for UML relationship types + endpoint compatibility (see Step 3).

**UML type IDs (strings) to start**
- Nodes:
  - `uml.class`, `uml.interface`, `uml.enum`, `uml.package`, `uml.note` (optional)
- Relationships:
  - `uml.association`, `uml.aggregation`, `uml.composition`, `uml.generalization`, `uml.realization`, `uml.dependency`

**Acceptance**
- App runs with `view.kind='uml'` without crashing.
- Creating relationships/nodes in UML views is blocked until Step 2+3 add actual UI affordances.

---

## Step 2 — Implement UML node rendering (Class diagram v1)
**What to implement**
- Add a UML renderer that draws a **compartment box**:
  - header: name (and optional stereotype)
  - compartments: attributes, operations (initially plain multiline strings)

**Where**
- Prefer placing rendering inside `src/notations/uml/` (keeps layering clean), e.g.:
  - `src/notations/uml/renderNodeSymbol.tsx`
  - `src/notations/uml/nodeTypes.ts` (constants and helpers)

**Data model (minimal, stored in view node)**
To avoid changing global domain element types immediately, store UML-specific text in `ViewNodeLayout.props` or similar existing extension mechanism (choose one):
- If you already have `viewNode.props` / `viewNode.style` / `viewNode.data`, use that.
- If not, add `ViewNodeLayout.attrs?: unknown` (optional) and sanitize similarly to relationship attrs.

Suggested shape:
```ts
type UmlNodeAttrs = {
  name?: string;          // default to element title if you reuse elements
  stereotype?: string;
  attributesText?: string;
  operationsText?: string;
};
```

**Behavior**
- Display `title` from existing element name if you reuse elements, otherwise use `attrs.name`.
- Keep resize/move working (already generic).

**Acceptance**
- UML boxes render in UML views.
- Selected node still shows selection frame and resize handle.

---

## Step 3 — Implement UML relationships: style + markers + basic rules
**What to implement**
- Relationship style mapping in UML notation using the centralized marker system:
  - `uml.generalization`: markerEnd = open triangle
  - `uml.realization`: markerEnd = open triangle + dashed line
  - `uml.dependency`: dashed + open arrow
  - `uml.association`: solid line, no marker by default (optional navigability later)
  - `uml.aggregation`: hollow diamond at source
  - `uml.composition`: filled diamond at source

**Markers**
- Extend the centralized marker registry in:
  - `src/diagram/relationships/markers.ts`
Add new marker kinds (string enum values) and SVG geometry for:
- `triangleOpen`
- `diamondOpen`
- `diamondFilled`

Update any switch/typing that lists `MarkerKind`.

**Rules (guards)**
Implement in `umlNotation.canCreateRelationship`:
- Allow only known UML relationship types.
- Allow any node endpoints initially (simplify), or enforce:
  - generalization/realization: between class/interface/enum
  - package dependency: between packages
(Keep it minimal for v1.)

**Acceptance**
- UML relationships draw with correct line style and markers.
- Orthogonal routing works (generic).
- No TypeScript/lint warnings introduced.

---

## Step 4 — Add UML palette + UML view creation UX
**What to implement**
- Add a UML palette/config similar to ArchiMate:
  - `src/domain/config/umlPalette.ts` (or `src/notations/uml/palette.ts`)
- Update the UI “create view” flow to allow selecting:
  - `View.kind = 'uml'`
  - diagram type = “UML Class Diagram” (store as `view.viewpoint` or `view.diagramType` if you have one; otherwise add a small string field)

**Minimal UI wiring**
- In whichever dialog/menu you use to create a new view:
  - add “UML Class Diagram”
  - set `kind:'uml'`
- In diagram toolbar:
  - show UML node tools when active view is UML (e.g. add node type buttons or reuse drag-drop from palette)

**Acceptance**
- User can create a UML view from UI and add UML Class/Interface/Enum nodes.

---

## Step 5 — Add properties panel editors for UML nodes and relationships
**What to implement**
- When selected object is a UML node:
  - show fields: Name, Stereotype, Attributes (multiline), Operations (multiline)
- When selected relationship is UML:
  - show relationship type dropdown (among UML types) and optional properties (like navigability later)

**Where**
- `src/components/model/properties/*`:
  - add a UML-specific properties component and route to it based on `view.kind === 'uml'` and node/rel type prefix `uml.`

**State updates**
- Use existing mutations for updating view object layout/attrs.
- If there’s no mutation for updating arbitrary attrs on view nodes/relationships, add:
  - `updateViewNodeAttrs(viewId, nodeId, patch)`
  - `updateViewConnectionAttrs(viewId, connId, patch)`

**Acceptance**
- Editing properties updates rendering live and persists.

---

## Step 6 — Drill-down linking between ArchiMate and UML views (schema already done)
**What to implement**
- In ArchiMate element properties panel:
  - button: **Create UML diagram for this element**
  - creates a UML view:
    - `kind:'uml'`
    - `ownerRef: { kind:'archimate', id:<elementId> }`
    - sensible folder placement (e.g. `Design/UML/<Element Name>/…`)
- Also list linked UML diagrams for the element:
  - search views where `view.ownerRef.id === elementId && ownerRef.kind==='archimate'`

**Acceptance**
- From an ArchiMate Application Component you can create/open linked UML diagrams.

---

## Step 7 — (Optional but recommended) UML import/export & validation workspace integration
**What to implement**
- Validation:
  - basic checks (e.g. “generalization cycles”, “unknown node types”) as a v1 stub
- Export:
  - ensure `exportSvg` supports UML markers via shared marker defs (already should)
- Later:
  - XMI import/export is big; keep out of v1 unless necessary.

**Acceptance**
- UML diagrams export to SVG cleanly; validation workspace doesn’t crash when selecting UML views.

---

## Notes for starting in a new chat
When starting implementation, provide:
- The zip of the current codebase (with steps 1–7 prep completed)
- The exact step number you want implemented next (from this plan)
- Any constraints on type naming (`uml.class` etc.) or folder structure for drill-down views

---
