export function sanitizeFileName(input: string): string {
  const trimmed = input.trim();
  const withoutExt = trimmed.replace(/\.json$/i, '');
  const safe = withoutExt
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
  return safe.length > 0 ? `${safe}.json` : 'model.json';
}

export function sanitizeFileNameWithExtension(input: string, extension: string): string {
  const ext = extension.replace(/^\./, '').trim().toLowerCase();
  const trimmed = input.trim();
  const withoutExt = trimmed.replace(new RegExp(`\\.${ext}$`, 'i'), '');
  const safe = withoutExt
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
  const base = safe.length > 0 ? safe : 'export';
  return `${base}.${ext || 'txt'}`;
}

export function downloadBlobFile(fileName: string, blob: Blob): void {
  const url =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(blob)
      : '';

  if (!url) {
    // Fallback: try to read as text and delegate (best effort in test envs).
    blob
      .text()
      .then((t) => downloadTextFile(fileName, t, blob.type || 'application/octet-stream'))
      .catch(() => {
        // No-op fallback
      });
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();

  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

export function downloadTextFile(fileName: string, contents: string, mimeType = 'application/json'): void {
  const blob = new Blob([contents], { type: mimeType });

  // JSDOM may not support URL.createObjectURL, so fall back to a data URI in tests.
  const url =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(blob)
      : `data:${mimeType};charset=utf-8,${encodeURIComponent(contents)}`;

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();

  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}
