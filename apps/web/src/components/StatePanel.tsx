import { AlertTriangle, Inbox, LoaderCircle, RefreshCw } from 'lucide-react';

interface StatePanelProps {
  kind: 'loading' | 'empty' | 'error';
  title: string;
  detail?: string;
  onRetry?: () => void;
}

export function StatePanel({ kind, title, detail, onRetry }: StatePanelProps) {
  const Icon =
    kind === 'loading' ? LoaderCircle : kind === 'empty' ? Inbox : AlertTriangle;
  return (
    <div className={`state-panel state-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={22} className={kind === 'loading' ? 'spin' : ''} />
      <div>
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
      </div>
      {onRetry ? (
        <button className="icon-button" type="button" onClick={onRetry} title="Retry">
          <RefreshCw size={17} />
        </button>
      ) : null}
    </div>
  );
}
