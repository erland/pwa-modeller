/**
 * Robust Blob/File readers that work both in browsers and in Jest/jsdom.
 */

export function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  const anyBlob = blob as any;
  if (typeof anyBlob.arrayBuffer === 'function') {
    return anyBlob.arrayBuffer() as Promise<ArrayBuffer>;
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob as ArrayBuffer'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

export function readBlobAsText(blob: Blob): Promise<string> {
  const anyBlob = blob as any;
  if (typeof anyBlob.text === 'function') {
    return anyBlob.text() as Promise<string>;
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob as text'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(blob);
  });
}
