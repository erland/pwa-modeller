import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaXmiPackageHierarchyToFolders } from '../parsePackages';

describe('eaXmi package hierarchy parsing', () => {
  test('parses nested uml:Package packagedElement hierarchy into folders', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="MyModel">
          <packagedElement xmi:type="uml:Package" xmi:id="P1" name="RootPkg">
            <packagedElement xmi:type="uml:Package" xmi:id="P1_1" name="ChildPkg" />
          </packagedElement>
          <packagedElement xmi:type="uml:Package" xmi:id="P2" name="Another" />
          <packagedElement xmi:type="uml:Class" xmi:id="C1" name="ShouldNotBeFolder" />
        </uml:Model>
      </xmi:XMI>
    `;

    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');
    const { folders } = parseEaXmiPackageHierarchyToFolders(doc, report);

    expect(folders.map((f) => f.id).sort()).toEqual(['P1', 'P1_1', 'P2'].sort());
    const child = folders.find((f) => f.id === 'P1_1');
    expect(child?.parentId).toBe('P1');
    expect(report.warnings).toEqual([]);
  });

  test('generates synthetic ids when a package has no xmi:id', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="MyModel">
          <packagedElement xmi:type="uml:Package" name="NoIdPackage" />
        </uml:Model>
      </xmi:XMI>
    `;
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');
    const { folders } = parseEaXmiPackageHierarchyToFolders(doc, report);

    expect(folders).toHaveLength(1);
    expect(folders[0]!.id).toMatch(/^eaPkg_synth_\d+$/);
    expect(report.warnings.join('\n')).toMatch(/Package missing xmi:id/);
  });
});
