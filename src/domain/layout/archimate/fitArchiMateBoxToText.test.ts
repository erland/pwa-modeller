import { createElement } from '../../factories';
import type { ViewNodeLayout } from '../../types';
import { fitArchiMateBoxToText } from './fitArchiMateBoxToText';

describe('fitArchiMateBoxToText', () => {
  it('keeps a sensible minimum size', () => {
    const el = createElement({ type: 'ApplicationComponent', layer: 'Application', name: 'X' });
    const node: ViewNodeLayout = { elementId: el.id, x: 0, y: 0 };
    const { width, height } = fitArchiMateBoxToText(el, node);
    expect(width).toBeGreaterThanOrEqual(120);
    expect(height).toBeGreaterThanOrEqual(60);
  });

  it('grows width for long titles', () => {
    const el = createElement({
      type: 'ApplicationComponent',
      layer: 'Application',
      name: 'This is a very long ArchiMate element name that should expand the box'
    });
    const node: ViewNodeLayout = { elementId: el.id, x: 0, y: 0 };
    const { width } = fitArchiMateBoxToText(el, node);
    expect(width).toBeGreaterThan(120);
  });

  it('grows height when a style tag is present', () => {
    const el = createElement({ type: 'ApplicationComponent', layer: 'Application', name: 'Name' });
    const base: ViewNodeLayout = { elementId: el.id, x: 0, y: 0 };
    const tagged: ViewNodeLayout = { elementId: el.id, x: 0, y: 0, styleTag: 'Critical' };
    const h1 = fitArchiMateBoxToText(el, base).height;
    const h2 = fitArchiMateBoxToText(el, tagged).height;
    expect(h2).toBeGreaterThan(h1);
  });
});
