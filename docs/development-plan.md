# Development Plan – Enterprise Architecture Modeling PWA (ArchiMate® 3.2)

This plan describes how an LLM-assisted implementation could proceed in **incremental, testable steps** using **React**, **TypeScript**, **Jest**, and PWA capabilities. Each step should be implementable in one coherent sweep and result in a working, testable application state.

---

## Step 1 – Project Skeleton, PWA Scaffold, and Tooling

### Goals
Establish a solid foundation for the PWA, coding standards, and automated tests.

### Scope
- Create a new project with:
  - React + TypeScript.
  - PWA support (manifest + basic service worker).
- Set up:
  - Jest + React Testing Library for unit and component tests.
  - ESLint and Prettier for linting and formatting.
  - Basic folder structure for:
    - `src/domain` (core model types and logic).
    - `src/store` (state management).
    - `src/components` (reusable UI pieces).
    - `src/views` or `src/pages` (screen-level components).
    - `src/pwa` (manifest and service worker if needed).
- Render a very simple “Hello, EA Tool” page.

### Testing
- A trivial Jest test that:
  - Verifies the root component renders without crashing.
- Linting and formatting integrated into the development workflow.

---

## Step 2 – Domain Model Foundations (Model, Elements, Relationships, Views)

### Goals
Define the core domain model that will be used consistently across the app.

### Scope
- Introduce TypeScript types and interfaces for:
  - `ArchimateLayer` (e.g., Strategy, Business, Application, Technology, Physical, ImplementationMigration).
  - `ElementType` (e.g., BusinessActor, BusinessProcess, ApplicationComponent, Node, Capability, Outcome, etc.).
  - `RelationshipType` (e.g., Association, Realization, Serving, Flow, Composition).
  - `Element`:
    - `id`
    - `name`
    - `description?`
    - `layer`
    - `type`
    - `documentation?`
  - `Relationship`:
    - `id`
    - `sourceElementId`
    - `targetElementId`
    - `type`
    - `name?`
    - `description?`
  - `Viewpoint` (metadata only: id, name, allowed element types, allowed relationship types, description).
  - `View`:
    - `id`
    - `name`
    - `viewpointId`
    - `description?`
    - `stakeholders?`
    - diagram-specific info (placeholders for layout, to be fleshed out in later steps).
  - `ModelMetadata`:
    - `name`
    - `description?`
    - `version?`
    - `owner?`
  - `Model`:
    - `id`
    - `metadata`
    - collections of elements, relationships, views, folders.

### Testing
- Pure unit tests covering:
  - Creation of elements and relationships via factory functions.
  - Validation that IDs are unique within a model (basic helper functions).
  - Simple invariants (e.g., an `Element` must have a `name` and `type`).

---

## Step 3 – State Management and Persistence Abstraction

### Goals
Provide an in-memory model store with a clear API and an abstraction layer for persistence.

### Scope
- Introduce a state management solution (e.g., a small custom store or a lightweight state library).
- Implement a `ModelStore` that:
  - Holds the current `Model` (or `null` if none loaded).
  - Exposes operations:
    - `createEmptyModel(metadata)`
    - `updateModelMetadata(…)`
    - `addElement(element)`
    - `updateElement(…)`
    - `deleteElement(id)`
    - `addRelationship(rel)`
    - `updateRelationship(…)`
    - `deleteRelationship(id)`
    - `addView(view)`
    - `updateView(…)`
    - `deleteView(id)`
  - Emits change notifications to the UI (via state management).
- Implement a simple persistence abstraction:
  - `serializeModel(model): string`
  - `deserializeModel(data: string): Model`
- No real UI beyond a basic debug panel displaying model JSON.

### Testing
- Unit tests for the store:
  - Adding/updating/deleting elements, relationships, and views.
  - Ensuring deletion of an element removes its relationships (or flags them for cleanup).
- Unit tests for `serializeModel` and `deserializeModel`:
  - Round-trip: serializing and then deserializing yields an equivalent model.

---

## Step 4 – Application Shell and Layout

### Goals
Create the basic application shell with navigation regions and placeholders for future functionality.

### Scope
- Implement a main layout with:
  - Header (application title + simple menu placeholders).
  - Left sidebar:
    - Placeholder for model navigation tree.
  - Main content area:
    - Placeholder for diagram canvas and reports.
  - Right sidebar:
    - Placeholder for properties/details panel.
- Introduce routing for:
  - “Model workspace” screen (primary screen).
  - “About” / “Help” screen (simple static content).
- Use responsive layout so it works on desktop and tablet screens.

### Testing
- Component tests:
  - Verify that the layout renders all main regions.
  - Verify that navigation/routing switches between workspace and about pages.
- Visual sanity checks via snapshot tests (optional).

---

## Step 5 – Model Management UI (New, Open, Save, Model Properties, Folders)

### Goals
Implement user-facing features for basic model lifecycle and organization.

### Scope
- Implement UI actions for:
  - **New Model**:
    - Dialog for model name and description.
    - Creates an empty model with default folder structure.
  - **Open Model**:
    - File selection (using browser file APIs).
    - Read content, `deserializeModel`, populate store.
  - **Save Model**:
    - If model has existing “file name” context, create a download (e.g., JSON).
    - Otherwise, prompt for a file name.
  - **Save Model As**:
    - Always prompt for file name and trigger download.
- Model properties dialog:
  - View and edit `name`, `description`, `version`, `owner`.
- Folder/grouping support:
  - Data structure for folders.
  - UI in left navigator to:
    - Create folder.
    - Rename folder.
    - Delete folder (with confirmation).
  - Ability to move elements and views into folders (e.g., via simple dropdown or drag-and-drop in a later step).

### Testing
- Unit tests of persistence utilities to ensure they produce valid downloadable JSON.
- Component tests:
  - Simulate creating a new model and verify metadata.
  - Simulate opening a model (mocking file input).
  - Simulate editing model properties and verifying store updates.
  - Simulate creating and deleting folders and verifying effects on model structure.

---

## Step 6 – Element and Relationship Palette and CRUD Operations

### Goals
Allow users to define ArchiMate elements and relationships in the model, independent of diagrams.

### Scope
- Define static configuration for:
  - Layers and element types.
  - Relationship types and allowed combinations (minimal subset aligned with ArchiMate 3.2).
- Implement an **Element Palette** UI:
  - User selects layer, then element type, then clicks “Create Element”.
  - Opens a dialog to provide:
    - Name.
    - Description (optional).
  - Adds element to the current model.
- Implement an **Element List** view:
  - Tabular list of elements (name, type, layer, folder).
  - Ability to:
    - Edit element properties (name, description, documentation).
    - Delete elements (with a warning if used in relationships/views).
- Implement basic **Relationship Management UI**:
  - A dedicated relationships panel/list:
    - Create relationship by selecting source and target from dropdowns and relationship type.
    - Edit relationship name/description.
    - Delete relationship.
  - Enforce allowed relationship types based on source/target element types.
  - Provide clear error messages if disallowed.

### Testing
- Unit tests for:
  - Checking allowed/forbidden relationships.
- Component tests:
  - Creating an element from the palette and verifying it appears in the element list.
  - Editing and deleting an element, ensuring relationships are cleaned up/flagged appropriately.
  - Creating, editing, and deleting relationships in the list.

---

## Step 7 – View and Viewpoint Management (Without Full Canvas Yet)

### Goals
Introduce views and viewpoints and connect them to the domain model, before adding a sophisticated diagram canvas.

### Scope
- Define a static list of supported viewpoints:
  - For example: Layered View, Capability Map, Application Cooperation View, Technology Usage View.
  - For each viewpoint, define:
    - ID, name.
    - Allowed element types.
    - Allowed relationship types.
    - Short description and intended stakeholders.
- Implement a **View Management UI**:
  - Create view:
    - Name.
    - Select viewpoint from dropdown.
    - Optional description and stakeholders (free-text).
  - View list:
    - Tabular/structured list of views with name, viewpoint, description.
    - Edit view properties.
    - Delete view.
- Establish association of views to folders in the model navigator.

### Testing
- Unit tests:
  - Viewpoint definition integrity (e.g., no invalid element type references).
- Component tests:
  - Creating, editing, and deleting views.
  - Verifying viewpoint constraints data is accessible for later canvas logic.

---

## Step 8 – Diagram Canvas: Adding Elements to Views and Basic Layout

### Goals
Provide a first functional diagram canvas for placing elements and connecting them in views.

### Scope
- Implement a simple diagram canvas component for a selected view:
  - Fetch elements that belong to the view (via view-specific diagram objects).
  - Show each as a rectangle with name and type.
- Introduce **Diagram Objects** in the model:
  - `DiagramNode`:
    - `id`
    - `viewId`
    - `elementId`
    - position (`x`, `y`)
    - size (`width`, `height`)
  - `DiagramConnection`:
    - `id`
    - `viewId`
    - `relationshipId`
    - any routing/hints (can be minimal at first).
- UI behavior:
  - Drag existing elements from the navigator or element list into the view:
    - Creates a `DiagramNode` at a default position.
  - Move elements by dragging them directly on the canvas.
  - Automatically draw lines for relationships when both source and target elements have `DiagramNode`s in the view.
- Viewpoint constraints:
  - When dragging or adding an element to a view, check if the element type is allowed for that viewpoint.
  - If not allowed:
    - Show a warning or block the action (configurable, but start with warning + allow or simple blocking behavior).

### Testing
- Unit tests:
  - Creation of `DiagramNode` and `DiagramConnection` and mapping from model elements/relationships.
- Component tests:
  - Adding an element to a view and verifying it appears as a node on the canvas.
  - Moving a node and verifying updated coordinates in the state.
  - Ensuring relationships are rendered only when both ends are present.

---

## Step 9 – View-Level Formatting and View Cloning

### Goals
Improve readability of diagrams and provide view duplication.

### Scope
- Extend `DiagramNode` with basic styling options:
  - Emphasis flags (e.g., “highlighted”).
  - Optional style tags (e.g., for layer-based color coding).
- Extend `View` with additional properties:
  - Default styling options per layer (e.g., higher-level configuration).
- Implement UI controls:
  - Per-node properties panel to toggle emphasis or style tags.
  - A “Clone view” action:
    - Creates a new view referencing the same elements and relationships.
    - Duplicates `DiagramNode` and `DiagramConnection` positions and styles.
- Implement view deletion behavior:
  - Remove all associated `DiagramNode` and `DiagramConnection` entries.
  - Underlying elements and relationships remain.

### Testing
- Unit tests:
  - Cloning logic for views and diagram objects.
- Component tests:
  - Changing node formatting and verifying the view updates.
  - Cloning a view and ensuring the new one contains equivalent diagram objects and styles.

---

## Step 10 – Model Navigation, Search, and Relationship Tracing

### Goals
Allow users to navigate large models efficiently and trace relationships.

### Scope
- Implement a **Model Navigator Tree**:
  - Shows folders.
  - Under each folder, lists elements and views.
  - Clicking an element:
    - Opens properties panel for that element.
  - Clicking a view:
    - Opens the view on the canvas.
- Implement **Search**:
  - Search box in the header or sidebar.
  - Search across element names and view names.
  - Display results as a list with type and folder.
  - Clicking a result navigates to that element or view.
- Implement **Relationship Tracing Panel**:
  - For a selected element, show:
    - Incoming relationships grouped by type.
    - Outgoing relationships grouped by type.
  - Allow clicking through to related elements and to views where relationship is visible (if implemented).

### Testing
- Unit tests:
  - Search functions (filter by name).
  - Relationship tracing helpers (retrieve incoming/outgoing relationships).
- Component tests:
  - User search flows and navigation from search results.
  - Navigating via the relationship tracing panel.

---

## Step 11 – Reporting and Export (Lists and Diagram Images)

### Goals
Provide simple reports and export capabilities consistent with the functional specification.

### Scope
- Implement **Element List Reports**:
  - Allow user to select an element category (e.g., Business Processes, Application Components, Capabilities).
  - Show a tabular report:
    - Name, type, layer, folder.
  - Provide an “Export as CSV” button.
- Implement **View Inventory Report**:
  - List all views with name, viewpoint, description.
  - Optional CSV export.
- Implement **Diagram Export as Image**:
  - Add a button on the view:
    - “Export as Image”.
  - Render canvas to an image (e.g., using canvas or SVG-to-image conversion).
  - Trigger download.

### Testing
- Unit tests:
  - Report generation functions (transforming model to tabular data).
- Component tests:
  - Generate a report and verify table structure and content.
  - Trigger export (mocking download behavior) and ensure the export function is called.

---

## Step 12 – Basic Model Consistency Checks and Structural Validation

### Goals
Introduce essential consistency and structural checks as defined in the functional spec.

### Scope
- Implement internal **consistency checks**:
  - Every relationship’s source and target refer to existing elements.
  - No duplicate IDs in elements, relationships, views, diagram nodes.
- Implement minimal **ArchiMate structural rules**:
  - A small configurable ruleset that specifies allowed relationships between element types.
  - Reuse configuration from Step 6.
  - Enforce constraints when:
    - Creating relationships.
    - Running explicit validation.
- Implement a **Validation Panel**:
  - User can run “Validate Model”.
  - Show a list of validation issues:
    - Type (error/warning).
    - Description.
    - Affected element/relationship.
  - Allow clicking an issue to navigate to the problematic object.

### Testing
- Unit tests:
  - Valid and invalid relationships according to the ruleset.
  - Consistency checks detecting orphan relationships.
- Component tests:
  - Running validation on a sample model and verifying issues are displayed.

---

## Step 13 – PWA Hardening, Offline Behavior, and UX Polish

### Goals
Ensure the application behaves well as a PWA and is pleasant to use.

### Scope
- Review and, if needed, refine:
  - Web app manifest (name, icons, display mode, start URL).
  - Service worker strategy:
    - Cache application shell assets.
    - Allow offline usage for already opened models (in-memory).
- UX improvements:
  - Indicate unsaved changes in the UI.
  - Confirm navigation away when there are unsaved changes.
  - Basic keyboard shortcuts (e.g., delete selected node, save).
- Responsiveness:
  - Ensure main layout works on tablet landscape.
  - Ensure essential functionality is accessible on smaller screens, even if diagram editing is more limited.

### Testing
- Manual testing on:
  - Installation as a PWA.
  - Offline mode (basic operations).
- Automated tests where feasible:
  - Verify that core components still render when model store is rehydrated from serialized data.
  - Ensure that basic workflows (create model, add element, create view, add node, save model) still pass.

---

## Step 14 – Example Seed Model and Documentation

### Goals
Provide a ready-to-use example and minimal documentation to validate end-to-end workflows.

### Scope
- Create a **seed model**:
  - A small example enterprise with:
    - A few capabilities, business processes, application components, and infrastructure nodes.
    - A handful of relationships and 2–3 views (e.g., Capability Map, Application Cooperation View).
- Add a simple **“Load Example Model”** action:
  - Replaces the current model with the seed example.
- Add basic documentation within the app:
  - “Getting Started” page.
  - Short instructions on:
    - Creating and saving models.
    - Creating elements, relationships, and views.
    - Using the canvas and reports.
- Verify that acceptance criteria from the functional specification can be met using this example model.

### Testing
- Unit tests:
  - Seed model passes validation (no structural errors).
- Manual end-to-end test:
  - Follow the acceptance criteria checklist and confirm each item is supported with the current implementation.

---

## Summary

By completing Steps 1–14 in order, the LLM (and you as the operator) can iteratively build a functioning PWA that:

- Implements the core functional requirements of the enterprise architecture modeling tool.
- Provides a gradual, testable evolution at each step.
- Aligns with ArchiMate® 3.2 semantics for elements, relationships, and viewpoints at a practical minimum level.
