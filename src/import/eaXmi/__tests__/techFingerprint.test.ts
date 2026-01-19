import * as fs from 'fs';
import * as path from 'path';
import { fingerprintEaXmiXmlText, formatEaXmiTechFingerprint } from '../techFingerprint';

function readFixture(rel: string): string {
  const p = path.join(__dirname, 'fixtures', rel);
  return fs.readFileSync(p, 'utf8');
}

describe('EA XMI tech fingerprint', () => {
  test('prints a stable inventory for an ArchiMate flavored EA XMI fixture', () => {
    const xml = readFixture('ea-xmi-archimate-minimal.xml');
    const fp = fingerprintEaXmiXmlText(xml);
    const report = formatEaXmiTechFingerprint(fp);

    expect(report).toMatchInlineSnapshot(`
"EA XMI tech fingerprint

Namespaces:
- ArchiMate3: http://www.sparxsystems.com/profiles/ArchiMate3/1.0
- uml: http://www.omg.org/spec/UML/20131001
- xmi: http://schema.omg.org/spec/XMI/2.1

EA extension tags:
- diagram: 1 ids=[D1]
- diagramLink: 1 ids=[DL1]
- diagramLinks: 1
- diagramObject: 2 ids=[DO1, DO2]
- diagramObjects: 1
- diagrams: 1
- element: 1
- elements: 1

Profile element tags:
- ArchiMate3:ArchiMate_BusinessActor: 1 ids=[A2]
- ArchiMate3:ArchiMate_BusinessProcess: 1 ids=[A1]
- ArchiMate3:ArchiMate_Flow: 1 ids=[R1]

Stereotype signals:
Attributes:
- (none)
Elements:
- (none)

Tagged value signals:
Attributes:
- (none)
Elements:
- (none)"
`);
  });
});
