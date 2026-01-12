# Autorouting Baseline (Current Behavior)

This document describes the **current** orthogonal autorouting implementation in this repository.

It exists for two reasons:

1. To make future refactors (e.g. A* grid routing) safer by documenting expectations.
2. To encode a stable set of **behavioral invariants** in unit tests.

Primary implementation: `src/components/diagram/connectionPath.ts` → `orthogonalAutoPolyline()`.

Related inputs come from:
- `src/components/diagram/orthogonalHints.ts` (infers `preferStartAxis` / `preferEndAxis` from anchors)
- `src/components/diagram/layers/DiagramRelationshipsLayer.tsx` (collects obstacles + passes hints)

## Inputs

`orthogonalAutoPolyline(a, b, hints)`

- `a`, `b`: endpoints in model coordinates.
- `hints` (optional):
  - `preferStartAxis?: 'h'|'v'`: preferred axis for the **first** segment.
  - `preferEndAxis?: 'h'|'v'`: preferred axis for the **last** segment.
  - `gridSize?: number`: used when choosing a candidate “channel” coordinate.
  - `obstacles?: Rect[]`: rectangles (typically other nodes) to avoid.
  - `obstacleMargin?: number`: inflated margin around obstacles.
  - `laneSpacing?: number`, `maxChannelShiftSteps?: number`, `laneOffset?: number`: parameters for searching alternative channels.

## Output

Returns a polyline `Point[]` where each segment is orthogonal (horizontal or vertical). The output is later:
- turned into an SVG path string (`polylineToSvgPath()`)
- used to compute label placement (`polylineMidPoint()`)
- used to compute marker direction (`endTangentForPolyline()`)

## High-level routing strategy

The current router is **candidate-based** rather than grid-based:

1. **Fast-path aligned endpoints (no obstacles)**
   - If `a.x === b.x` or `a.y === b.y` and there are **no obstacles**, return `[a, b]`.

2. **Stable legacy default (no hints, no obstacles, not aligned)**
   - For a diagonal connection with no hints/obstacles, prefer **vertical-then-horizontal**:
     - `[a, { x: a.x, y: b.y }, b]`

3. **Base candidates**
   - If aligned: `[a, b]`
   - Else: two L-shapes:
     - vertical-then-horizontal (VH)
     - horizontal-then-vertical (HV)

4. **Scoring**
   - Candidate score includes:
     - Manhattan length
     - small penalty per extra segment
     - **very large penalties** for violating `preferStartAxis` / `preferEndAxis` (10,000 each)
     - **huge penalty** per obstacle intersection (`hits * 100,000`)

5. **Obstacle avoidance via 3-segment “channels”**
   - If obstacles exist and the best base candidate intersects obstacles, the router generates additional 3-segment candidates:
     - vertical channel: `[a → (mx,a.y) → (mx,b.y) → b]`
     - horizontal channel: `[a → (a.x,my) → (b.x,my) → b]`
   - It searches around a base channel coordinate (midpoint between endpoints, optionally snapped to `gridSize`) and tries offsets:
     - `0, +1, -1, +2, -2, ...` multiplied by `laneSpacing`
   - `laneOffset` can shift the entire channel family.

6. **Simplification**
   - The router deduplicates points and removes collinear midpoints so you get a minimal polyline.

## Behavioral invariants (locked by tests)

The unit tests in `src/components/diagram/connectionPath.test.ts` are the contract for the current router.
Key invariants include:

1. **Aligned (no obstacles) ⇒ straight**
2. **Diagonal (no hints, no obstacles) ⇒ VH default**
3. **Aligned but blocked ⇒ detour (promote to 3-segment route)**
4. **Explicit bend points override autoroute**
5. **Axis hints are respected**
   - When a 2-segment route can satisfy a hint, it is chosen.
   - When both ends must be the same axis (HH or VV), it promotes to a 3-segment route.
6. **Deterministic output**
   - Given identical inputs, routing results must be identical (to avoid UI jitter).

## Notes / limitations

- The router does *not* do global optimization or obstacle-aware incremental reroute.
- Obstacle avoidance is limited to a family of 3-segment channel candidates.
- “Beauty” post-processing is currently limited to dedupe + collinear simplification.
