import { createImportReport } from '../../importReport';
import { parseXml } from '../../framework/xml';
import { parseEaXmiRelationships } from '../parseRelationships';

describe('eaXmi relationship parsing (step 7)', () => {
  test('parses embedded generalization and packaged dependencies/realizations/include/extend', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="Model">
          <packagedElement xmi:type="uml:Package" xmi:id="P1" name="Pkg">
            <packagedElement xmi:type="uml:Class" xmi:id="C1" name="A">
              <generalization xmi:id="G1" general="C2" />
              <interfaceRealization xmi:id="IR1" supplier="I1" />
            </packagedElement>
            <packagedElement xmi:type="uml:Class" xmi:id="C2" name="B" />
            <packagedElement xmi:type="uml:Interface" xmi:id="I1" name="I" />

            <packagedElement xmi:type="uml:Dependency" xmi:id="D1" client="C1" supplier="C2" />
            <packagedElement xmi:type="uml:Realization" xmi:id="R1" client="C1" supplier="I1" />

            <packagedElement xmi:type="uml:Dependency" xmi:id="Dinc" client="UC1" supplier="UC2" stereotype="include" />

            <packagedElement xmi:type="uml:UseCase" xmi:id="UC1" name="Base" />
            <packagedElement xmi:type="uml:UseCase" xmi:id="UC2" name="Included" />
            <packagedElement xmi:type="uml:Include" xmi:id="INC1" includingCase="UC1" addition="UC2" />
            <packagedElement xmi:type="uml:Extend" xmi:id="EXT1" extension="UC2" extendedCase="UC1" />
          </packagedElement>
        </uml:Model>
      </xmi:XMI>
    `;

    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');
    const { relationships } = parseEaXmiRelationships(doc, report);

    const byId = new Map(relationships.map((r) => [r.id, r]));

    // Embedded generalization under C1
    expect(byId.get('G1')?.type).toBe('uml.generalization');
    expect(byId.get('G1')?.sourceId).toBe('C1');
    expect(byId.get('G1')?.targetId).toBe('C2');

    // Embedded interface realization: client inferred from owning classifier
    expect(byId.get('IR1')?.type).toBe('uml.realization');
    expect(byId.get('IR1')?.sourceId).toBe('C1');
    expect(byId.get('IR1')?.targetId).toBe('I1');

    // Packaged relationships
    expect(byId.get('D1')?.type).toBe('uml.dependency');
    expect(byId.get('D1')?.sourceId).toBe('C1');
    expect(byId.get('D1')?.targetId).toBe('C2');

    expect(byId.get('R1')?.type).toBe('uml.realization');
    expect(byId.get('R1')?.sourceId).toBe('C1');
    expect(byId.get('R1')?.targetId).toBe('I1');

    // Dependency with include stereotype should map to uml.include
    expect(byId.get('Dinc')?.type).toBe('uml.include');
    expect(byId.get('Dinc')?.sourceId).toBe('UC1');
    expect(byId.get('Dinc')?.targetId).toBe('UC2');

    // Dedicated include/extend
    expect(byId.get('INC1')?.type).toBe('uml.include');
    expect(byId.get('INC1')?.sourceId).toBe('UC1');
    expect(byId.get('INC1')?.targetId).toBe('UC2');

    expect(byId.get('EXT1')?.type).toBe('uml.extend');
    expect(byId.get('EXT1')?.sourceId).toBe('UC2');
    expect(byId.get('EXT1')?.targetId).toBe('UC1');

    // No warnings expected for happy path.
    expect(report.warnings).toEqual([]);
  });

  test('emits multiple relationships for multiple clients/suppliers', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="Model">
          <packagedElement xmi:type="uml:Dependency" xmi:id="D1" client="A B" supplier="C D" />
        </uml:Model>
      </xmi:XMI>
    `;
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');
    const { relationships } = parseEaXmiRelationships(doc, report);
    // 2 clients x 2 suppliers => 4 relationships, id suffixes.
    expect(relationships).toHaveLength(4);
    expect(new Set(relationships.map((r) => r.id)).size).toBe(4);
    expect(relationships.every((r) => r.type === 'uml.dependency')).toBe(true);
  });

  test('parses ControlFlow/ObjectFlow between Activity nodes', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="Model">
          <packagedElement xmi:type="uml:Activity" xmi:id="A1" name="Act" />
          <packagedElement xmi:type="uml:InitialNode" xmi:id="N0" />
          <packagedElement xmi:type="uml:OpaqueAction" xmi:id="N1" name="Step 1" />
          <packagedElement xmi:type="uml:ObjectNode" xmi:id="O1" name="Obj" />
          <packagedElement xmi:type="uml:ControlFlow" xmi:id="CF1" source="N0" target="N1">
            <ownedComment><body>Go</body></ownedComment>
          </packagedElement>
          <packagedElement xmi:type="uml:ObjectFlow" xmi:id="OF1" source="N1" target="O1" />
        </uml:Model>
      </xmi:XMI>
    `;
    const doc = parseXml(xml);
    const report = createImportReport('ea-xmi-uml');
    const { relationships } = parseEaXmiRelationships(doc, report);

    const byId = new Map(relationships.map((r) => [r.id, r]));
    expect(byId.get('CF1')?.type).toBe('uml.controlFlow');
    expect(byId.get('CF1')?.sourceId).toBe('N0');
    expect(byId.get('CF1')?.targetId).toBe('N1');
    expect(byId.get('CF1')?.documentation).toBe('Go');

    expect(byId.get('OF1')?.type).toBe('uml.objectFlow');
    expect(byId.get('OF1')?.sourceId).toBe('N1');
    expect(byId.get('OF1')?.targetId).toBe('O1');

    expect(report.warnings).toEqual([]);
  });

});
