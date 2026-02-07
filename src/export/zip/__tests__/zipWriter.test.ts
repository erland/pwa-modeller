import { ZipWriter } from '../zipWriter';

function u16le(buf: Uint8Array, off: number): number {
  return buf[off] | (buf[off + 1] << 8);
}

function u32le(buf: Uint8Array, off: number): number {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

function findLastIndex(haystack: Uint8Array, needle: number[]): number {
  for (let i = haystack.length - needle.length; i >= 0; i--) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function bytesOfAscii(s: string): Uint8Array {
  // Avoid relying on TextEncoder in the Jest environment.
  return Uint8Array.from(Buffer.from(s, 'utf8'));
}

describe('ZipWriter', () => {
  it('builds a valid minimal zip with one file (store method)', () => {
    const zw = new ZipWriter();
    zw.addFile('hello.txt', 'Hello');
    const zip = zw.build();

    // EOCD is 22 bytes when comment length is 0.
    expect(zip.length).toBeGreaterThan(22);
    const eocdOff = zip.length - 22;
    expect(u32le(zip, eocdOff)).toBe(0x06054b50);

    const totalEntries = u16le(zip, eocdOff + 10);
    const centralSize = u32le(zip, eocdOff + 12);
    const centralOff = u32le(zip, eocdOff + 16);
    expect(totalEntries).toBe(1);
    expect(centralSize).toBeGreaterThan(0);
    expect(centralOff).toBeGreaterThan(0);

    // Central header signature
    expect(u32le(zip, centralOff)).toBe(0x02014b50);

    const nameLen = u16le(zip, centralOff + 28);
    const extraLen = u16le(zip, centralOff + 30);
    const commentLen = u16le(zip, centralOff + 32);
    const localOff = u32le(zip, centralOff + 42);
    expect(extraLen).toBe(0);
    expect(commentLen).toBe(0);
    expect(nameLen).toBe(bytesOfAscii('hello.txt').length);
    expect(localOff).toBe(0);

    // Local header signature at offset 0.
    expect(u32le(zip, localOff)).toBe(0x04034b50);
    const localNameLen = u16le(zip, localOff + 26);
    const localExtraLen = u16le(zip, localOff + 28);
    expect(localExtraLen).toBe(0);
    expect(localNameLen).toBe(nameLen);

    // Name bytes match in both local and central records.
    const localNameStart = localOff + 30;
    const centralNameStart = centralOff + 46;
    expect(Array.from(zip.slice(localNameStart, localNameStart + localNameLen))).toEqual(
      Array.from(bytesOfAscii('hello.txt'))
    );
    expect(Array.from(zip.slice(centralNameStart, centralNameStart + nameLen))).toEqual(
      Array.from(bytesOfAscii('hello.txt'))
    );
  });

  it('includes multiple filenames and stays deterministic for the same inputs', () => {
    const zw1 = new ZipWriter();
    zw1.addFile('a.txt', 'A');
    zw1.addFile('b/b.txt', 'BB');
    const zip1 = zw1.build();

    const zw2 = new ZipWriter();
    zw2.addFile('a.txt', 'A');
    zw2.addFile('b/b.txt', 'BB');
    const zip2 = zw2.build();

    expect(Array.from(zip1)).toEqual(Array.from(zip2));

    // Basic sanity: filenames appear in the byte stream.
    const aIdx = findLastIndex(zip1, Array.from(bytesOfAscii('a.txt')));
    const bIdx = findLastIndex(zip1, Array.from(bytesOfAscii('b/b.txt')));
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThanOrEqual(0);
  });

  it('writes correct local offsets in central directory for multiple files', () => {
    const zw = new ZipWriter();
    zw.addFile('first.txt', '1');
    zw.addFile('second.txt', '22');
    const zip = zw.build();

    const eocdOff = zip.length - 22;
    const totalEntries = u16le(zip, eocdOff + 10);
    const centralOff = u32le(zip, eocdOff + 16);
    expect(totalEntries).toBe(2);

    let off = centralOff;
    const locals: number[] = [];
    const names: string[] = [];

    for (let i = 0; i < totalEntries; i++) {
      expect(u32le(zip, off)).toBe(0x02014b50);
      const nameLen = u16le(zip, off + 28);
      const localOff = u32le(zip, off + 42);
      const nameStart = off + 46;
      const nameBytes = zip.slice(nameStart, nameStart + nameLen);
      names.push(Buffer.from(nameBytes).toString('utf8'));
      locals.push(localOff);
      off = nameStart + nameLen; // extraLen/commentLen are always 0 in our writer
    }

    // Central entries should point at the expected local header signatures.
    for (const localOff of locals) {
      expect(u32le(zip, localOff)).toBe(0x04034b50);
    }

    // And local offsets should be in ascending order as files were added.
    expect(names).toEqual(['first.txt', 'second.txt']);
    expect(locals[0]).toBeLessThan(locals[1]);
  });
});
