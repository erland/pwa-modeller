export const DEFAULT_SEED_POS = { x: 260, y: 180 } as const;

// Caps (safety).
export const SANDBOX_MAX_NODES_DEFAULT = 300;
export const SANDBOX_MAX_EDGES_DEFAULT = 2000;

// Simple layout for batches of added nodes.
export const GRID_X = 220;
export const GRID_Y = 92;
export const GRID_COLS = 4;

// Must match the rendered node size in SandboxModeView.
export const SANDBOX_NODE_W = 180;
export const SANDBOX_NODE_H = 56;

// Add-related placement.
export const RELATED_RADIUS_STEP = 240;
export const RELATED_MIN_SEPARATION = 160;
export const RELATED_MAX_ATTEMPTS = 10;
export const RELATED_RING_SIZE = 12;
export const RELATED_ANGLE_STEP = 0.35;
export const RELATED_RADIUS_JITTER = 26;

// Insert intermediates.
export const INTERMEDIATE_PATH_OFFSET_STEP = 84;
