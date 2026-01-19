import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaXmiPackageHierarchyToFolders } from '../parsePackages';
import { parseEaXmiClassifiersToElements } from '../parseElements';

describe('eaXmi classifier parsing', () => {
  test('parses common UML classifier kinds into IR elements and places them in package folders', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="MyModel">
          <packagedElement xmi:type="uml:Package" xmi:id="P1" name="Pkg">
            <packagedElement xmi:type="uml:Class" xmi:id="C1" name="A" />
            <packagedElement xmi:type="uml:Interface" xmi:id="I1" name="I" />
            <packagedElement xmi:type="uml:Enumeration" xmi:id="E1" name="E" />
            <packagedElement xmi:type="uml:DataType" xmi:id="D1" name="D" />
            <packagedElement xmi:type="uml:PrimitiveType" xmi:id="PT1" name="P" />
            <packagedElement xmi:type="uml:Component" xmi:id="CMP1" name="Comp" />
            <packagedElement xmi:type="uml:Artifact" xmi:id="AR1" name="Art" />
            <packagedElement xmi:type="uml:Node" xmi:id="N1" name="Node" />
            <packagedElement xmi:type="uml:Device" xmi:id="DV1" name="Dev" />
            <packagedElement xmi:type="uml:ExecutionEnvironment" xmi:id="EE1" name="EE" />
            <packagedElement xmi:type="uml:UseCase" xmi:id="UC1" name="UC" />
            <packagedElement xmi:type="uml:Actor" xmi:id="AC1" name="Actor" />
            <packagedElement xmi:type="uml:Comment" xmi:id="CM1">
              <body>hello</body>
            </packagedElement>
          </packagedElement>
        </uml:Model>
      </xmi:XMI>
    `;

    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');

    // Step 4 is not required for element parsing with xmi:id packages, but calling it keeps parity with importer flow.
    parseEaXmiPackageHierarchyToFolders(doc, report);

    const { elements } = parseEaXmiClassifiersToElements(doc, report);
    expect(elements).toHaveLength(13);

    const byId = new Map(elements.map((e) => [e.id, e]));
    expect(byId.get('C1')?.type).toBe('uml.class');
    expect(byId.get('I1')?.type).toBe('uml.interface');
    expect(byId.get('E1')?.type).toBe('uml.enum');
    expect(byId.get('D1')?.type).toBe('uml.datatype');
    expect(byId.get('PT1')?.type).toBe('uml.primitiveType');
    expect(byId.get('CMP1')?.type).toBe('uml.component');
    expect(byId.get('AR1')?.type).toBe('uml.artifact');
    expect(byId.get('N1')?.type).toBe('uml.node');
    expect(byId.get('DV1')?.type).toBe('uml.device');
    expect(byId.get('EE1')?.type).toBe('uml.executionEnvironment');
    expect(byId.get('UC1')?.type).toBe('uml.usecase');
    expect(byId.get('AC1')?.type).toBe('uml.actor');
    expect(byId.get('CM1')?.type).toBe('uml.note');
    expect(byId.get('CM1')?.documentation).toBe('hello');

    for (const el of elements) {
      expect(el.folderId).toBe('P1');
    }

    // No warnings expected for the happy path.
    expect(report.warnings).toEqual([]);
  });

  test('skips uml:Package elements (packages are folders in Milestone A)', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="MyModel">
          <packagedElement xmi:type="uml:Package" xmi:id="P1" name="Pkg" />
        </uml:Model>
      </xmi:XMI>
    `;
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');
    parseEaXmiPackageHierarchyToFolders(doc, report);
    const { elements } = parseEaXmiClassifiersToElements(doc, report);
    expect(elements).toEqual([]);
  });
});
