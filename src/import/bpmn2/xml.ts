/**
 * Namespace-tolerant XML helpers used by importers.
 *
 * Historically these helpers lived in the BPMN2 importer folder. They are now shared across
 * importers (BPMN2, MEFF, Sparx EA XMI, etc.) and re-exported from here for backwards compatibility.
 */

export {
  isElementNode,
  localName,
  attr,
  attrAny,
  requiredAttr,
  numberAttr,
  text,
  childrenByLocalName,
  childByLocalName,
  q,
  qa,
  pickTextByLang,
  childText,
  getType,
  parseXmlLenient,
  parseXml
} from '../framework/xml';
