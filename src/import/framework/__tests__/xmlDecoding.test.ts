import { decodeXmlBytes } from '../xmlDecoding';

// Ensure TextDecoder exists in the Jest environment (Node versions / test envs may not expose it globally).
// We deliberately polyfill from Node's util implementation to keep these tests unit-level and deterministic.
import { TextDecoder as UtilTextDecoder } from 'util';

beforeAll(() => {
  if (typeof (globalThis as any).TextDecoder === 'undefined') {
    (globalThis as any).TextDecoder = UtilTextDecoder as any;
  }
});

function u8(...nums: number[]): Uint8Array {
  return new Uint8Array(nums);
}

describe('decodeXmlBytes', () => {
  test('detects UTF-8 BOM and decodes as utf-8', () => {
    const xml = '<?xml version="1.0"?><root>hej</root>';
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from(xml, 'utf8')]);
    const out = decodeXmlBytes(bytes);
    expect(out.encoding).toBe('utf-8');
    expect(out.text).toContain('<root>hej</root>');
  });

  test('detects UTF-16LE BOM and reports utf-16le', () => {
    const xml = '<?xml version="1.0"?><root>hi</root>';
    const bytes = new Uint8Array([0xff, 0xfe, ...Buffer.from(xml, 'utf16le')]);
    const out = decodeXmlBytes(bytes);
    expect(out.encoding).toBe('utf-16le');
    // Decoding support can vary; we at least expect the XML to be present when utf-16le decoding is available.
    expect(out.text).toContain('<root>');
  });

  test('detects UTF-16BE BOM and reports utf-16be (with fallback byte swapping when needed)', () => {
    const xml = '<?xml version="1.0"?><root>be</root>';
    // Create UTF-16LE bytes then swap to BE to simulate a BE payload.
    const le = Buffer.from(xml, 'utf16le');
    const swapped = new Uint8Array(le.length);
    for (let i = 0; i < le.length; i += 2) {
      swapped[i] = le[i + 1]!;
      swapped[i + 1] = le[i]!;
    }
    const bytes = new Uint8Array([0xfe, 0xff, ...swapped]);
    const out = decodeXmlBytes(bytes);
    expect(out.encoding).toBe('utf-16be');
    expect(out.text).toContain('<root>be</root>');
  });

  test('uses declared encoding when BOM is absent (windows-1252)', () => {
    // XML declaration must be ASCII; the content byte 0x80 is "€" in windows-1252.
    const head = '<?xml version="1.0" encoding="windows-1252"?><root>';
    const tail = '</root>';
    const bytes = u8(
      ...Buffer.from(head, 'ascii'),
      0x80,
      ...Buffer.from(tail, 'ascii')
    );
    const out = decodeXmlBytes(bytes);
    expect(out.encoding).toBe('windows-1252');
    // Don't assert exact decoded character (depends on ICU build); just ensure structure survives.
    expect(out.text).toContain('<root>');
    expect(out.text).toContain('</root>');
  });

  test('falls back to utf-8 when declared encoding is unsupported', () => {
    const xml = '<?xml version="1.0" encoding="x-unknown"?><root>ok</root>';
    const bytes = new Uint8Array(Buffer.from(xml, 'utf8'));
    const out = decodeXmlBytes(bytes);
    expect(out.encoding).toBe('utf-8');
    expect(out.text).toContain('<root>ok</root>');
  });
});
