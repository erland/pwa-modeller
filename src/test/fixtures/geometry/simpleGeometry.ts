/**
 * Small, reusable geometry fixtures for layout/route tests.
 * Keep these deterministic and human-readable.
 */

export type Rect = { x: number; y: number; width: number; height: number };
export type Pt = { x: number; y: number };

export const rectA: Rect = { x: 100, y: 100, width: 140, height: 60 };
export const rectB: Rect = { x: 360, y: 100, width: 140, height: 60 };

export const ptMidA: Pt = { x: rectA.x + rectA.width / 2, y: rectA.y + rectA.height / 2 };
export const ptMidB: Pt = { x: rectB.x + rectB.width / 2, y: rectB.y + rectB.height / 2 };

export const polylineAtoB: Pt[] = [
  { x: rectA.x + rectA.width, y: rectA.y + rectA.height / 2 },
  { x: rectB.x, y: rectB.y + rectB.height / 2 },
];
