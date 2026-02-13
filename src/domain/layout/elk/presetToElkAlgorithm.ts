import type { LayoutPreset } from '../types';

/**
 * Map our high-level layout presets to ELK algorithm identifiers.
 *
 * We intentionally keep this as a tiny pure function so both flat and hierarchical
 * layout runners can share the same behavior.
 */
export function presetToElkAlgorithm(preset: LayoutPreset | undefined): 'layered' | 'mrtree' | 'stress' | 'radial' {
  switch (preset) {
    case 'tree':
      return 'mrtree';
    case 'network':
      return 'stress';
    case 'radial':
      return 'radial';
    case 'flow_bands':
    case 'flow':
    default:
      return 'layered';
  }
}
