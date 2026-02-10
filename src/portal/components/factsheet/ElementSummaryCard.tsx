import { Card } from './FactSheetPrimitives';

export function ElementSummaryCard(props: { documentation?: string | null }) {
  const doc = (props.documentation ?? '').trim();
  return (
    <Card title="Summary">
      {doc ? <div style={{ whiteSpace: 'pre-wrap' }}>{doc}</div> : <div style={{ opacity: 0.7 }}>(No description)</div>}
    </Card>
  );
}
