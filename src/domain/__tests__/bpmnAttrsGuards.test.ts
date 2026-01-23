import {
  isBpmnDataObjectReferenceAttrs,
  isBpmnDataStoreReferenceAttrs,
  isBpmnErrorAttrs,
  isBpmnEscalationAttrs,
  isBpmnMessageAttrs,
  isBpmnPoolAttrs,
  isBpmnProcessAttrs,
  isBpmnTextAnnotationAttrs,
} from '../bpmnAttrs';

describe('bpmnAttrs guards (Step 2)', () => {
  test('pool/process/textAnnotation/data refs are backward compatible (optional fields)', () => {
    expect(isBpmnPoolAttrs({})).toBe(true);
    expect(isBpmnPoolAttrs({ processRef: 'el_1' })).toBe(true);

    expect(isBpmnProcessAttrs({})).toBe(true);
    expect(isBpmnProcessAttrs({ isExecutable: true })).toBe(true);

    expect(isBpmnTextAnnotationAttrs({})).toBe(true);
    expect(isBpmnTextAnnotationAttrs({ text: 'Hej' })).toBe(true);

    expect(isBpmnDataObjectReferenceAttrs({})).toBe(true);
    expect(isBpmnDataObjectReferenceAttrs({ dataObjectRef: 'el_data' })).toBe(true);

    expect(isBpmnDataStoreReferenceAttrs({})).toBe(true);
    expect(isBpmnDataStoreReferenceAttrs({ dataStoreRef: 'el_store' })).toBe(true);
  });

  test('global defs shapes are accepted', () => {
    expect(isBpmnMessageAttrs({})).toBe(true);
    expect(isBpmnMessageAttrs({ itemRef: 'Item_1' })).toBe(true);

    expect(isBpmnErrorAttrs({})).toBe(true);
    expect(isBpmnErrorAttrs({ errorCode: 'E1', structureRef: 'Item_2' })).toBe(true);

    expect(isBpmnEscalationAttrs({})).toBe(true);
    expect(isBpmnEscalationAttrs({ escalationCode: 'ESC_1' })).toBe(true);
  });
});
