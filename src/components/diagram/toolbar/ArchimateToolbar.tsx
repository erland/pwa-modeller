type Props = {
  hasActiveView: boolean;
  onAddAndJunction: () => void;
  onAddOrJunction: () => void;
};

export function ArchimateToolbar({ hasActiveView, onAddAndJunction, onAddOrJunction }: Props) {
  return (
    <>
      <button className="shellButton" type="button" disabled={!hasActiveView} onClick={onAddAndJunction} title="Place an AND Junction">
        +AND
      </button>
      <button className="shellButton" type="button" disabled={!hasActiveView} onClick={onAddOrJunction} title="Place an OR Junction">
        +OR
      </button>
    </>
  );
}
