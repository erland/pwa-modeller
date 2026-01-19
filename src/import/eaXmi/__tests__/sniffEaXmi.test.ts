import type { ImportContext } from '../../framework/importer';
import { eaXmiImporter } from '../eaXmiImporter';

function ctxFromText(sniffText: string, extension: string | null = 'xml'): ImportContext {
  return {
    sniffText,
    sniffBytes: new TextEncoder().encode(sniffText),
    fileName: `test.${extension ?? 'txt'}`,
    extension,
    mimeType: ''
  };
}

describe('eaXmiImporter.sniff', () => {
  test('returns true for a typical EA UML XMI export snippet', async () => {
    const text = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://www.omg.org/spec/UML/20131001">
  <xmi:Extension extender="Enterprise Architect"/>
  <uml:Model xmi:id="M1" name="Model"/>
</xmi:XMI>`;

    const ok = await eaXmiImporter.sniff?.(ctxFromText(text, 'xml'));
    expect(ok).toBe(true);
  });

  test('returns false for generic UML XMI without EA markers', async () => {
    const text = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://www.omg.org/spec/UML/20131001">
  <uml:Model xmi:id="M1" name="Model"/>
</xmi:XMI>`;

    const ok = await eaXmiImporter.sniff?.(ctxFromText(text, 'xml'));
    expect(ok).toBe(false);
  });

  test('returns true for .xmi extension even if sniffText is empty', async () => {
    const ok = await eaXmiImporter.sniff?.(ctxFromText('', 'xmi'));
    expect(ok).toBe(true);
  });
});
