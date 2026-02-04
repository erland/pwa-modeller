/**
 * File -> text, in a cross-browser way.
 */
export async function readFileAsText(file: File): Promise<string> {
  const anyFile = file as unknown as { text?: () => Promise<string> };
  if (typeof anyFile.text === 'function') return await anyFile.text();

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file);
  });
}
