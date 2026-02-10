# Domain service boundary

This repo uses a simple layering rule to keep the codebase maintainable:

## UI layers

- `src/components/**`
- `src/pages/**`
- `src/portal/**`
- `src/publisher/**`

These folders contain React composition, rendering, and user interaction.

## Non-UI (heavy logic) layers

- `src/domain/**` (model rules, validation, algorithms)
- `src/diagram/**` (routing, z-order, diagram math)
- `src/store/**` (state + orchestration)

## Enforced rule

Files in **`src/domain/**`, `src/diagram/**`, and `src/store/**` must not import from UI folders**.

Why: domain/diagram/store should remain usable and testable without React.

## Guardrail

`npm run check:boundaries` runs `scripts/check-domain-boundaries.mjs` and is wired into:

- `npm run build`
- `npm test`
- `npm run lint`

If you hit a violation, the usual fix is to:

1. Move the heavy logic into `src/domain/**` (or `src/diagram/**`).
2. Export a small function/service.
3. Let UI call into that function/service.
