import { crc32 } from './crc32';

type ZipEntry = {
  path: string;
  data: Uint8Array;
  crc: number;
  offset: number;
};

function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/**
 * Minimal ZIP writer that stores files without compression (method 0).
 * This keeps the implementation small and dependency-free.
 */
export class ZipWriter {
  private entries: ZipEntry[] = [];
  private bodyChunks: Uint8Array[] = [];
  private offset = 0;

  addFile(path: string, data: Uint8Array | string): void {
    const bytes = typeof data === 'string' ? encodeUtf8(data) : data;
    const nameBytes = encodeUtf8(path);
    const crc = crc32(bytes);
    const localHeader = concat([
      // Local file header signature
      u32(0x04034b50),
      // version needed to extract
      u16(20),
      // general purpose bit flag
      u16(0),
      // compression method (0 = store)
      u16(0),
      // mod time/date
      u16(0),
      u16(0),
      // crc-32
      u32(crc),
      // compressed size
      u32(bytes.length),
      // uncompressed size
      u32(bytes.length),
      // file name length
      u16(nameBytes.length),
      // extra field length
      u16(0),
      // file name
      nameBytes,
      // extra field (none)
    ]);

    const entryOffset = this.offset;
    this.bodyChunks.push(localHeader, bytes);
    this.offset += localHeader.length + bytes.length;

    this.entries.push({ path, data: bytes, crc, offset: entryOffset });
  }

  build(): Uint8Array {
    const centralChunks: Uint8Array[] = [];
    let centralSize = 0;

    for (const e of this.entries) {
      const nameBytes = encodeUtf8(e.path);
      const cd = concat([
        // Central directory file header signature
        u32(0x02014b50),
        // version made by
        u16(20),
        // version needed to extract
        u16(20),
        // general purpose bit flag
        u16(0),
        // compression method
        u16(0),
        // mod time/date
        u16(0),
        u16(0),
        // crc-32
        u32(e.crc),
        // compressed size
        u32(e.data.length),
        // uncompressed size
        u32(e.data.length),
        // file name length
        u16(nameBytes.length),
        // extra field length
        u16(0),
        // file comment length
        u16(0),
        // disk number start
        u16(0),
        // internal file attributes
        u16(0),
        // external file attributes
        u32(0),
        // relative offset of local header
        u32(e.offset),
        // file name
        nameBytes,
      ]);
      centralChunks.push(cd);
      centralSize += cd.length;
    }

    const centralOffset = this.offset;
    const end = concat([
      // End of central directory signature
      u32(0x06054b50),
      // number of this disk
      u16(0),
      // number of the disk with the start of the central directory
      u16(0),
      // total entries in the central directory on this disk
      u16(this.entries.length),
      // total entries in the central directory
      u16(this.entries.length),
      // size of the central directory
      u32(centralSize),
      // offset of start of central directory
      u32(centralOffset),
      // zip file comment length
      u16(0),
    ]);

    return concat([...this.bodyChunks, ...centralChunks, end]);
  }
}
