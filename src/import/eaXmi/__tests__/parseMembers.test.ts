import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaXmiPackageHierarchyToFolders } from '../parsePackages';
import { parseEaXmiClassifiersToElements } from '../parseElements';

describe('eaXmi classifier member parsing', () => {
  test('parses ownedAttribute + ownedOperation/ownedParameter into meta.umlMembers', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="MyModel">
          <packagedElement xmi:type="uml:Package" xmi:id="P1" name="Pkg">
            <packagedElement xmi:type="uml:PrimitiveType" xmi:id="T1" name="String" />
            <packagedElement xmi:type="uml:Class" xmi:id="C1" name="A">
              <ownedAttribute xmi:id="A1" name="foo" visibility="private">
                <type xmi:idref="T1" />
                <lowerValue value="0" />
                <upperValue value="1" />
                <defaultValue value="42" />
              </ownedAttribute>
              <ownedOperation xmi:id="O1" name="bar" visibility="public">
                <ownedParameter xmi:id="P2" name="x" direction="in" type="T1" />
                <ownedParameter xmi:id="P3" direction="return" type="T1" />
              </ownedOperation>
            </packagedElement>
          </packagedElement>
        </uml:Model>
      </xmi:XMI>
    `;

    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');
    parseEaXmiPackageHierarchyToFolders(doc, report);
    const { elements } = parseEaXmiClassifiersToElements(doc, report);

    const c1 = elements.find((e) => e.id === 'C1');
    expect(c1?.type).toBe('uml.class');

    const members = (c1?.meta as any)?.umlMembers;
    expect(members).toBeDefined();

        expect(members.attributes).toEqual([
      {
        name: 'foo',
        type: 'String',
        typeRef: 'T1',
        typeName: 'String',
        multiplicity: { lower: '0', upper: '1' },
        visibility: 'private',
        defaultValue: '42',
      },
    ]);

    expect(members.operations).toEqual([
      { name: 'bar', returnType: 'String', visibility: 'public', params: [{ name: 'x', type: 'String' }] },
    ]);
  });
});
