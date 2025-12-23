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
