import { buildExportBundle } from '../builders/buildExportBundle';

/**
 * Safety-net tests for Analysis Workspace (Sandbox) export.
 *
 * These tests intentionally avoid touching the heavy PPTX generator. Instead we validate that
 * we can build a bundle (including the inlined-style SVG) that downstream PNG/PPTX export relies on.
 */

describe('buildExportBundle (sandbox)', () => {
  test('creates a single SVG image artifact when sandbox SVG exists in the DOM', () => {
    // Arrange: minimal DOM structure expected by buildExportBundle.
    document.body.innerHTML = `
      <div>
        <svg class="analysisSandboxSvg" width="200" height="100" viewBox="0 0 200 100">
          <rect x="10" y="10" width="50" height="20" style="fill:#ff0000;stroke:#000000;stroke-width:2" />
          <text x="10" y="60" style="font-size:12px;fill:#111111">Hello</text>
        </svg>
      </div>
    `;

    // Act
    const bundle = buildExportBundle({
      kind: 'sandbox',
      modelName: 'Test Model',
      analysisRequest: {} as any,
      analysisViewState: {} as any,
      exportOptions: {} as any,
      document,
    });

    // Assert
    expect(bundle.title).toContain('Test Model');
    expect(bundle.title).toContain('sandbox');
    expect(bundle.warnings ?? []).toHaveLength(0);
    expect(bundle.artifacts).toHaveLength(1);

    const a = bundle.artifacts[0];
    expect(a.type).toBe('image');
    if (a.type !== 'image') throw new Error('Expected image artifact');

    expect(a.data.kind).toBe('svg');
    expect(a.data.data).toContain('<svg');
    // Namespaces are added for compatibility.
    expect(a.data.data).toContain('xmlns=');
  });

  test('adds a warning when sandbox SVG is missing', () => {
    document.body.innerHTML = `<div></div>`;

    const bundle = buildExportBundle({
      kind: 'sandbox',
      modelName: 'Test Model',
      analysisRequest: {} as any,
      analysisViewState: {} as any,
      exportOptions: {} as any,
      document,
    });

    expect(bundle.artifacts).toHaveLength(0);
    expect(bundle.warnings?.join('\n') ?? '').toMatch(/Sandbox canvas SVG/i);
  });
});
