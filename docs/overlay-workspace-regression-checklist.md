# Overlay workspace regression checklist

Use this checklist when validating changes to overlay functionality, especially after refactors.

## Setup

- Start with a model loaded (new or imported).
- Confirm you can reach the **Overlay** workspace from:
  - Top-level navigation **Overlay**
  - Model Actions → **Open Overlay workspace…**
  - Header **Overlay** chip (if present)

## Overlay lifecycle (Load / Save / Clear)

1. Open **Overlay → Overview**.
2. Click **Load overlay…** and select a valid overlay JSON file.
   - Expected: overlay count increases; Status panel reflects the new overlay entry count.
3. Click **Save overlay…** (or **Save as…**).
   - Expected: a JSON file is downloaded.
   - Expected: header Overlay chip clears the dirty marker ("*") immediately after export.
4. Make a small overlay change (e.g., import a CSV row, or edit a tag in Properties).
   - Expected: header Overlay chip shows dirty marker ("*") after the change.
5. Click **Clear**.
   - Expected: confirmation is shown.
   - Expected: overlay entries are cleared; Status panel shows zero entries.
   - Expected: persisted overlay for the current model signature is removed.

## Survey CSV export/import

1. Go to **Overlay → Survey CSV**.
2. Export CSV for **Elements** with at least one key.
   - Expected: CSV contains a header row and a `#model_signature` row.
3. Modify one exported row value and re-import.
   - Expected: overlay value applies to the matching target.
4. Repeat import using different separators:
   - Expected: import works with `,`, `;`, and tab (`\t`) separators.
5. If the model signature row is modified:
   - Expected: import produces a signature mismatch warning but still imports data.

## Diagnostics

1. Go to **Overlay → Diagnostics**.
2. With a clean model and matching overlay:
   - Expected: Orphans and Ambiguous sections are empty.
3. Create a known orphan:
   - Import or load overlay with an external ref that does not exist in the model.
   - Expected: it appears in **Orphans**.
4. Create a known collision/ambiguity:
   - Ensure two model targets share the same external id key (in a test model or fixture).
   - Expected: **Collisions** and/or **Ambiguous** show the problematic key.
5. Missing external IDs:
   - Expected: lists element/relationship counts missing external IDs when present.

## Coverage

1. Go to **Overlay → Coverage**.
2. Add required keys (one per line) and save.
   - Expected: the list persists on reload for the same model signature.
3. Verify completeness metrics:
   - Expected: element/relationship completion percentages change as you apply tags.
4. Effective tags:
   - Expected: core tagged values count toward coverage, and overlay overrides are reflected.

## Navigation and smoke

- Switching between workspaces (Workspace/Analysis/Overlay/Validation) keeps state.
- The app builds and tests pass.
- No duplicate/legacy overlay menu items remain in Model Actions (only the entry point).
