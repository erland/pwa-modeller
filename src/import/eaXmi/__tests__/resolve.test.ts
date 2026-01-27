import { parseXml } from '../../framework/xml';
import { buildXmiIdIndex, buildXmiIdToNameIndex, parseIdRefList, resolveById, resolveHrefId } from '../resolve';

describe('eaXmi reference utilities', () => {
  test('buildXmiIdIndex indexes xmi:id and id', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="Model">
          <packagedElement xmi:type="uml:Class" xmi:id="C1" name="Class1" />
          <packagedElement xmi:type="uml:Class" id="C2" name="Class2" />
        </uml:Model>
      </xmi:XMI>
    `;

    const doc = parseXml(xml);
    const index = buildXmiIdIndex(doc);

    expect(index.get('M1')?.tagName).toBeTruthy();
    expect(index.get('C1')?.getAttribute('name')).toBe('Class1');
    expect(index.get('C2')?.getAttribute('name')).toBe('Class2');
  });

  test('buildXmiIdToNameIndex indexes names for common UML type elements', () => {
    const xml = `
      <xmi:XMI xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.omg.org/spec/UML/20131001">
        <uml:Model xmi:id="M1" name="Model">
          <packagedElement xmi:type="uml:Class" xmi:id="C1" name="Person" />
          <packagedElement xmi:type="uml:DataType" xmi:id="DT1">
            <properties name="Money" />
          </packagedElement>
        </uml:Model>
      </xmi:XMI>
    `;
  
    const doc = parseXml(xml);
    const idIndex = buildXmiIdIndex(doc);
    const idToName = buildXmiIdToNameIndex(doc, idIndex);
  
    expect(idToName.get('C1')).toBe('Person');
    expect(idToName.get('DT1')).toBe('Money');
  });

  test('resolveById resolves a simple id', () => {
    const xml = `<root><a xmi:id="A" xmlns:xmi="http://www.omg.org/XMI" /><b xmi:id="B" xmlns:xmi="http://www.omg.org/XMI" /></root>`;
    const doc = parseXml(xml);
    const index = buildXmiIdIndex(doc);

    expect(resolveById(index, 'A')?.localName).toBe('a');
    expect(resolveById(index, '  B  ')?.localName).toBe('b');
    expect(resolveById(index, 'missing')).toBeUndefined();
    expect(resolveById(index, undefined)).toBeUndefined();
  });

  test('parseIdRefList handles whitespace-separated values', () => {
    expect(parseIdRefList(undefined)).toEqual([]);
    expect(parseIdRefList('')).toEqual([]);
    expect(parseIdRefList('  A  B\nC\tD  ')).toEqual(['A', 'B', 'C', 'D']);
  });

  test('resolveHrefId extracts fragment after #', () => {
    expect(resolveHrefId(undefined)).toBeUndefined();
    expect(resolveHrefId('file.xmi#_abc')).toBe('_abc');
    expect(resolveHrefId('#_only')).toBe('_only');
    expect(resolveHrefId('no-fragment')).toBeUndefined();
    expect(resolveHrefId('file.xmi#')).toBeUndefined();
  });
});
