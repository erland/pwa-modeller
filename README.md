# EA Modeller

A **client-side Progressive Web App** for **Enterprise Architecture modelling** with a pragmatic **ArchiMate® 3.2–oriented** domain model.

**Live app (GitHub Pages):** https://erland.github.io/pwa-modeller/

---

## What you can do (current MVP)

### Model & repository management
- Create a new model and edit model metadata.
- Open/import a model from file.
- Save/export your model as a JSON file.
- Work offline: the app persists state locally (so you don’t lose work on refresh).

### ArchiMate elements & relationships
- Create, edit and delete **elements** (layer + type) and **relationships** (type + source + target).
- Edit element/relationship properties in the **Properties panel**.
- Support for **tagged values** and **external ID references** in the domain model (used for interoperability and future connectors).

### Views (diagrams)
- Create views and place elements onto a canvas.
- Move/resize nodes and manage view layout.
- Add simple **view objects** (e.g. notes/labels/group boxes/dividers) that live only inside a view.
- Render relationships with appropriate markers/line styles and export the diagram.

### Validation, reporting & export
- Run basic validation and review issues in the validation workspace.
- Generate simple reports (e.g. element list) and export to **CSV**.
- Export diagrams to **SVG**.

### Import (interoperability)
- Import **ArchiMate Model Exchange File Format (MEFF)** (XML) via a small importer framework:
  - sniff → parse → map types → apply into the internal model
  - collects an import report for unknown / unmapped types

---

## Architecture overview

The project follows a simple layered structure:

- **`src/domain/`** – Pure TypeScript domain model
  - Core types (`Model`, `Element`, `Relationship`, `View`, folders, view objects)
  - ArchiMate palette + viewpoint config (`src/domain/config/*`)
  - Validation and reporting helpers
  - “Unknown type” handling to keep imports resilient

- **`src/store/`** – Application state & persistence
  - Central `modelStore` (external store) + `useModelStore(…)` hook (`useSyncExternalStore`)
  - Serialization/deserialization helpers (`serializeModel` / `deserializeModel`)
  - Local persistence (localStorage) and file download helpers

- **`src/components/`** – UI
  - `model/` – navigator, CRUD dialogs, properties panel
  - `diagram/` – canvas, geometry/interaction helpers, relationship visuals, SVG export
  - `reports/` + `validation/` – dedicated workspaces
  - `shell/` – app layout (header/sidebars)

- **`src/import/`** – Import pipeline
  - Importer framework + built-in MEFF importer
  - Intermediate representation (IR) to decouple parsing/mapping from applying into the domain model

### Why HashRouter?
The app uses **`HashRouter`** (see `src/App.tsx`) to work cleanly on **GitHub Pages** without server-side route rewrites.

---

## Project structure (high level)

```text
src/
  domain/        # domain model + ArchiMate config + validation/report helpers
  store/         # modelStore, persistence, serialization, downloads
  components/    # UI workspaces (diagram/model/reports/validation)
  import/        # MEFF importer + importer framework
  pages/         # Workspace + About
  pwa/           # service worker registration
  styles/        # CSS
  __tests__/     # Jest + Testing Library
docs/            # functional specification + development plan
```

---

## Local development

### Prerequisites
- Node.js (any recent LTS is fine)

### Install
```bash
npm install
```

### Run dev server
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Preview production build
```bash
npm run preview
```

### Tests
```bash
npm test
# or
npm run test:watch

# Generate a coverage report (writes to ./coverage)
npm run test:coverage
```

### Lint & format
```bash
npm run lint
npm run format
```

---

## Persistence & file format notes

- The editor persists store state to **localStorage** (debounced/idle) so you can refresh without losing work.
- Models are exported/imported as **JSON** (see `src/store/persistence/*`).
- The deserializer is set up for forward-compatibility:
  - migrations + sanitizers are applied on load (e.g., unknown types, tagged values, external IDs).

---

## Deployment (GitHub Pages)

This repo is configured to deploy the built app to GitHub Pages via GitHub Actions:

- Workflow: `.github/workflows/deploy-pages.yml`
- Live: https://erland.github.io/pwa-modeller/

---

## Status / license

A formal license file has not been added yet (contact repository owner to get a license).

