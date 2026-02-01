export type Candidate = {
  id: string;
  name: string;
  type: string;
  alreadyInSandbox: boolean;
};

export type PreviewPath = {
  path: string[];
  intermediates: string[];
};

export type RelatedGroup = {
  depth: number;
  elementIds: string[];
};

export type PreviewIntermediates = {
  kind: 'intermediates';
  paths: PreviewPath[];
  candidates: Candidate[];
};

export type PreviewRelated = {
  kind: 'related';
  groups: RelatedGroup[];
  candidates: Candidate[];
};

export type PreviewState = PreviewIntermediates | PreviewRelated;
