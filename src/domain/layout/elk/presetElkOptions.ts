import type { AutoLayoutOptions } from '../types';
import { presetToElkAlgorithm } from './presetToElkAlgorithm';

type Context = {
  /** Whether we are laying out a hierarchical graph (containers). */
  hierarchical: boolean;
  /** Whether the input actually contains hierarchy (parent/child relationships). */
  hasHierarchy: boolean;
};

type Result = {
  algorithm: 'layered' | 'mrtree' | 'stress' | 'radial';
  layoutOptions: Record<string, string>;
};

/**
 * Compute ELK root layout options with small, safe per-preset tweaks.
 *
 * Design goals:
 * - Keep defaults conservative and notation-agnostic.
 * - Avoid "explosive" layouts for container graphs.
 * - Preserve existing behavior unless the user explicitly picks a preset.
 */
export function buildElkRootOptions(
  spacing: number,
  options: AutoLayoutOptions,
  ctx: Context,
): Result {
  const preset = options.preset;

  // Base algorithm derived from preset.
  let algorithm = presetToElkAlgorithm(preset);

  // Guardrail: ELK radial is great for flat hub/spoke views, but can produce
  // confusing results when hierarchy is present (pools/lanes/packages).
  // Keep it safe by falling back to layered for true hierarchical graphs.
  if (ctx.hierarchical && ctx.hasHierarchy && preset === 'radial') {
    algorithm = 'layered';
  }

  // Base spacing.
  const nodeNode = spacing;
  const edgeNode = Math.max(20, Math.floor(spacing / 3));
  const edgeEdge = Math.max(10, Math.floor(spacing / 4));

  // Preset-specific tweaks.
  // Keep these small: the goal is to avoid weird outputs, not perfectly tune each algorithm.
  let presetNodeNode = nodeNode;
  let presetEdgeNode = edgeNode;
  let presetEdgeEdge = edgeEdge;

  switch (preset) {
    case 'radial':
      // Radial needs more breathing room to avoid label/edge collisions.
      presetNodeNode = Math.round(nodeNode * 1.35);
      presetEdgeNode = Math.round(edgeNode * 1.2);
      presetEdgeEdge = Math.round(edgeEdge * 1.2);
      break;
    case 'network':
      // Stress (force-like) defaults are often too compact for readability,
      // especially when combined with orthogonal routing. "Network" should be
      // spacious by default so relationships get clear channels.
      presetNodeNode = Math.round(nodeNode * 1.75);
      presetEdgeNode = Math.round(edgeNode * 1.4);
      presetEdgeEdge = Math.round(edgeEdge * 1.25);
      break;
    case 'tree':
      // Trees often look better a bit tighter.
      presetNodeNode = Math.round(nodeNode * 0.9);
      break;
    case 'flow_bands':
      // Banded ArchiMate layouts need more horizontal room so the router can find clear channels.
      presetNodeNode = Math.round(nodeNode * 1.25);
      presetEdgeNode = Math.round(edgeNode * 1.15);
      presetEdgeEdge = Math.round(edgeEdge * 1.15);
      break;
    case 'flow':
    default:
      break;
  }

  return {
    algorithm,
    layoutOptions: {
      'elk.algorithm': algorithm,
      // Keep direction/edgeRouting as decided by caller.
      // General spacing between nodes.
      'elk.spacing.nodeNode': String(presetNodeNode),
      // Spacing between layers in layered layouts (ignored by other algorithms).
      'elk.layered.spacing.nodeNodeBetweenLayers': String(presetNodeNode),
      // A bit of breathing room so labels/handles don't feel cramped.
      'elk.spacing.edgeNode': String(presetEdgeNode),
      'elk.spacing.edgeEdge': String(presetEdgeEdge),
    },
  };
}
