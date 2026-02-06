// Minimal ZIP writer (store method, no compression).
// Used for XLSX export v1. Keeps dependencies at zero.
import { crc32 } from './crc32';

type FileEntry = { name: string; bytes: Uint8Array; crc: number };

function encUtf8(s: string): Uint8Array {
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

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// Date/time fields are optional; we set to zero.
export class ZipWriter {
  private files: FileEntry[] = [];

  addFile(name: string, content: string | Uint8Array): void {
    const bytes = typeof content === 'string' ? encUtf8(content) : content;
    this.files.push({ name, bytes, crc: crc32(bytes) });
  }

  build(): Uint8Array {
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;

    for (const f of this.files) {
      const nameBytes = encUtf8(f.name);

      // Local file header
      const localHeader = concat([
        u32(0x04034b50),
        u16(20),        // version needed to extract
        u16(0),         // general purpose bit flag
        u16(0),         // compression method (0=store)
        u16(0),         // last mod file time
        u16(0),         // last mod file date
        u32(f.crc),
        u32(f.bytes.length),
        u32(f.bytes.length),
        u16(nameBytes.length),
        u16(0),         // extra field length
      ]);

      localParts.push(localHeader, nameBytes, f.bytes);

      // Central directory header
      const centralHeader = concat([
        u32(0x02014b50),
        u16(20),        // version made by
        u16(20),        // version needed
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(f.crc),
        u32(f.bytes.length),
        u32(f.bytes.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
      ]);

      centralParts.push(centralHeader, nameBytes);

      offset += localHeader.length + nameBytes.length + f.bytes.length;
    }

    const centralStart = offset;
    const central = concat(centralParts);
    offset += central.length;

    const end = concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(this.files.length),
      u16(this.files.length),
      u32(central.length),
      u32(centralStart),
      u16(0),
    ]);

    return concat([...localParts, central, end]);
  }
}
