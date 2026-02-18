export function downloadBytes(bytes: Uint8Array, fileName: string, mime = 'application/zip'): void {
  // Make a copy into a fresh ArrayBuffer-backed Uint8Array to avoid SharedArrayBuffer typing issues in some TS configs.
  const safe = new Uint8Array(bytes.byteLength);
  safe.set(bytes);
  const blob = new Blob([safe], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
