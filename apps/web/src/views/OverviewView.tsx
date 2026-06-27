import { AlertCircle, Clock3, Coins, MessageSquare, RefreshCw, Workflow } from 'lucide-react';
import { api } from '../api.js';
import { StatePanel } from '../components/StatePanel.js';
import { useResource } from '../hooks/useResource.js';

interface OverviewViewProps {
  tenantId: string;
}

export function OverviewView({ tenantId }: OverviewViewProps) {
  const resource = useResource(`overview:${tenantId}`, () => api.overview(tenantId), { refreshInterval: 30_000 });
  if (resource.loading && !resource.data) return <StatePanel kind="loading" title="Loading operational metrics" />;
  if (resource.error && !resource.data) {
    return <StatePanel kind="error" title="Overview unavailable" detail={resource.error} onRetry={resource.reload} />;
  }
  const data = resource.data;
  if (!data) return <StatePanel kind="empty" title="No operational data" />;
  const metrics = [
    { label: 'Conversations', value: data.active_conversations.toLocaleString(), icon: MessageSquare },
    { label: 'Auto rate', value: `${data.auto_rate.toFixed(1)}%`, icon: Workflow },
    { label: 'Approval backlog', value: data.approval_backlog.toLocaleString(), icon: AlertCircle },
    { label: 'P95 latency', value: `${Math.round(data.p95_latency_ms)} ms`, icon: Clock3 },
    { label: 'Daily cost', value: `$${data.daily_cost.toFixed(3)}`, icon: Coins },
  ];
  const maxWorkload = Math.max(1, ...data.workload.map((point) => point.traces));
  return (
    <div className="view-stack">
      {resource.stale ? <div className="stale-banner">Showing cached data. Refresh failed.</div> : null}
      <section className="metric-grid" aria-label="Daily operational metrics">
        {metrics.map(({ label, value, icon: Icon }) => (
          <article className="metric" key={label}>
            <div className="metric-label"><Icon size={16} />{label}</div>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <section className="panel">
        <header className="panel-header">
          <div><span className="eyebrow">Last 24 hours</span><h2>Workload</h2></div>
          <button className="icon-button" type="button" onClick={resource.reload} title="Refresh"><RefreshCw size={17} /></button>
        </header>
        {data.workload.length === 0 ? (
          <StatePanel kind="empty" title="No traces in this window" />
        ) : (
          <div className="workload-chart" role="img" aria-label="Hourly trace workload">
            {data.workload.map((point) => (
              <div className="workload-column" key={point.bucket} title={`${point.traces} traces`}>
                <div
                  className={`workload-bar workload-height-${Math.max(
                    1,
                    Math.ceil((point.traces / maxWorkload) * 10),
                  )}`}
                />
                <span>{new Date(point.bucket).getHours().toString().padStart(2, '0')}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="failure-strip">
        <div><span>Failures</span><strong>{data.failure_count}</strong></div>
        <p>Execution failures recorded during the current daily window.</p>
      </section>
    </div>
  );
}
