import type { IRElement, IRViewConnection, IRViewNode } from '../ir';

export type Rect = { x: number; y: number; width: number; height: number };

export type EnsureViewCompleteContext = {
  elements: IRElement[];
  relationships: { id: string; sourceId: string; targetId: string }[];
  elementById: Map<string, IRElement>;
};

export type EnsureViewCompleteConfig = {
  /** Return true if an element is expected to be shown on a diagram. */
  isVisualElementType: (type: string | undefined) => boolean;
  /** Default size for an element type when no bounds are provided. */
  defaultSizeForType: (type: string | undefined) => { width: number; height: number };
  /** Return true if this element type is a background/container on the diagram (e.g. pools/lanes). */
  isContainerElementType?: (type: string | undefined) => boolean;
  /** Optional: prioritise some container types before others when choosing the first fallback container. */
  containerPriority?: (type: string | undefined) => number;
  /** Optional semantic containment: elementId -> preferred container elementId. */
  preferredContainerIdByElementId?: Map<string, string>;
  /** Whether to attempt to place elements near their connected neighbours. */
  enableNeighborVoting?: boolean;
  /** Whether to auto-create missing view connections for relationships with both ends present. */
  enableAutoConnections?: boolean;
  /** Whether to skip auto-placing container elements (containers tend to cover everything). */
  skipAutoplaceContainers?: boolean;
  /** Prefix used for generated node/connection ids. */
  autoIdPrefix?: string;
};

export type EnsureViewCompleteArgs = {
  nodes: IRViewNode[];
  connections: IRViewConnection[];
  ctx: EnsureViewCompleteContext;
  config: EnsureViewCompleteConfig;
};
