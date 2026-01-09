export type XmlEncoding =
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'iso-8859-1'
  | 'windows-1252';

function sniffBom(bytes: Uint8Array): XmlEncoding | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return null;
}

function toAsciiString(bytes: Uint8Array): string {
  // XML declaration is ASCII; decode only bytes <= 0x7f safely.
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out += b <= 0x7f ? String.fromCharCode(b) : '?';
  }
  return out;
}

function sniffXmlDeclaredEncoding(prefixAscii: string): XmlEncoding | null {
  const m = prefixAscii.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i);
  if (!m) return null;
  const enc = String(m[1] ?? '').trim().toLowerCase();

  if (enc === 'utf-8' || enc === 'utf8') return 'utf-8';
  if (enc === 'utf-16' || enc === 'utf16' || enc === 'utf-16le') return 'utf-16le';
  if (enc === 'utf-16be') return 'utf-16be';
  if (enc === 'iso-8859-1' || enc === 'latin1') return 'iso-8859-1';
  if (enc === 'windows-1252' || enc === 'cp1252') return 'windows-1252';

  // Unknown/unsupported encoding label.
  return null;
}

function tryDecode(bytes: Uint8Array, encoding: string): string | null {
  try {
    const dec = new TextDecoder(encoding);
    return dec.decode(bytes);
  } catch {
    return null;
  }
}

function decodeUtf16BeBySwapping(bytes: Uint8Array): string | null {
  // Swap byte order and decode as UTF-16LE.
  if (bytes.length < 2) return '';
  const swapped = new Uint8Array(bytes.length);
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    swapped[i] = bytes[i + 1]!;
    swapped[i + 1] = bytes[i]!;
  }
  return tryDecode(swapped, 'utf-16le');
}

export function decodeXmlBytes(bytes: Uint8Array): { text: string; encoding: XmlEncoding } {
  if (typeof TextDecoder === 'undefined') {
    return { text: toAsciiString(bytes), encoding: 'utf-8' };
  }

  const bom = sniffBom(bytes);
  if (bom === 'utf-8') {
    const text = tryDecode(bytes, 'utf-8') ?? toAsciiString(bytes);
    return { text, encoding: 'utf-8' };
  }
  if (bom === 'utf-16le') {
    const text = tryDecode(bytes, 'utf-16le') ?? toAsciiString(bytes);
    return { text, encoding: 'utf-16le' };
  }
  if (bom === 'utf-16be') {
    const text = tryDecode(bytes, 'utf-16be') ?? decodeUtf16BeBySwapping(bytes) ?? toAsciiString(bytes);
    return { text, encoding: 'utf-16be' };
  }

  const prefix = toAsciiString(bytes.slice(0, 512));
  const declared = sniffXmlDeclaredEncoding(prefix);
  const enc: XmlEncoding = declared ?? 'utf-8';

  if (enc === 'utf-16be') {
    const text = tryDecode(bytes, 'utf-16be') ?? decodeUtf16BeBySwapping(bytes) ?? toAsciiString(bytes);
    return { text, encoding: enc };
  }

  const text = tryDecode(bytes, enc) ?? tryDecode(bytes, 'utf-8') ?? toAsciiString(bytes);
  return { text, encoding: enc };
}
