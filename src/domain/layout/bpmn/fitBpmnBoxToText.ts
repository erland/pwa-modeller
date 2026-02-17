import type { Element, ViewNodeLayout } from '../../types';
import { measureTextWidthPx } from '../measureText';

function clampMin(n: number, min: number): number {
  return n < min ? min : n;
}

function labelFor(el: Element): string {
  const n = (el.name ?? '').trim();
  return n.length ? n : '(unnamed)';
}

/**
 * Computes a size for common BPMN nodes so their text fits.
 *
 * Supports: tasks, pools, lanes, text annotations.
 * For events/gateways we currently keep their size unchanged (labels are often
 * rendered outside or under the symbol).
 */
export function fitBpmnBoxToText(
  el: Element,
  _node: ViewNodeLayout
): { width: number; height: number } | null {
  const t = String(el.type);
  const name = labelFor(el);

  // --- Pools ---
  if (t === 'bpmn.pool') {
    // Pool label is vertical in a left band.
    const font = '800 12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    const labelH = measureTextWidthPx(name, font); // writingMode vertical => width ~= height
    const pad = 8;
    const bandW = 32; // typical band width
    const minW = 240;
    const minH = 120;
    const height = clampMin(Math.ceil(labelH + pad * 2 + 2), minH);
    const width = clampMin(Math.ceil(bandW + 120), minW);
    return { width, height };
  }

  // --- Lanes ---
  if (t === 'bpmn.lane') {
    const font = '800 12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    const labelW = measureTextWidthPx(name, font);
    const padX = 8;
    const padY = 6;
    const minW = 240;
    const minH = 80;
    const width = clampMin(Math.ceil(labelW + padX * 2 + 2), minW);
    const height = clampMin(Math.ceil(14 + padY * 2 + 2), minH);
    return { width, height };
  }

  // --- Text annotation ---
  if (t === 'bpmn.textAnnotation') {
    const font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    const padX = 10;
    const padY = 8;
    const lineH = 15;
    const lines = name.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
    let maxW = 0;
    for (const line of lines) {
      maxW = Math.max(maxW, measureTextWidthPx(line, font));
    }
    const minW = 140;
    const minH = 60;
    const width = clampMin(Math.ceil(maxW + padX * 2 + 10), minW); // extra for left bracket line
    const height = clampMin(Math.ceil(lines.length * lineH + padY * 2 + 2), minH);
    return { width, height };
  }

  // --- Tasks / activities ---
  if (
    t === 'bpmn.task' ||
    t === 'bpmn.userTask' ||
    t === 'bpmn.serviceTask' ||
    t === 'bpmn.scriptTask' ||
    t === 'bpmn.manualTask' ||
    t === 'bpmn.callActivity' ||
    t === 'bpmn.subProcess'
  ) {
    const font = '800 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    const textW = measureTextWidthPx(name, font);
    const padX = 10;
    const padYTop = 10;
    const padYBot = 8;
    const minW = 120;
    const minH = 60;

    // Badge/subprocess marker takes a bit of extra space.
    const extraW = t === 'bpmn.userTask' || t === 'bpmn.serviceTask' || t === 'bpmn.scriptTask' || t === 'bpmn.manualTask' ? 20 : 0;
    const extraH = t === 'bpmn.subProcess' ? 18 : 0;

    const width = clampMin(Math.ceil(textW + padX * 2 + extraW + 2), minW);
    const height = clampMin(Math.ceil(16 + padYTop + padYBot + extraH + 2), minH);
    return { width, height };
  }

  return null;
}
