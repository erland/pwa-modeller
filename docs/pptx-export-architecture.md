# PPTX export architecture

This codebase supports two PPTX diagram strategies:

1) **Image-based** export (stable, default)
   - Produces a slide with a full-bleed PNG.
   - Entry point: `src/export/pptx/generatePptxV1_pptxgenjs.ts` → `generatePptxBlobV1(…)`

2) **Diagram IR based** export (editable, experimental)
   - Produces shapes/lines that are meant to be editable in PowerPoint.
   - Entry point: `generatePptxBlobFromDiagramIR(…)`

## Boundaries

To keep the PPTX stack maintainable, each layer has a strict responsibility:

### Adapters (workspace → IR)
- Location: `src/export/pptx/adapters/*`
- Responsibility:
  - Read workspace-specific data structures.
  - Produce a `PptxDiagramIR` + optional `PptxPostProcessMeta`.
- Must **not** call `pptxgenjs` directly.

### Writer (IR → pptxgenjs)
- Location: `src/export/pptx/writer/*`
- Responsibility:
  - Take a `PptxDiagramIR` and render it onto a slide.
  - Keep canonical conventions (e.g. altText markers for post-processing).
- Must **not** import workspace/model/analysis code.

### Document orchestration
- Location: `src/export/pptx/generatePptxV1_pptxgenjs.ts`
- Responsibility:
  - Create the PptxGenJS document.
  - Add slides, footer, image embedding.
  - Select which adapter/writer to use.
  - Run post-processing (`postProcessPptxWithJsZip`).

### Internal helpers
- Location: `src/export/pptx/internal/*`
- Purpose:
  - Shared document setup (`pptxDoc.ts`)
  - Shared writing/post-processing (`pptxWrite.ts`)
  - Shared artifact conversion (`imageArtifacts.ts`)

## Guideline

If you need to add a new PPTX export source:

1) Create a new adapter that outputs `PptxDiagramIR`.
2) Reuse the writer (`renderPptxDiagramIR`).
3) Wire it from the orchestration layer.

Avoid adding workspace-specific logic inside the writer.
