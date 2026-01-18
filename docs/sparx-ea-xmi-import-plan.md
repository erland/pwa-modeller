# Sparx EA UML XMI Import — Step-by-step implementation plan (Milestone A first)

This plan is designed so **each step can be implemented in a single prompt**. It includes a few prep steps that make the actual importer much easier and more reliable. The focus is **Milestone A: semantic import** (packages/folders + elements + relationships + members) without diagram geometry. Diagram import is an optional later milestone.

---

## Scope and assumptions

- Source format: **Sparx Enterprise Architect UML export via XMI** (varies by EA version and export settings).
- Target: your existing import pipeline (**Import IR → applyImportIR → domain model**).
- Output quality goal (Milestone A):
  - correct **UML element types** (class/interface/enum/datatype/primitive/component/artifact/node/device/executionEnvironment/usecase/actor/package/note)
  - correct **relationship types** (association/aggregation/composition/generalization/realization/dependency/include/extend/deployment/communicationPath)
  - correct **classifier members** stored in `element.attrs.attributes/operations` (parameters included)
  - preserve `xmi:id`, EA GUIDs and tagged values in `externalIds` / `taggedValues`

---

## Step 1 — Promote XML helpers into a shared import utility

**Goal:** Reuse your existing XML parsing helpers (currently in BPMN importer) for XMI.

**Implement**
- Create: `src/import/framework/xml.ts` (or `src/import/xml.ts`)
- Move/copy from `src/import/bpmn2/xml.ts`:
  - `parseXml(bytes)`, `localName(el)`, `attr(el, name)`, `children(el)`, `child(el, name)` helpers
  - Any namespace-tolerant attribute lookup (e.g., `xmi:id` may appear as `id` with prefix).
- Update BPMN importer to import from the shared module (small refactor).

**Acceptance**
- Existing BPMN import still works.
- New module compiles and is used by BPMN code.

---

## Step 2 — Add XMI reference resolution utilities

**Goal:** Make XMI parsing manageable: resolve `xmi:id` references, `href`, and space-separated IDREF lists.

**Implement**
- Add: `src/import/eaXmi/resolve.ts`
- Provide utilities:
  - `buildXmiIdIndex(doc: Document): Map<string, Element>`
  - `resolveById(index, id): Element | undefined`
  - `parseIdRefList(value: string | undefined): string[]`
  - `resolveHrefId(href: string): string | undefined` (extract after `#`)
- Add: `src/import/eaXmi/xmi.ts` with constants:
  - known attribute names: `XMI_ID = ['xmi:id','id']`, `XMI_TYPE = ['xmi:type','type']`, etc.
  - helper `getXmiId(el)` / `getXmiType(el)`

**Acceptance**
- Unit tests for:
  - id index creation
  - resolving simple id, `href`, and IDREF lists

---

## Step 3 — Create Sparx EA XMI importer skeleton (sniff + registry)

**Goal:** Add importer entrypoint without parsing everything yet.

**Implement**
- Create: `src/import/eaXmi/eaXmiImporter.ts`
  - `id: 'ea-xmi-uml'`
  - `sniff(bytes, filename?)` checks:
    - XML contains `xmi:XMI` root (prefix may vary)
    - presence of `uml:Model` / `uml:Package` / `xmi:Extension` strings typical for EA
  - `import(bytes, options) => ImportIR`
- Register in `src/import/framework/builtins.ts` (or your registry file).

**Acceptance**
- App builds.
- Import menu shows the new importer (or it’s discoverable by sniffing).
- A dummy import of a minimal file fails gracefully with a clear error message.

---

## Step 4 — Parse package hierarchy to folders (policy-compliant)

**Goal:** Implement your package mapping policy: **packages → folders**, not `uml.package` elements (in Milestone A).

**Implement**
- In `eaXmiImporter.import()`:
  - parse XML doc
  - find the root UML model/package nodes
  - walk nested packages (EA typically uses `packagedElement xmi:type="uml:Package"` or similar)
- Build Import IR folders:
  - create stable folder paths/nodes using names
  - preserve package ids in `externalIds` for folders if your IR supports it; otherwise store mapping in importer state for element placement.

**Acceptance**
- Import IR contains folder structure that matches UML package nesting.
- No `uml.package` elements are created in Milestone A (unless you intentionally set an option).

---

## Step 5 — Parse UML classifiers into elements (type mapping + minimal attrs)

**Goal:** Import the main UML element set that shows up in class/component/deployment/use case models.

**Implement**
- Create: `src/import/eaXmi/parseElements.ts`
- Map EA/XMI classifier kinds to your qualified types using `src/import/eaXmi/mapping.ts`:
  - `uml:Class` → `uml.class`
  - `uml:Interface` → `uml.interface`
  - `uml:Enumeration` → `uml.enum`
  - `uml:DataType` → `uml.datatype`
  - `uml:PrimitiveType` → `uml.primitiveType`
  - `uml:Component` → `uml.component`
  - `uml:Artifact` → `uml.artifact`
  - `uml:Node` → `uml.node`
  - `uml:Device` → `uml.device`
  - `uml:ExecutionEnvironment` → `uml.executionEnvironment`
  - `uml:UseCase` → `uml.usecase`
  - `uml:Actor` → `uml.actor`
  - `uml:Comment` → `uml.note` (or keep as note/comment)
- For each element:
  - set `name`
  - `externalIds`: include `xmi:id` + any EA GUID if present (EA often has `ea_guid`)
  - `taggedValues`: stereotypes + tags when easy to extract (don’t overdo yet)
  - place into correct folder based on owning package

**Acceptance**
- Import creates elements under correct folders.
- Types are recognized by the app (no unknown warnings).

---

## Step 6 — Parse classifier members (attributes, operations, parameters)

**Goal:** Populate `element.attrs.attributes/operations` so imported class/datatype/interface render correctly.

**Implement**
- Create: `src/import/eaXmi/parseMembers.ts`
- For each classifier element:
  - parse `ownedAttribute` → `UmlAttribute`:
    - `name`, `type` (string: resolved type name if possible), `visibility`
    - optional: `defaultValue`, `isStatic`
    - multiplicity from `lowerValue` / `upperValue` if present (store as `multiplicity` string or map to your existing fields)
  - parse `ownedOperation` → `UmlOperation`:
    - `name`, `visibility`, `isStatic`, `isAbstract`
    - parse `ownedParameter` → `UmlParameter`:
      - `name`, `type`, direction (in/out/return)
    - set `returnType` from `return` parameter if present
- Use your centralized domain utilities:
  - build attrs using the types from `src/domain/uml/members.ts`
  - (optional) run `sanitizeUmlClassifierAttrs` on the produced attrs

**Acceptance**
- Imported classes/datatype show attributes/operations compartments.
- Parameters are preserved (even if not rendered fully yet).

---

## Step 7 — Parse relationships (generalization/realization/dependency/include/extend)

**Goal:** Get the “easy” relationships working first (non-association-end heavy).

**Implement**
- Create: `src/import/eaXmi/parseRelationships.ts`
- Parse:
  - `uml:Generalization`:
    - specific → general (child → parent)
    - map to `uml.generalization`
  - `uml:InterfaceRealization` or realization patterns:
    - classifier → interface
    - map to `uml.realization`
  - `uml:Dependency`:
    - client → supplier
    - if stereotype indicates include/extend, map to `uml.include` / `uml.extend`
    - else `uml.dependency`
  - For use case include/extend:
    - detect EA patterns (may appear as dependency with stereotype)
- Populate:
  - `sourceId`, `targetId`
  - `externalIds`, `taggedValues`, `attrs.stereotype` when present

**Acceptance**
- Imported models show generalization/realization/dependency/include/extend lines.
- Validation passes for endpoint sanity checks you added.

---

## Step 8 — Parse associations + end metadata (roles, multiplicity, navigability)

**Goal:** Import associations in a way that preserves the important semantics your UI will edit later.

**Implement**
- In `parseRelationships.ts` add association support:
  - `uml:Association` (often via `packagedElement xmi:type="uml:Association"`)
  - Determine ends:
    - `ownedEnd` / `memberEnd` references
  - Resolve end properties:
    - role name (end name)
    - multiplicity: lower/upper
    - navigability: detect `navigableOwnedEnd` or EA-specific flags
    - aggregation kind: none/shared/composite → map to
      - `uml.association` / `uml.aggregation` / `uml.composition` (prefer mapping by aggregation kind)
- Store end metadata into `relationship.attrs` using your standardized fields:
  - `sourceRole`, `targetRole`, `sourceMultiplicity`, `targetMultiplicity`, `sourceNavigable`, `targetNavigable`, `stereotype`

**Acceptance**
- Associations are imported with correct endpoints.
- End metadata is present in the model JSON (inspect) and survives reload.

---

## Step 9 — Normalize + finalize Import IR, then apply

**Goal:** Ensure output is stable, repeatable, and compatible with `applyImportIR`.

**Implement**
- Ensure:
  - all created elements/relationships have stable IDs (IR ids can be generated; keep `externalIds` for source ids)
  - folder placement correct
  - unknown types fall back to a safe type (prefer `uml.note` or a generic UML element only if needed)
- Run your existing IR normalization hooks (if any), then return IR.

**Acceptance**
- End-to-end import produces a valid model that can be saved/reopened.
- No crashes in apply/import.

---

## Step 10 — Add tests + a couple real-world fixtures

**Goal:** Prevent regressions and “almost works” importer behavior.

**Implement**
- Add tests under `src/import/eaXmi/__tests__/`:
  - `sniff` tests (EA-like XMI vs non-XMI)
  - element parsing test (class/interface/datatype with members)
  - relationships tests (generalization + association end metadata)
- Add 1–2 small fixture files (trimmed EA exports) under `src/import/eaXmi/__fixtures__/`:
  - minimal class diagram model
  - minimal use case model with include/extend

**Acceptance**
- `npm test` passes.
- Fixtures import deterministically.

---

# Optional Milestone B — Diagram import (do later)

## Step B1 — Parse EA diagram objects + coordinates into IR views
- Extract diagrams (EA stores diagram info in `xmi:Extension` or EA-specific nodes).
- Emit IR `views`, `nodes` with bounds, and `connections` with routing/waypoints if available.

## Step B2 — Map diagram nodes to existing imported elements
- Use `externalIds` (xmi:id / ea_guid) to attach view nodes to semantic elements.

---

## Notes & conventions to follow while implementing

- Use `externalIds` consistently:
  - `{ system: 'ea-xmi', id: <xmi:id> }` and if present `{ system: 'ea', id: <ea_guid> }`
- Keep types as your qualified type strings (e.g., `uml.class`), not raw `uml:Class`.
- Prefer storing unresolved type refs as **type name strings** (plus tagged values for raw refs) rather than building a full type system immediately.
