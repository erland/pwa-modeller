import { measureUmlClassifierBoxHeights, UML_CLASSIFIER_METRICS } from './measureClassifierText';

describe('measureUmlClassifierBoxHeights', () => {
  it('computes header only when collapsed', () => {
    const r = measureUmlClassifierBoxHeights({
      hasStereotype: true,
      collapsed: true,
      showAttributes: true,
      showOperations: true,
      attributeLines: 10,
      operationLines: 10,
    });
    // compartments should be hidden
    expect(r.attributesH).toBe(0);
    expect(r.operationsH).toBe(0);
    expect(r.headerH).toBeGreaterThan(0);
    expect(r.totalH).toBeGreaterThanOrEqual(UML_CLASSIFIER_METRICS.minHeight);
  });

  it('reserves at least one line for enabled empty compartments', () => {
    const r = measureUmlClassifierBoxHeights({
      hasStereotype: false,
      collapsed: false,
      showAttributes: true,
      showOperations: false,
      attributeLines: 0,
      operationLines: 0,
    });
    // attributes compartment should still have height > 0
    expect(r.attributesH).toBeGreaterThan(0);
    expect(r.operationsH).toBe(0);
  });

  it('scales with number of lines', () => {
    const r1 = measureUmlClassifierBoxHeights({
      hasStereotype: false,
      collapsed: false,
      showAttributes: true,
      showOperations: true,
      attributeLines: 1,
      operationLines: 1,
    });
    const r5 = measureUmlClassifierBoxHeights({
      hasStereotype: false,
      collapsed: false,
      showAttributes: true,
      showOperations: true,
      attributeLines: 5,
      operationLines: 5,
    });
    expect(r5.totalH).toBeGreaterThan(r1.totalH);
  });
});
