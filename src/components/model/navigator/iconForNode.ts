import type { NavNode } from './types';

export function iconForNode(node: NavNode): string {
  switch (node.kind) {
    case 'folder':
      return '📁';
    case 'view':
      return '🗺️';
    case 'element':
      // Use a non-emoji glyph so CSS `color` can style it in light/dark themes.
      return '■';
    case 'relationship':
      // Non-emoji glyph for consistent theming.
      return '⟶';
    case 'section':
    default:
      return '▦';
  }
}
