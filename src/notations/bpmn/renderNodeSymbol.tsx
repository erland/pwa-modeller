import * as React from 'react';
import { artifactRenderers } from './symbols/artifacts';
import { containerRenderers } from './symbols/containers';
import { eventRenderers } from './symbols/events';
import { renderFallback } from './symbols/fallback';
import { gatewayTypes, renderGateway } from './symbols/gateways';
import { renderTaskLike, taskLikeTypes } from './symbols/tasks';
import type { Renderer } from './symbols/types';

/**
 * Small, consistent symbols used in list UIs (and as a fallback if node content isn't overridden).
 *
 * Goal: recognizable BPMN shapes without pulling in an external icon set.
 */
export function renderBpmnNodeSymbol(nodeType: string): React.ReactNode {
  const frame: React.CSSProperties = {
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    userSelect: 'none',
    color: 'rgba(0,0,0,0.78)',
  };

  // Direct registry lookup first (keeps this function small and makes it easy to extend).
  const renderers: Record<string, Renderer> = {
    ...containerRenderers,
    ...eventRenderers,
    ...artifactRenderers,
  };

  const direct = renderers[nodeType];
  if (direct) return direct(nodeType, frame);

  // Grouped families
  if (taskLikeTypes[nodeType]) return renderTaskLike(nodeType, frame);
  if (gatewayTypes[nodeType]) return renderGateway(nodeType, frame);

  return renderFallback(nodeType, frame);
}
