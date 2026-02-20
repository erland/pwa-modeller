import { createElement, createEmptyModel, createView } from '../../domain/factories';
import { createViewSvg } from '../../components/diagram/exportSvg';
import { svgTextToPngBytes } from './svgToPngBytes';

/**
 * NOTE: This test uses lightweight mocks for Image/canvas to verify that our SVG output
 * stays compatible with the SVG → PNG conversion pipeline used by PNG/PPTX exports.
 */
describe('svgTextToPngBytes integration (UML export SVG)', () => {
  const originalImage = global.Image;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalGetContext = (HTMLCanvasElement.prototype as any).getContext;
  const originalToBlob = (HTMLCanvasElement.prototype as any).toBlob;

  beforeEach(() => {
    // Mock URL blob APIs.
    URL.createObjectURL = jest.fn(() => 'blob:mock');
    URL.revokeObjectURL = jest.fn();

    // Mock Image() load behavior.
    class MockImage {
      naturalWidth = 320;
      naturalHeight = 200;
      decoding: string = 'async';
      crossOrigin: string | null = null;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;

      set src(_v: string) {
        // Simulate async load.
        setTimeout(() => this.onload?.(), 0);
      }
    }
    // @ts-expect-error - override for test
    global.Image = MockImage;

    // Mock canvas 2d context.
    (HTMLCanvasElement.prototype as any).getContext = jest.fn(() => ({
      fillStyle: '#fff',
      fillRect: jest.fn(),
      drawImage: jest.fn(),
    }));

    // Mock toBlob to return a tiny blob.
    (HTMLCanvasElement.prototype as any).toBlob = jest.fn((cb: (b: Blob | null) => void) => {
      const fakeBlob = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as any;
      cb(fakeBlob as Blob);
    });
  });

  afterEach(() => {
    global.Image = originalImage;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    (HTMLCanvasElement.prototype as any).getContext = originalGetContext;
    (HTMLCanvasElement.prototype as any).toBlob = originalToBlob;
  });

  it('converts UML-exported SVG to PNG bytes (mocked)', async () => {
    const model = createEmptyModel({ name: 'M' });
    const a = createElement({
      name: 'User',
      type: 'uml.class',
      attrs: {
        attributes: [{ name: 'id', visibility: 'private', dataTypeName: 'String' }],
        operations: [{ name: 'getId', visibility: 'public', returnType: 'String', params: [] }],
      },
    });
    model.elements[a.id] = a;

    const v = createView({ name: 'UML', kind: 'uml', viewpointId: 'uml-class' });
    v.layout = {
      nodes: [{ elementId: a.id, x: 20, y: 20, width: 220, height: 140 }],
      relationships: [],
    };
    model.views[v.id] = v;

    const svg = createViewSvg(model, v.id);
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('<foreignObject');

    const bytes = await svgTextToPngBytes(svg, { scale: 2, background: '#ffffff' });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
