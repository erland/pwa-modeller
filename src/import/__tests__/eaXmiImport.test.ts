import { importModel } from '../framework/importModel';
import { applyImportIR } from '../apply/applyImportIR';
import { modelStore } from '../../store';

function makeEaXmiFixture(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.omg.org/spec/UML/20131001">
  <xmi:Documentation exporter="Enterprise Architect" exporterVersion="16.1" />
  <xmi:Extension extender="Enterprise Architect">
    <elements />
  </xmi:Extension>
  <uml:Model xmi:id="m1" name="TestModel">
    <packagedElement xmi:type="uml:Package" xmi:id="pkg1" name="PkgA">
      <packagedElement xmi:type="uml:Class" xmi:id="c1" name="A">
        <ownedAttribute xmi:id="a1" name="id" type="dt1" visibility="private" />
        <ownedOperation xmi:id="op1" name="foo" visibility="public">
          <ownedParameter xmi:id="p1" name="x" type="dt1" />
          <ownedParameter xmi:id="r1" direction="return" type="dt1" />
        </ownedOperation>
      </packagedElement>
      <packagedElement xmi:type="uml:Class" xmi:id="c2" name="B" />
      <packagedElement xmi:type="uml:PrimitiveType" xmi:id="dt1" name="String" />

      <packagedElement xmi:type="uml:Association" xmi:id="as1" name="AtoB">
        <ownedEnd xmi:id="ae1" type="c1" name="a" isNavigable="true">
          <lowerValue xmi:type="uml:LiteralInteger" value="1" />
          <upperValue xmi:type="uml:LiteralUnlimitedNatural" value="1" />
        </ownedEnd>
        <ownedEnd xmi:id="be1" type="c2" name="bs">
          <lowerValue xmi:type="uml:LiteralInteger" value="0" />
          <upperValue xmi:type="uml:LiteralUnlimitedNatural" value="*" />
        </ownedEnd>
      </packagedElement>

      <packagedElement xmi:type="uml:Generalization" xmi:id="g1" specific="c2" general="c1" />
    </packagedElement>
  </uml:Model>
</xmi:XMI>`;
}

describe('EA XMI UML import (integration)', () => {
  beforeEach(() => {
    modelStore.reset();
  });

  it('sniffs EA XMI and produces a normalized IR with elements + relationships', async () => {
    const xml = makeEaXmiFixture();
    const file = new File([xml], 'test.xmi', { type: 'application/xml' });

    const res = await importModel(file);

    expect(res.importerId).toBe('ea-xmi-uml');
    expect(res.format).toBe('ea-xmi-uml');
    expect(res.report.source).toBe('ea-xmi-uml');

    expect(res.ir.meta?.format).toBe('ea-xmi-uml');
    expect(res.ir.folders.length).toBe(1);
    expect(res.ir.elements.length).toBe(3);
    expect(res.ir.relationships.length).toBe(2);

    const a = res.ir.elements.find((e) => e.id === 'c1');
    expect(a?.type).toBe('uml.class');
    expect(a?.folderId).toBe('pkg1');
    expect((a as any)?.meta?.umlMembers).toBeTruthy();

    const assoc = res.ir.relationships.find((r) => r.id === 'as1');
    expect(assoc?.type).toBe('uml.association');
    expect((assoc as any)?.meta?.umlAttrs?.targetMultiplicity).toBe('0..*');
    expect((assoc as any)?.meta?.umlAttrs?.sourceNavigable).toBe(true);
  });

  it('applies EA XMI IR to the store and preserves UML members + association end metadata', async () => {
    const xml = makeEaXmiFixture();
    const file = new File([xml], 'test.xmi', { type: 'application/xml' });

    const res = await importModel(file);
    const applied = applyImportIR(res.ir, res.report, { sourceSystem: 'ea-xmi-uml' });

    expect(applied.modelId).toBeTruthy();

    const model = modelStore.getState().model;
    expect(model).not.toBeNull();

    const els = Object.values(model!.elements);
    expect(els.some((e) => e.type === 'uml.class' && e.name === 'A')).toBe(true);

    const a = els.find((e) => e.type === 'uml.class' && e.name === 'A');
    expect(a).toBeTruthy();
    expect(Array.isArray((a as any).attrs?.attributes)).toBe(true);
    expect((a as any).attrs.attributes[0].name).toBe('id');

    const rels = Object.values(model!.relationships);
    const assoc = rels.find((r) => r.type === 'uml.association');
    expect(assoc).toBeTruthy();
    expect((assoc as any).attrs?.sourceRole).toBe('a');
    expect((assoc as any).attrs?.targetRole).toBe('bs');
    expect((assoc as any).attrs?.sourceMultiplicity).toBe('1');
    expect((assoc as any).attrs?.targetMultiplicity).toBe('0..*');
    expect((assoc as any).attrs?.sourceNavigable).toBe(true);
  });
});
