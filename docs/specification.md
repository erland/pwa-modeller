# Functional Specification – Enterprise Architecture Modeling Tool (ArchiMate® 3.2)

## 1. Purpose and Scope

### 1.1 Purpose

The purpose of this tool is to support enterprise architects and related stakeholders in modeling, analyzing, and communicating enterprise architectures using the ArchiMate® 3.2 enterprise architecture modeling language.

The tool focuses on:
- Providing a simple, coherent environment for creating and maintaining ArchiMate models.
- Enabling creation of clear, stakeholder-oriented views of the architecture.
- Offering a minimal set of features that can be extended in later versions.

### 1.2 Scope (MVP)

The initial version (MVP) covers:

- A single-user modeling environment.
- A single model repository at a time.
- Support for core ArchiMate 3.2 elements and relationships across layers.
- Creation and editing of diagrams (views) using ArchiMate viewpoints.
- Basic navigation and search.
- Basic persistence of models (open, save, create new).
- Simple reporting in the form of generated lists and summaries.

The following are explicitly **out of scope** for the MVP (but may be considered later):
- Real-time multi-user collaboration.
- Integration with external EA repositories or ALM tools.
- Advanced analysis such as simulation or automatic impact scoring.
- Automated model validation against organization-specific rules.
- Custom meta-model extensions beyond the ArchiMate specification.

---

## 2. Stakeholders and User Roles

### 2.1 Stakeholders

- **Enterprise Architect** – Primary user who creates and maintains the overall architecture model.
- **Solution Architect** – Contributes more detailed views, particularly for application and technology layers.
- **Business Architect / Business Analyst** – Focuses on business layer models and capability/strategy views.
- **IT Manager / Portfolio Manager** – Consumes views and reports for decision making.
- **Non-technical Stakeholders** – Consume simplified views and diagrams.

### 2.2 User Roles (MVP)

For MVP, all interactive users have the same functional capabilities. Role differences are mainly in how they use the tool (which viewpoints they prefer), not in access control.

Later versions may introduce differentiated permissions and role-based access.

---

## 3. Key Concepts and Definitions

- **Model** – A coherent set of ArchiMate elements, relationships, and views representing part or all of an enterprise architecture.
- **Element** – An ArchiMate concept, such as Business Actor, Application Component, Node, Capability, Outcome, etc.
- **Relationship** – An ArchiMate relationship between elements (e.g., Association, Realization, Serving, Flow, Composition).
- **Layer** – ArchiMate layers such as Business, Application, Technology, Physical, Strategy, Implementation & Migration.
- **View** – A diagram representing part of the model, typically constrained by a **Viewpoint**.
- **Viewpoint** – A specification of allowed elements, relationships, and intended audience/purpose of a view.
- **Folder / Package / Grouping** – Logical grouping mechanisms to organize elements and views.

---

## 4. High-Level Functional Overview

The tool offers the following high-level capabilities:

1. **Model Repository Management**
   - Create, open, and save models.
   - Organize model content into logical structures (folders/groupings).

2. **ArchiMate Language Support**
   - Create, edit, and delete ArchiMate elements and relationships, compliant with ArchiMate 3.2.
   - Support core layers and element types relevant to basic enterprise architecture modeling.

3. **Diagram and Viewpoint Management**
   - Create and manage views based on selected ArchiMate viewpoints.
   - Add, arrange, and connect elements on diagrams.
   - Configure basic visual properties for readability.

4. **Navigation and Querying**
   - Browse model contents in a structured navigator.
   - Search for elements by name and type.
   - Trace relationships and impact within the model.

5. **Reporting and Export (MVP)**
   - Generate simple textual and tabular summaries of model contents (e.g., lists of applications, capabilities).
   - Export diagrams as images for inclusion in external documents.

---

## 5. Detailed Functional Requirements

### 5.1 Model Repository Management

**FR-1 – Create New Model**
- The user can create a new, empty model.
- The user can specify at least:
  - Model name.
  - Optional short description.
- The system initializes a minimal folder structure (e.g., root folders for elements and views).

**FR-2 – Open Existing Model**
- The user can open an existing model from persistent storage.
- If the model is already open, the system prompts whether to replace the current model or cancel.

**FR-3 – Save Model**
- The user can save the current model to persistent storage.
- The system indicates if there are unsaved changes.
- If the model has not been saved before, the user is prompted to provide:
  - Model name (if not already set).
  - Storage location.

**FR-4 – Save Model As**
- The user can save the current model under a new name or to a new location, creating an independent copy.

**FR-5 – Model Properties**
- The user can view and edit basic model-level metadata:
  - Name.
  - Description.
  - Version (free-text).
  - Owner (free-text).
- Model properties are stored with the model.

**FR-6 – Model Organization**
- The user can:
  - Create, rename, and delete folders or groupings in the model tree.
  - Move elements and views between folders.
- Deleting a folder prompts the user to confirm removal of its contents, or to move them elsewhere.

---

### 5.2 ArchiMate Language Support (3.2)

**FR-7 – Supported Layers and Aspects**
- The tool supports creation and maintenance of elements and relationships for at least:
  - Strategy layer (e.g., Capability, Resource, Course of Action).
  - Business layer.
  - Application layer.
  - Technology and Physical layers.
  - Implementation & Migration layer.
- The tool supports Motivation and Implementation & Migration aspects such as Goals, Outcomes, Requirements, and Work Packages.

**FR-8 – Element Creation**
- The user can create ArchiMate elements by:
  - Selecting an element type from a palette or list.
  - Placing the element into:
    - The model repository (tree/list), and/or
    - A view (diagram).
- Each element has, at minimum:
  - Unique identifier (internal).
  - Name.
  - Optional description.
  - Element type (e.g., Business Process, Application Component).

**FR-9 – Element Editing**
- The user can edit:
  - Name.
  - Description.
  - Optional documentation notes (free-text).
  - Layer and type are fixed at creation time and cannot be changed to an incompatible type.

**FR-10 – Element Deletion**
- The user can delete an element.
- The system:
  - Warns if the element is used in any views or relationships.
  - Offers a summary of usage before confirmation.
  - On confirmation, removes all related diagram objects and relationships affected.

**FR-11 – Relationship Creation**
- The user can create relationships between two compatible elements using:
  - Relationship palette entries, or
  - A contextual action (e.g., drawing a connector).
- The tool constrains the available relationship types based on the ArchiMate 3.2 metamodel:
  - Only relationships permitted between the chosen element types are available.
  - If an attempted relationship is not allowed, the tool shows a clear explanation.

**FR-12 – Relationship Editing and Deletion**
- The user can:
  - Edit relationship name (if applicable).
  - Add description/notes.
  - Delete relationships from the model.
- Deleting a relationship removes it from all views where it appears.

**FR-13 – Element and Relationship Documentation**
- The user can open a detailed properties view for any element or relationship and:
  - Edit free-text documentation.
  - View where the element/relationship is used (list of views and related elements).

---

### 5.3 Diagram and Viewpoint Management

**FR-14 – Create View**
- The user can create a new view by:
  - Choosing a view name.
  - Selecting a viewpoint from a predefined list of supported ArchiMate viewpoints (e.g., Application Cooperation View, Capability Map, Layered View).
- The view is created in the model and appears in the navigation structure.

**FR-15 – View Properties**
- For each view, the user can edit:
  - Name.
  - Viewpoint.
  - Description / purpose.
  - Intended stakeholders (free-text).

**FR-16 – Add Elements to View**
- The user can:
  - Drag existing elements from the model repository onto a view.
  - Create new elements directly within the view (which also adds them to the model).
- The tool enforces viewpoint constraints:
  - Only element types allowed by the selected viewpoint can be added without warning.
  - If the user adds an element not typically allowed in the viewpoint, the system warns or flags the deviation.

**FR-17 – Arrange and Layout Elements**
- The user can:
  - Move elements on the canvas.
  - Resize element symbols (where appropriate).
  - Align elements horizontally/vertically.
  - Distribute elements evenly (optional in MVP; basic alignment is mandatory).

**FR-18 – Create Relationships on Views**
- The user can create relationships between elements directly on a view.
- When a relationship is created:
  - It is registered in the underlying model.
  - It appears in all other relevant views that display both source and target elements, if configured to show model relationships automatically (optional behavior, may be controlled later).

**FR-19 – View-Level Visual Formatting**
- The user can configure basic visual properties for elements and relationships on a view:
  - Fill or border emphasis styles (e.g., to distinguish layers or status).
  - Font emphasis for names (e.g., bold or italic).
- Visual formatting does **not** change the underlying semantics of elements or relationships.

**FR-20 – Duplicate View / Clone View**
- The user can duplicate an existing view:
  - The new view references the same underlying model elements and relationships.
  - Layout and formatting are initially identical but can diverge independently.

**FR-21 – View Deletion**
- The user can delete a view from the model.
- Deleting a view:
  - Does **not** delete underlying elements or relationships.
  - Removes only the diagram representation.

---

### 5.4 Navigation and Querying

**FR-22 – Model Navigator**
- The tool provides a structured navigator for:
  - Model-level folders.
  - Elements grouped by type or folder.
  - Views organized into folders.
- Selecting an item in the navigator:
  - Opens its properties, and
  - For views, opens the corresponding diagram.

**FR-23 – Search by Name**
- The user can search for elements and views by text.
- Search supports:
  - Partial matches.
  - Case-insensitive matching.
- Search results display names, types, and model location (folder) and allow direct navigation.

**FR-24 – Relationship Tracing**
- From an element, the user can:
  - See a list of directly connected elements, grouped by relationship type and direction (incoming/outgoing).
  - Optionally open a simple graph-style or tree-style view that shows neighboring elements and relationships.
- The user can navigate from one element to connected elements via this view.

---

### 5.5 Reporting and Export

**FR-25 – Element List Reports**
- The user can generate basic reports such as:
  - List of Business Processes.
  - List of Application Components.
  - List of Capabilities.
- Reports show at least:
  - Name.
  - Type.
  - Layer.
  - Optional folder or grouping.
- Reports can be:
  - Viewed within the tool.
  - Exported in a tabular format suitable for further processing.

**FR-26 – View Inventory Report**
- The user can generate a list of all views in a model, including:
  - View name.
  - Viewpoint.
  - Short description (if available).

**FR-27 – Diagram Export as Image**
- The user can export a view as an image (e.g., for inclusion in documents or presentations).
- Exported images preserve:
  - Layout.
  - Element names.
  - Relationship labels.

---

### 5.6 Model Consistency and Validation (Basic)

**FR-28 – Basic Consistency Checks**
- The tool performs basic consistency checks such as:
  - Relationships refer to existing elements.
  - No duplicate internal identifiers.
- When inconsistencies are detected (e.g., due to import or unusual operations), the tool:
  - Notifies the user.
  - Offers a basic explanation of the problem.

**FR-29 – ArchiMate Structural Rules (Minimal)**
- The tool enforces a minimal set of ArchiMate structural rules:
  - Allowed/forbidden relationships by element type.
  - Layering consistency (e.g., restricting certain cross-layer relationships where not allowed).
- Violations are prevented at creation time or flagged clearly.

---

## 6. Non-Functional Aspects (High-Level, MVP-Oriented)

> Note: These are stated at a high-level and do not prescribe any specific technical implementation.

**NFR-1 – Usability**
- The user interface should be intuitive for users familiar with ArchiMate concepts.
- Common operations (create/open/save model, create view, add elements, draw relationships) should be accessible through simple actions.

**NFR-2 – Performance**
- Basic operations (opening small to medium-sized models, adding elements, editing views) should complete without noticeable delay in typical usage scenarios.

**NFR-3 – Portability of Models**
- Models saved by the tool should remain readable by future versions of the tool.
- The structure of stored models should preserve ArchiMate semantics, enabling potential future interoperability.

**NFR-4 – Reliability**
- The tool should minimize risk of data loss by:
  - Indicating unsaved changes.
  - Handling unexpected termination by avoiding corruption of existing saved models.

---

## 7. Roadmap – Potential Future Enhancements (Non-MVP)

The following features are not part of the initial functional scope but are identified for possible later versions:

- **Advanced Validation**
  - Rich validation rules beyond the base ArchiMate specification.
  - Organization-specific modeling guidelines.

- **Traceability and Impact Analysis**
  - End-to-end trace views (e.g., from business capabilities to applications and infrastructure).
  - Change impact analysis and what-if scenarios.

- **Collaboration**
  - Multi-user access control.
  - Change history, baselines, and comparison of model versions.

- **Integration**
  - Import/export using standardized exchange formats.
  - Integration with project/portfolio management, CMDB, and requirements tools.

- **Customization**
  - Custom viewpoints.
  - Organization-specific libraries of patterns and templates.

---

## 8. Acceptance Criteria (MVP)

- A user is able to:
  1. Create a new model, define basic model properties, and save it.
  2. Create elements from at least the Strategy, Business, Application, Technology, Physical, and Implementation & Migration layers.
  3. Create valid relationships between elements in accordance with the ArchiMate 3.2 specification.
  4. Create at least three different views using standard viewpoints and populate them with elements and relationships.
  5. Navigate the model via a structured navigator and search for elements by name.
  6. Export at least one view as an image.
  7. Generate a simple report listing all Application Components (or another element type) in tabular form.

If all acceptance criteria are met and no critical defects are present in core workflows (model creation, editing, saving, and opening), the MVP is considered functionally complete.

---

## Auto layout

See `docs/auto-layout.md` for available auto-layout presets and guidance on when to use each.
