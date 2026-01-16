import type { Element, ElementType, FolderOption } from '../../../../../domain';
import { kindFromTypeId } from '../../../../../domain';
import type { ModelActions } from '../../actions';
import { NameEditorRow } from '../../editors/NameEditorRow';
import { DocumentationEditorRow } from '../../editors/DocumentationEditorRow';
import { PropertyRow } from '../../editors/PropertyRow';

type Props = {
  element: Element;
  kind: 'archimate' | 'uml' | 'bpmn';
  actions: ModelActions;
  currentFolderId: string | null;
  elementFolders: FolderOption[];
  elementTypeOptions: ElementType[];
  kindTypeLabelById: Map<unknown, string>;
};

export function ElementBasicsSection({
  element,
  kind,
  actions,
  currentFolderId,
  elementFolders,
  elementTypeOptions,
  kindTypeLabelById,
}: Props) {
  return (
    <>
      <p className="panelHint">Element</p>
      <div className="propertiesGrid">
        <NameEditorRow
          ariaLabel="Element property name"
          required
          value={element.name}
          onChange={(next) => actions.updateElement(element.id, { name: next ?? '' })}
        />

        {kind !== 'archimate' ? (
          <PropertyRow label="Type">
            <select
              className="selectInput"
              value={element.type}
              onChange={(e) => {
                const nextType = e.target.value as ElementType;
                const nextKind = kindFromTypeId(nextType as unknown as string);

                // If switching between notations, keep the element consistent.
                if (nextKind !== kind) {
                  actions.updateElement(element.id, { type: nextType, kind: nextKind, layer: undefined });
                } else {
                  actions.updateElement(element.id, { type: nextType });
                }
              }}
            >
              {elementTypeOptions.map((t) => {
                const label =
                  t === 'Unknown'
                    ? element.unknownType?.name
                      ? `Unknown: ${element.unknownType.name}`
                      : 'Unknown'
                    : (kindTypeLabelById.get(t) ?? t);
                return (
                  <option key={t} value={t}>
                    {label}
                  </option>
                );
              })}
            </select>
          </PropertyRow>
        ) : null}

        <DocumentationEditorRow
          label="Documentation"
          ariaLabel="Element property documentation"
          value={element.documentation}
          onChange={(next) => actions.updateElement(element.id, { documentation: next })}
        />

        <PropertyRow label="Folder">
          <select
            className="selectInput"
            value={currentFolderId ?? ''}
            onChange={(e) => {
              const targetId = e.target.value;
              if (targetId) actions.moveElementToFolder(element.id, targetId);
            }}
          >
            {elementFolders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </PropertyRow>
      </div>
    </>
  );
}
