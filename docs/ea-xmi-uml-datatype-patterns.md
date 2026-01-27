# EA XMI UML datatype patterns (supported)

This document describes the Sparx Enterprise Architect (EA) XMI patterns that the importer supports for extracting UML
attribute/association-end **datatypes** and **multiplicities**.

The goal is that each supported pattern has a unit test and an explicit parsing path (no accidental reliance on ambiguous
attributes such as `xmi:type`).

## Pattern 1 — `<ownedAttribute>` / `uml:Property` with `<type xmi:idref="…"/>`

Typical structure:

```xml
<ownedAttribute xmi:type="uml:Property" … name="Foo">
  <type xmi:idref="EAID_…"/>
  <lowerValue … value="0"/>
  <upperValue … value="1"/>
</ownedAttribute>
```

Supported behavior:

- `dataTypeRef` is read from `<type xmi:idref>`.
- `dataTypeName` is resolved by looking up the referenced element by `xmi:id` and reading its `name`.
- Multiplicity is read from `<lowerValue value>` and `<upperValue value>`.

## Pattern 2 — Wrapper `<attributes><attribute xmi:idref="…"/></attributes>`

EA sometimes emits a wrapper that points to an `uml:Property` node elsewhere in the document.

```xml
<packagedElement xmi:type="uml:Class" …>
  <attributes>
    <attribute xmi:idref="A1"/>
  </attributes>
</packagedElement>

<!-- elsewhere -->
<packagedElement xmi:type="uml:Property" xmi:id="A1" name="Foo" …>
  <type xmi:idref="T1"/>
</packagedElement>
```

Supported behavior:

- The wrapper is resolved via the document id index.
- The referenced `uml:Property` is parsed as if it were an `<ownedAttribute>`.

## Pattern 3 — Primitive types via `<type href="…/String"/>`

Some exports (profiles/primitive references) use an href:

```xml
<ownedAttribute …>
  <type href="http://schema.omg.org/spec/UML/2.1/String"/>
</ownedAttribute>
```

Supported behavior:

- `dataTypeRef` is stored as the full href.
- `dataTypeName` is extracted as the last segment (`String`, `Boolean`, `Integer`, …).

Guardrails:

- Hrefs that point to UML metaclasses (e.g. `…/Property`, `…/Class`) are **not** treated as datatypes.

## Multiplicity normalization

EA commonly encodes "unlimited" upper multiplicity as `-1`.

Supported behavior:

- `upperValue value="-1"` is normalized to `"*"`.

## Non-goals (for now)

- Guessing datatype names from internal ids (e.g. `EAID_…`) without a clear hint.
- Displaying UML metaclass strings (e.g. `uml:Property`) as datatypes.
