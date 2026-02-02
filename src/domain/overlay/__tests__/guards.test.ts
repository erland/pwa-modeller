import { isOverlayFile } from '../guards';
import { OVERLAY_FILE_FORMAT_V1 } from '../types';

describe('domain overlay guards', () => {
  test('isOverlayFile accepts a minimal valid overlay file', () => {
    const file = {
      format: OVERLAY_FILE_FORMAT_V1,
      createdAt: '2026-02-01T12:00:00.000Z',
      entries: [
        {
          target: {
            kind: 'element',
            externalRefs: [{ scheme: 'xmi', value: 'EAID_1' }]
          },
          tags: { 'data.classification': 'restricted' }
        }
      ]
    };

    expect(isOverlayFile(file)).toBe(true);
  });

  test('isOverlayFile rejects wrong format and malformed structures', () => {
    expect(
      isOverlayFile({ format: 'pwa-modeller-overlay@2', createdAt: '2026-02-01T12:00:00.000Z', entries: [] })
    ).toBe(false);

    expect(isOverlayFile({ format: OVERLAY_FILE_FORMAT_V1, createdAt: 'x', entries: [{}] })).toBe(false);
    expect(isOverlayFile({ format: OVERLAY_FILE_FORMAT_V1, createdAt: 123, entries: [] })).toBe(false);
    expect(isOverlayFile({ format: OVERLAY_FILE_FORMAT_V1, createdAt: 'x', entries: 'nope' })).toBe(false);
  });
});
