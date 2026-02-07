import type { Model } from '../../../domain';
import type { MiniGraphOptions } from '../MiniGraphOptions';
import type {
  SandboxInsertIntermediatesOptions,
  SandboxState,
  SandboxUiState,
} from '../workspace/controller/sandboxTypes';

import { OverlaySettingsDialog } from '../OverlaySettingsDialog';
import { SaveSandboxAsDiagramDialog } from './SaveSandboxAsDiagramDialog';
import { SandboxInsertDialog } from './SandboxInsertDialog';

/**
 * Presentational wrapper for Sandbox dialogs (insert/add-related/save/overlay).
 * Keeps SandboxModeView focused on composition and callback wiring.
 */
export function SandboxModeDialogs({
  // Common
  model,
  ui,
  nodesElementIds,
  allRelationshipTypes,
  addRelated,

  // Insert intermediates (between)
  insertBetweenDialogOpen,
  insertBetweenEndpoints,
  closeInsertBetweenDialog,
  // Insert intermediates (from edge)
  insertFromEdgeDialogOpen,
  insertFromEdgeEndpoints,
  closeInsertFromEdgeDialog,
  selectedEdgeType,

  // Add related
  addRelatedDialogOpen,
  addRelatedDialogAnchors,
  closeAddRelatedDialog,

  // Persisted insert UI state
  insertMode,
  setInsertMode,
  insertK,
  setInsertK,
  insertMaxHops,
  setInsertMaxHops,
  insertDirection,
  setInsertDirection,

  // Save as diagram
  saveDialogOpen,
  setSaveDialogOpen,
  onSaveAsDiagram,
  getVisibleRelationshipIds,

  // Overlay
  isOverlayOpen,
  setIsOverlayOpen,
  graphOptions,
  setGraphOptions,
  availablePropertyKeys,

  // Actions
  onSetAddRelatedEnabledTypes,
  onSetAddRelatedDepth,
  onSetAddRelatedDirection,
  onAddRelatedFromSelection,
  onInsertIntermediatesBetween,
}: {
  model: Model;
  ui: SandboxUiState;
  nodesElementIds: string[];
  allRelationshipTypes: string[];
  addRelated: SandboxState['addRelated'];

  insertBetweenDialogOpen: boolean;
  insertBetweenEndpoints: [string, string] | null;
  closeInsertBetweenDialog: () => void;

  insertFromEdgeDialogOpen: boolean;
  insertFromEdgeEndpoints: [string, string] | null;
  closeInsertFromEdgeDialog: () => void;
  selectedEdgeType?: string;

  addRelatedDialogOpen: boolean;
  addRelatedDialogAnchors: string[];
  closeAddRelatedDialog: () => void;

  insertMode: SandboxInsertIntermediatesOptions['mode'];
  setInsertMode: (mode: SandboxInsertIntermediatesOptions['mode']) => void;
  insertK: number;
  setInsertK: (k: number) => void;
  insertMaxHops: number;
  setInsertMaxHops: (hops: number) => void;
  insertDirection: SandboxInsertIntermediatesOptions['direction'];
  setInsertDirection: (direction: SandboxInsertIntermediatesOptions['direction']) => void;

  saveDialogOpen: boolean;
  setSaveDialogOpen: (open: boolean) => void;
  onSaveAsDiagram: (name: string, visibleRelationshipIds: string[]) => void;
  getVisibleRelationshipIds: () => string[];

  isOverlayOpen: boolean;
  setIsOverlayOpen: (open: boolean) => void;
  graphOptions: MiniGraphOptions;
  setGraphOptions: (next: MiniGraphOptions) => void;
  availablePropertyKeys: string[];

  onSetAddRelatedEnabledTypes: (types: string[]) => void;
  onSetAddRelatedDepth: (depth: number) => void;
  onSetAddRelatedDirection: (direction: SandboxState['addRelated']['direction']) => void;
  onAddRelatedFromSelection: (anchorElementIds: string[], allowedElementIds?: string[]) => void;
  onInsertIntermediatesBetween: (
    sourceElementId: string,
    targetElementId: string,
    options: SandboxInsertIntermediatesOptions
  ) => void;
}) {
  return (
    <>
      <SandboxInsertDialog
        kind="intermediates"
        isOpen={insertBetweenDialogOpen}
        model={model}
        maxNodes={ui.maxNodes}
        sourceElementId={insertBetweenEndpoints?.[0] ?? ''}
        targetElementId={insertBetweenEndpoints?.[1] ?? ''}
        contextLabel="Between"
        existingElementIds={nodesElementIds}
        allRelationshipTypes={allRelationshipTypes}
        initialEnabledRelationshipTypes={addRelated.enabledTypes}
        initialOptions={{ mode: insertMode, k: insertK, maxHops: insertMaxHops, direction: insertDirection }}
        onCancel={closeInsertBetweenDialog}
        onConfirm={({ enabledRelationshipTypes, options, selectedElementIds }) => {
          closeInsertBetweenDialog();
          setInsertMode(options.mode);
          setInsertK(options.k);
          setInsertMaxHops(options.maxHops);
          setInsertDirection(options.direction);

          // Keep traversal settings consistent with the insert preview.
          onSetAddRelatedEnabledTypes(enabledRelationshipTypes);

          const src = insertBetweenEndpoints?.[0];
          const dst = insertBetweenEndpoints?.[1];
          if (!src || !dst) return;
          onInsertIntermediatesBetween(src, dst, { ...options, allowedElementIds: selectedElementIds });
        }}
      />

      <SandboxInsertDialog
        kind="intermediates"
        isOpen={insertFromEdgeDialogOpen}
        model={model}
        maxNodes={ui.maxNodes}
        sourceElementId={insertFromEdgeEndpoints?.[0] ?? ''}
        targetElementId={insertFromEdgeEndpoints?.[1] ?? ''}
        contextLabel="From relationship"
        contextRelationshipType={selectedEdgeType}
        existingElementIds={nodesElementIds}
        allRelationshipTypes={allRelationshipTypes}
        initialEnabledRelationshipTypes={addRelated.enabledTypes}
        initialOptions={{ mode: insertMode, k: insertK, maxHops: insertMaxHops, direction: insertDirection }}
        onCancel={closeInsertFromEdgeDialog}
        onConfirm={({ enabledRelationshipTypes, options, selectedElementIds }) => {
          closeInsertFromEdgeDialog();
          setInsertMode(options.mode);
          setInsertK(options.k);
          setInsertMaxHops(options.maxHops);
          setInsertDirection(options.direction);

          // Keep traversal settings consistent with the insert preview.
          onSetAddRelatedEnabledTypes(enabledRelationshipTypes);

          const src = insertFromEdgeEndpoints?.[0];
          const dst = insertFromEdgeEndpoints?.[1];
          if (!src || !dst) return;
          onInsertIntermediatesBetween(src, dst, { ...options, allowedElementIds: selectedElementIds });
        }}
      />

      <SandboxInsertDialog
        kind="related"
        isOpen={addRelatedDialogOpen}
        model={model}
        maxNodes={ui.maxNodes}
        anchorElementIds={addRelatedDialogAnchors}
        existingElementIds={nodesElementIds}
        allRelationshipTypes={allRelationshipTypes}
        initialEnabledRelationshipTypes={addRelated.enabledTypes}
        initialOptions={{ depth: addRelated.depth, direction: addRelated.direction }}
        onCancel={closeAddRelatedDialog}
        onConfirm={({ enabledRelationshipTypes, options, selectedElementIds }) => {
          closeAddRelatedDialog();
          // Persist settings for the next time.
          onSetAddRelatedDepth(options.depth);
          onSetAddRelatedDirection(options.direction);
          onSetAddRelatedEnabledTypes(enabledRelationshipTypes);
          if (addRelatedDialogAnchors.length === 0) return;
          onAddRelatedFromSelection(addRelatedDialogAnchors, selectedElementIds);
        }}
      />

      <SaveSandboxAsDiagramDialog
        isOpen={saveDialogOpen}
        initialName="Sandbox diagram"
        onCancel={() => setSaveDialogOpen(false)}
        onConfirm={(name) => {
          setSaveDialogOpen(false);
          onSaveAsDiagram(name, getVisibleRelationshipIds());
        }}
      />

      <OverlaySettingsDialog
        isOpen={isOverlayOpen}
        onClose={() => setIsOverlayOpen(false)}
        graphOptions={graphOptions}
        onChangeGraphOptions={(next) => setGraphOptions(next)}
        availablePropertyKeys={availablePropertyKeys}
      />
    </>
  );
}
