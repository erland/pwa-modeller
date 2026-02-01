import type { AnalysisDirection, ElementType, RelationshipType } from '../../../domain';

import type { AnalysisMode } from '../AnalysisQueryPanel';
import type { PathsBetweenQueryMode } from '../../../store';

import { DepthFilterControls } from './filters/DepthFilterControls';
import { DirectionFilterControl } from './filters/DirectionFilterControl';
import { ElementTypesFilter } from './filters/ElementTypesFilter';
import { FilterPresets } from './filters/FilterPresets';
import { LayersFilter } from './filters/LayersFilter';
import { PathsFilterControls } from './filters/PathsFilterControls';
import { RelationshipTypesFilter } from './filters/RelationshipTypesFilter';

type Props = {
  mode: AnalysisMode;

  direction: AnalysisDirection;
  onChangeDirection: (dir: AnalysisDirection) => void;

  // Related-only
  maxDepth: number;
  onChangeMaxDepth: (n: number) => void;
  includeStart: boolean;
  onChangeIncludeStart: (v: boolean) => void;

  // Paths-only
  pathsMode: PathsBetweenQueryMode;
  onChangePathsMode: (v: PathsBetweenQueryMode) => void;
  maxPaths: number;
  onChangeMaxPaths: (n: number) => void;
  maxPathLength: number | null;
  onChangeMaxPathLength: (n: number | null) => void;

  // Relationship types
  availableRelationshipTypes: RelationshipType[];
  relationshipTypesSorted: RelationshipType[];
  onChangeRelationshipTypes: (types: RelationshipType[]) => void;

  // Layers
  hasLayerFacet: boolean;
  availableLayers: string[];
  layersSorted: string[];
  onChangeLayers: (layers: string[]) => void;

  // Element types
  hasElementTypeFacet: boolean;
  allowedElementTypes: ElementType[];
  elementTypesSorted: ElementType[];
  onChangeElementTypes: (types: ElementType[]) => void;

  onApplyPreset: (presetId: 'upstream' | 'downstream' | 'crossLayerTrace' | 'clear') => void;
  hasAnyFilters: boolean;
};

export function FiltersPanel({
  mode,
  direction,
  onChangeDirection,
  maxDepth,
  onChangeMaxDepth,
  includeStart,
  onChangeIncludeStart,
  pathsMode,
  onChangePathsMode,
  maxPaths,
  onChangeMaxPaths,
  maxPathLength,
  onChangeMaxPathLength,
  availableRelationshipTypes,
  relationshipTypesSorted,
  onChangeRelationshipTypes,
  hasLayerFacet,
  availableLayers,
  layersSorted,
  onChangeLayers,
  hasElementTypeFacet,
  allowedElementTypes,
  elementTypesSorted,
  onChangeElementTypes,
  onApplyPreset,
  hasAnyFilters
}: Props) {
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.9 }}>
        Filters & presets{hasAnyFilters ? ' (active)' : ''}
      </summary>

      <div className="toolbar" style={{ marginTop: 10 }} aria-label="Analysis filters">
        <DirectionFilterControl direction={direction} onChangeDirection={onChangeDirection} />

        {mode === 'paths' ? (
          <PathsFilterControls
            pathsMode={pathsMode}
            onChangePathsMode={onChangePathsMode}
            maxPaths={maxPaths}
            onChangeMaxPaths={onChangeMaxPaths}
            maxPathLength={maxPathLength}
            onChangeMaxPathLength={onChangeMaxPathLength}
          />
        ) : (
          <DepthFilterControls
            mode={mode}
            maxDepth={maxDepth}
            onChangeMaxDepth={onChangeMaxDepth}
            includeStart={includeStart}
            onChangeIncludeStart={onChangeIncludeStart}
          />
        )}

        <RelationshipTypesFilter
          availableRelationshipTypes={availableRelationshipTypes}
          relationshipTypesSorted={relationshipTypesSorted}
          onChangeRelationshipTypes={onChangeRelationshipTypes}
        />

        {hasLayerFacet && mode !== 'matrix' ? (
          <LayersFilter availableLayers={availableLayers} layersSorted={layersSorted} onChangeLayers={onChangeLayers} />
        ) : null}

        {mode === 'related' && hasElementTypeFacet && layersSorted.length > 0 ? (
          <ElementTypesFilter
            allowedElementTypes={allowedElementTypes}
            elementTypesSorted={elementTypesSorted}
            onChangeElementTypes={onChangeElementTypes}
          />
        ) : null}

        {mode !== 'matrix' ? <FilterPresets onApplyPreset={onApplyPreset} /> : null}
      </div>
    </details>
  );
}
