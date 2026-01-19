import { parseMeffXml } from '../import/meff/parseMeff';
import { sniffMeff } from '../import/meff/sniffMeff';

describe('MEFF importer - namespace/prefix tolerance', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ns0:model xmlns:ns0="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ns0:elements>
    <ns0:element identifier="e1" xsi:type="BusinessActor">
      <ns0:name>Actor A</ns0:name>
    </ns0:element>
  </ns0:elements>
  <ns0:relationships>
    <ns0:relationship identifier="r1" xsi:type="Assignment" source="e1" target="e1">
      <ns0:name>Assign</ns0:name>
    </ns0:relationship>
  </ns0:relationships>
  <ns0:views>
    <ns0:view identifier="v1" name="View 1">
      <ns0:nodes>
        <ns0:node identifier="n1" elementRef="e1" x="10" y="20" width="100" height="60" />
      </ns0:nodes>
      <ns0:connection identifier="c1" relationshipRef="r1" source="n1" target="n1" />
    </ns0:view>
  </ns0:views>
</ns0:model>
`;

  it('sniffer recognizes MEFF with namespaced root tags', () => {
    const ok = sniffMeff({
      sniffText: xml,
      fileName: 'prefixed.archimate.xml'
    } as any);
    expect(ok).toBe(true);
  });

  it('parser reads elements, relationships and views with namespaced tags', () => {
    const { ir, report } = parseMeffXml(xml, 'prefixed.archimate.xml');

    expect(report.warnings.join('\n')).not.toMatch(/No <elements> section found/i);
    expect(report.warnings.join('\n')).not.toMatch(/No <relationships> section found/i);

    expect(ir.elements).toHaveLength(1);
    expect(ir.relationships).toHaveLength(1);
    expect(ir.views).toHaveLength(1);

    expect(ir.elements[0].id).toBe('e1');
    expect(ir.elements[0].name).toBe('Actor A');

    expect(ir.views[0].id).toBe('v1');
    expect(ir.views[0].nodes).toHaveLength(1);
    expect(ir.views[0].nodes[0].kind).toBe('element');
    expect((ir.views[0].nodes[0] as any).elementId).toBe('e1');

    expect(ir.views[0].connections).toHaveLength(1);
    expect(ir.views[0].connections[0].relationshipId).toBe('r1');
  });
});
