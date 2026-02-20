import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaXmiAssociations } from '../parseAssociations';

describe('eaXmi association parsing (step 8)', () => {
  test('parses association ends with roles, multiplicity, navigability and composition mapping', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="Model">
          <packagedElement xmi:type="uml:Package" xmi:id="P1" name="Pkg">
            <packagedElement xmi:type="uml:Class" xmi:id="C1" name="A" />
            <packagedElement xmi:type="uml:Class" xmi:id="C2" name="B" />

            <packagedElement xmi:type="uml:Association" xmi:id="A1" memberEnd="E1 E2" navigableOwnedEnd="E1">
              <ownedEnd xmi:id="E1" type="C1" name="a" isNavigable="true">
                <lowerValue value="0"/>
                <upperValue value="*"/>
              </ownedEnd>
              <ownedEnd xmi:id="E2" type="C2" name="b" aggregation="composite">
                <lowerValue value="1"/>
                <upperValue value="1"/>
              </ownedEnd>
            </packagedElement>
          </packagedElement>
        </uml:Model>
      </xmi:XMI>
    `;

    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');
    const { relationships } = parseEaXmiAssociations(doc, report);

    expect(relationships).toHaveLength(1);
    const r = relationships[0]!;

    expect(r.id).toBe('A1');
    expect(r.type).toBe('uml.composition');
    // For composition we orient source=whole (composite end).
    expect(r.sourceId).toBe('C2');
    expect(r.targetId).toBe('C1');

    const umlAttrs = (r.meta as any)?.umlAttrs;
    expect(umlAttrs).toMatchObject({
      sourceRole: 'b',
      targetRole: 'a',
      sourceMultiplicity: '1',
      targetMultiplicity: '0..*',
      sourceNavigable: false,
      targetNavigable: true
    });

    expect(report.warnings).toEqual([]);
  });

  test('maps shared aggregation to uml.aggregation', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="Model">
          <packagedElement xmi:type="uml:Class" xmi:id="C1" name="A" />
          <packagedElement xmi:type="uml:Class" xmi:id="C2" name="B" />

          <packagedElement xmi:type="uml:Association" xmi:id="A2" memberEnd="E3 E4">
            <ownedEnd xmi:id="E3" type="C1" aggregation="shared" />
            <ownedEnd xmi:id="E4" type="C2" />
          </packagedElement>
        </uml:Model>
      </xmi:XMI>
    `;

    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');
    const { relationships } = parseEaXmiAssociations(doc, report);

    expect(relationships).toHaveLength(1);
    expect(relationships[0]!.type).toBe('uml.aggregation');
    expect(report.warnings).toEqual([]);
  });

  test('self-associations keep both end labels deterministically', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="Model">
          <packagedElement xmi:type="uml:Class" xmi:id="C1" name="Person" />

          <packagedElement xmi:type="uml:Association" xmi:id="A3" memberEnd="E1 E2">
            <ownedEnd xmi:id="E1" type="C1" name="parent">
              <lowerValue value="0"/>
              <upperValue value="1"/>
            </ownedEnd>
            <ownedEnd xmi:id="E2" type="C1" name="children">
              <lowerValue value="0"/>
              <upperValue value="*"/>
            </ownedEnd>
          </packagedElement>
        </uml:Model>
      </xmi:XMI>
    `;

    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');
    const { relationships } = parseEaXmiAssociations(doc, report);

    expect(relationships).toHaveLength(1);
    const r = relationships[0]!;
    expect(r.id).toBe('A3');
    expect(r.type).toBe('uml.association');
    expect(r.sourceId).toBe('C1');
    expect(r.targetId).toBe('C1');

    const umlAttrs = (r.meta as any)?.umlAttrs;
    // Deterministic tie-break by endId: E1 becomes source-side label, E2 becomes target-side label.
    expect(umlAttrs).toMatchObject({
      sourceRole: 'parent',
      targetRole: 'children',
      sourceMultiplicity: '0..1',
      targetMultiplicity: '0..*'
    });
    expect(report.warnings).toEqual([]);
  });

  test('imports AssociationClass as an association relationship with stable id and linkage attrs', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="Model">
          <packagedElement xmi:type="uml:Package" xmi:id="P1" name="Pkg">
            <packagedElement xmi:type="uml:Class" xmi:id="C1" name="A" />
            <packagedElement xmi:type="uml:Class" xmi:id="C2" name="B" />

            <packagedElement xmi:type="uml:AssociationClass" xmi:id="AC1" memberEnd="E1 E2">
              <ownedEnd xmi:id="E1" type="C1" name="a" />
              <ownedEnd xmi:id="E2" type="C2" name="b" />
            </packagedElement>
          </packagedElement>
        </uml:Model>
      </xmi:XMI>
    `;
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');
    const { relationships } = parseEaXmiAssociations(doc, report);

    expect(relationships).toHaveLength(1);
    const r = relationships[0]!;
    expect(r.id).toBe('AC1__association');
    expect(r.type).toBe('uml.association');
    expect((r as any).attrs).toMatchObject({ associationClassElementId: 'AC1' });
    expect(report.warnings).toEqual([]);
  });
});
