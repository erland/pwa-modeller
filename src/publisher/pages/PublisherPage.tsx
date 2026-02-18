import { usePublisherPageState } from './publisher/usePublisherPageState';
import { PublisherLayout } from './publisher/PublisherLayout';

export default function PublisherPage() {
  const s = usePublisherPageState();
  return <PublisherLayout {...s} />;
}
