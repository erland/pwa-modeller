import { crc32 } from '../crc32';

function bytesOfAscii(s: string): Uint8Array {
  // Avoid relying on TextEncoder in the Jest environment.
  return Uint8Array.from(Buffer.from(s, 'utf8'));
}

describe('crc32', () => {
  it('computes CRC32 of empty buffer', () => {
    expect(crc32(new Uint8Array())).toBe(0x00000000);
  });

  it('matches the standard test vector "123456789"', () => {
    // Standard IEEE CRC32 check value
    expect(crc32(bytesOfAscii('123456789'))).toBe(0xcbf43926);
  });

  it('is stable for fixed bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 255]);
    // This expectation is "locked" to our implementation to prevent regressions.
    expect(crc32(bytes)).toBe(0x6d83d448);
  });
});
