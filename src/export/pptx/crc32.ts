// Minimal CRC32 implementation for ZIP (no external deps).

let table: Uint32Array | null = null;

function getTable(): Uint32Array {
  if (table) return table;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[i] = c >>> 0;
  }
  table = t;
  return t;
}

export function crc32(bytes: Uint8Array): number {
  const t = getTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  // Unsigned
  return (c ^ 0xffffffff) >>> 0;
}
