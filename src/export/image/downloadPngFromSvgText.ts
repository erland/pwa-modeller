import { svgTextToPngBytes } from '../pptx/svgToPngBytes';
import { downloadBlobFile, sanitizeFileNameWithExtension } from '../../store/download';

export async function downloadPngFromSvgText(title: string, svgText: string, opts?: { scale?: number; background?: string }): Promise<void> {
  const bytes = await svgTextToPngBytes(svgText, { scale: opts?.scale ?? 2, background: opts?.background ?? '#ffffff' });
  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
  const fileName = sanitizeFileNameWithExtension(title, 'png');
  downloadBlobFile(fileName, blob);
}
