import type { Model } from '../../../domain';
import type { FolderOption } from '../../../domain';
import type { ModelActions } from './actions';
import type { Selection } from '../selection';
import { ElementProperties } from './ElementProperties';
import { readUmlNodeAttrs } from '../../../notations/uml/nodeAttrs';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asTrimmedOrUndef(v: string): string | undefined {
  const s = v.trim();
  return s.length ? s : undefined;
}

function asMultilineOrUndef(v: string): string | undefined {
  // Keep internal whitespace; only treat empty/whitespace-only as undefined.
  return v.trim().length ? v : undefined;
}

function pruneAttrs(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    next[k] = v;
  }
  return Object.keys(next).length ? next : undefined;
}

type Props = {
  model: Model;
  viewId: string;
  elementId: string;
  actions: ModelActions;
  elementFolders: FolderOption[];
  onSelect?: (selection: Selection) => void;
};

export function ViewNodeProperties({ model, viewId, elementId, actions, elementFolders, onSelect }: Props) {
  const view = model.views[viewId];
  const element = model.elements[elementId];
  const node = view?.layout?.nodes.find((n) => n.elementId === elementId);

  if (!view || !element || !node) {
    return (
      <div>
        <h2 className="panelTitle">Properties</h2>
        <p className="panelHint">Select something to edit its properties.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="panelTitle">Node formatting</h2>
      <p className="panelHint" style={{ marginTop: 6 }}>
        {element.name} <span style={{ opacity: 0.75 }}>in</span> {view.name}
      </p>

      <div className="fieldGroup">
        <label className="fieldLabel">
          <input
            type="checkbox"
            checked={Boolean(node.highlighted)}
            onChange={(e) => actions.updateViewNodeLayout(view.id, element.id, { highlighted: e.target.checked })}
          />{' '}
          Highlight
        </label>
      </div>

      <div className="fieldGroup">
        <label className="fieldLabel" htmlFor="node-style-tag">
          Style tag
        </label>
        <input
          id="node-style-tag"
          aria-label="Node style tag"
          className="textInput"
          placeholder="e.g. Critical"
          value={node.styleTag ?? ''}
          onChange={(e) => actions.updateViewNodeLayout(view.id, element.id, { styleTag: e.target.value || undefined })}
        />
        <p className="panelHint">View-only label; does not change the underlying element.</p>
      </div>

      {view.kind === 'uml' && typeof element.type === 'string' && element.type.startsWith('uml.') ? (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-2)' }}>
          <h2 className="panelTitle">UML node</h2>
          <p className="panelHint" style={{ marginTop: 6 }}>
            These properties are stored per view and affect only this diagram.
          </p>

          {(() => {
            const uml = readUmlNodeAttrs(node);
            const rawAttrs = (node as unknown as { attrs?: unknown }).attrs;
            const base: Record<string, unknown> = isRecord(rawAttrs) ? { ...rawAttrs } : {};

            const nodeType = element.type;
            const isNote = nodeType === 'uml.note';
            const isPackage = nodeType === 'uml.package';
            const isEnum = nodeType === 'uml.enum';
            const isInterface = nodeType === 'uml.interface';

            const attrLabel = isNote
              ? 'Text'
              : isEnum
                ? 'Literals'
                : isPackage
                  ? 'Body'
                  : 'Attributes';

            const showOperations = !isNote && !isPackage; // enums can still have ops in UML, but v1 keeps it optional

            return (
              <div className="propertiesGrid">
                <div className="propertiesRow">
                  <div className="propertiesKey">Display name</div>
                  <div className="propertiesValue" style={{ fontWeight: 400 }}>
                    <input
                      className="textInput"
                      aria-label="UML node display name"
                      placeholder="(optional override)"
                      value={uml.name ?? ''}
                      onChange={(e) => {
                        const next = { ...base, name: asTrimmedOrUndef(e.target.value) };
                        actions.updateViewNodeLayout(view.id, element.id, { attrs: pruneAttrs(next) });
                      }}
                    />
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      If empty, the element name is used.
                    </div>
                  </div>
                </div>

                <div className="propertiesRow">
                  <div className="propertiesKey">Stereotype</div>
                  <div className="propertiesValue" style={{ fontWeight: 400 }}>
                    <input
                      className="textInput"
                      aria-label="UML node stereotype"
                      placeholder={isInterface ? 'interface' : isEnum ? 'enumeration' : isPackage ? 'package' : ''}
                      value={uml.stereotype ?? ''}
                      onChange={(e) => {
                        const next = { ...base, stereotype: asTrimmedOrUndef(e.target.value) };
                        actions.updateViewNodeLayout(view.id, element.id, { attrs: pruneAttrs(next) });
                      }}
                    />
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      Shown as «stereotype». Leave blank for default.
                    </div>
                  </div>
                </div>

                <div className="propertiesRow">
                  <div className="propertiesKey">{attrLabel}</div>
                  <div className="propertiesValue" style={{ fontWeight: 400 }}>
                    <textarea
                      className="textArea"
                      aria-label="UML node attributes"
                      rows={6}
                      placeholder={isNote ? 'Write note text…' : 'One item per line'}
                      value={uml.attributesText ?? ''}
                      onChange={(e) => {
                        const next = { ...base, attributesText: asMultilineOrUndef(e.target.value) };
                        actions.updateViewNodeLayout(view.id, element.id, { attrs: pruneAttrs(next) });
                      }}
                    />
                  </div>
                </div>

                {showOperations ? (
                  <div className="propertiesRow">
                    <div className="propertiesKey">Operations</div>
                    <div className="propertiesValue" style={{ fontWeight: 400 }}>
                      <textarea
                        className="textArea"
                        aria-label="UML node operations"
                        rows={6}
                        placeholder="One operation per line"
                        value={uml.operationsText ?? ''}
                        onChange={(e) => {
                          const next = { ...base, operationsText: asMultilineOrUndef(e.target.value) };
                          actions.updateViewNodeLayout(view.id, element.id, { attrs: pruneAttrs(next) });
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })()}
        </div>
      ) : null}

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-2)' }}>
        <h2 className="panelTitle">Element</h2>
        <p className="panelHint" style={{ marginTop: 6 }}>
          Editing the underlying element (affects all views).
        </p>
        <ElementProperties
          model={model}
          elementId={element.id}
          actions={actions}
          elementFolders={elementFolders}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
