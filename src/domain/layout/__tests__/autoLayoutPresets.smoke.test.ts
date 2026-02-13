import { elkLayout } from '../elk/elkLayout';
import { elkLayoutHierarchical } from '../elk/elkLayoutHierarchical';
import { buildElkRootOptions } from '../elk/presetElkOptions';
import { applyArchiMateLayerBands } from '../post/applyArchiMateLayerBands';
import {
  makeArchiMateBandedInput,
  makeBpmnSimpleInput,
  makeHierarchicalContainerInput,
  makeUmlSimpleInput,
} from './fixtures/layoutGraphs';

type Pos = { x: number; y: number };

function expectFinitePositions(pos: Record<string, Pos>, expectedIds: string[]): void {
  for (const id of expectedIds) {
    const p = pos[id];
    expect(p).toBeTruthy();
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  }
}

describe('auto-layout presets (smoke)', () => {
  jest.setTimeout(10_000);

  test('flat elkLayout produces finite positions for each preset', async () => {
    const input = makeBpmnSimpleInput();
    const ids = input.nodes.map((n) => n.id);

    for (const preset of ['flow', 'tree', 'network', 'radial'] as const) {
      const out = await elkLayout(input, { preset, spacing: 80, direction: 'RIGHT' });
      expectFinitePositions(out.positions, ids);
    }
  });

  test('hierarchical elkLayoutHierarchical produces finite positions (flow)', async () => {
    const input = makeHierarchicalContainerInput();
    const ids = input.nodes.map((n) => n.id);

    const out = await elkLayoutHierarchical(input, { preset: 'flow', spacing: 80, direction: 'RIGHT' });
    expectFinitePositions(out.positions, ids);
  });

  test('hierarchical elkLayoutHierarchical with radial preset does not throw (guardrail fallback)', async () => {
    const input = makeHierarchicalContainerInput();
    const ids = input.nodes.map((n) => n.id);

    const out = await elkLayoutHierarchical(input, { preset: 'radial', spacing: 80, direction: 'RIGHT' });
    expectFinitePositions(out.positions, ids);
  });

  test('radial preset falls back to layered for true hierarchical graphs (guardrail)', () => {
    const r = buildElkRootOptions(80, { preset: 'radial' }, { hierarchical: true, hasHierarchy: true });
    expect(r.algorithm).toBe('layered');
  });

  test('ArchiMate layer bands enforce banded Y order (post-pass)', () => {
    const input = makeArchiMateBandedInput();

    // Start from arbitrary positions (simulate an ELK run result).
    const positions: Record<string, Pos> = {
      B1: { x: 0, y: 200 },
      B2: { x: 50, y: 5 },
      A1: { x: 100, y: 999 },
      T1: { x: 200, y: 10 },
      O1: { x: 300, y: 0 },
    };

    const out = applyArchiMateLayerBands(input.nodes, positions, { bandGap: 90, grid: 10 });

    // Business < Application < Technology < Other
    expect(out.B1.y).toBe(out.B2.y);
    expect(out.B1.y).toBeLessThan(out.A1.y);
    expect(out.A1.y).toBeLessThan(out.T1.y);
    expect(out.T1.y).toBeLessThan(out.O1.y);
  });

  test('UML simple graph layouts for all presets are finite (flat)', async () => {
    const input = makeUmlSimpleInput();
    const ids = input.nodes.map((n) => n.id);

    for (const preset of ['flow', 'tree', 'network', 'radial'] as const) {
      const out = await elkLayout(input, { preset, spacing: 80, direction: 'RIGHT' });
      expectFinitePositions(out.positions, ids);
    }
  });
});
