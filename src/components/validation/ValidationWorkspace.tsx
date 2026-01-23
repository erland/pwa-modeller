import { useMemo, useState } from 'react';

import type { ValidationIssue } from '../../domain';
import { validateModel } from '../../domain';
import { kindsPresent } from '../../domain/validation/kindsPresent';
import { useModelStore } from '../../store/useModelStore';
import type { Selection } from '../model/selection';

import { BpmnValidationMatrix } from './BpmnValidationMatrix';

type Props = {
  onSelect: (selection: Selection) => void;
  /** Optional helper to switch the main workspace tab when navigating to views/nodes. */
  onGoToDiagram?: () => void;
};

function describeTarget(issue: ValidationIssue): string {
  switch (issue.target.kind) {
    case 'model':
      return 'Model';
    case 'folder':
      return `Folder ${issue.target.folderId}`;
    case 'element':
      return `Element ${issue.target.elementId}`;
    case 'connector':
      return `Connector ${issue.target.connectorId}`;
    case 'relationship':
      return `Relationship ${issue.target.relationshipId}`;
    case 'view':
      return `View ${issue.target.viewId}`;
    case 'viewNode':
      return `View ${issue.target.viewId} / Element ${issue.target.elementId}`;
    default:
      return 'unknown';
  }
}

export function ValidationWorkspace({ onSelect, onGoToDiagram }: Props) {
  const model = useModelStore((s) => s.model);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [panel, setPanel] = useState<'issues' | 'bpmnMatrix'>('issues');

  const hasBpmn = useMemo(() => {
    if (!model) return false;
    return kindsPresent(model).has('bpmn');
  }, [model]);

  const summary = useMemo(() => {
    const list = issues ?? [];
    const errors = list.filter((i) => i.severity === 'error').length;
    const warnings = list.filter((i) => i.severity === 'warning').length;
    return { errors, warnings, total: list.length };
  }, [issues]);

  function runValidation() {
    if (!model) return;
    setIssues(validateModel(model));
  }

  function navigate(issue: ValidationIssue) {
    switch (issue.target.kind) {
      case 'model':
        onSelect({ kind: 'model' });
        break;
      case 'folder':
        onSelect({ kind: 'folder', folderId: issue.target.folderId });
        break;
      case 'element':
        onSelect({ kind: 'element', elementId: issue.target.elementId });
        break;
      case 'connector':
        onSelect({ kind: 'connector', connectorId: issue.target.connectorId });
        break;
      case 'relationship':
        onSelect({ kind: 'relationship', relationshipId: issue.target.relationshipId });
        break;
      case 'view':
        onGoToDiagram?.();
        onSelect({ kind: 'view', viewId: issue.target.viewId });
        break;
      case 'viewNode':
        onGoToDiagram?.();
        onSelect({ kind: 'viewNode', viewId: issue.target.viewId, elementId: issue.target.elementId });
        break;
    }
  }

  if (!model) {
    return (
      <div className="crudSection" aria-label="Validation panel">
        <h2 className="crudTitle">Validation</h2>
        <p className="crudHint">Create or open a model to validate it.</p>
      </div>
    );
  }

  return (
    <div className="crudSection" aria-label="Validation panel">
      <div className="crudHeader">
        <div>
          <h2 className="crudTitle">Validation</h2>
          <p className="crudHint">Run consistency checks and strict notation validation.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} aria-label="Validation panel mode">
            <button
              type="button"
              className={panel === 'issues' ? 'shellButton' : 'miniLinkButton'}
              onClick={() => setPanel('issues')}
              aria-pressed={panel === 'issues'}
            >
              Issues
            </button>
            {hasBpmn ? (
              <button
                type="button"
                className={panel === 'bpmnMatrix' ? 'shellButton' : 'miniLinkButton'}
                onClick={() => setPanel('bpmnMatrix')}
                aria-pressed={panel === 'bpmnMatrix'}
              >
                BPMN Matrix
              </button>
            ) : null}
          </div>
          <button type="button" className="shellButton" onClick={runValidation}>
            Validate Model
          </button>
          {issues ? (
            <span className="panelHint">
              {summary.total === 0
                ? 'No issues'
                : `${summary.errors} error${summary.errors === 1 ? '' : 's'}, ${summary.warnings} warning${summary.warnings === 1 ? '' : 's'}`}
            </span>
          ) : (
            <span className="panelHint">Not run yet</span>
          )}
        </div>
      </div>

      {panel === 'bpmnMatrix' ? (
        <BpmnValidationMatrix model={model} />
      ) : issues === null ? (
        <p className="panelHint">Click “Validate Model” to scan the current model.</p>
      ) : issues.length === 0 ? (
        <p className="panelHint">✅ No issues found.</p>
      ) : (
        <table className="dataTable" aria-label="Validation issues">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Issue</th>
              <th>Target</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i) => (
              <tr key={i.id}>
                <td className="mono">{i.severity.toUpperCase()}</td>
                <td>{i.message}</td>
                <td className="mono">{describeTarget(i)}</td>
                <td>
                  <div className="rowActions" style={{ justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="miniLinkButton"
                      onClick={() => navigate(i)}
                      aria-label={`Go to ${describeTarget(i)}`}
                    >
                      Go to
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
