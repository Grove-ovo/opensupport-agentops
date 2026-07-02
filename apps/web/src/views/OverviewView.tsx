import { AlertCircle, Clock3, Coins, MessageSquare, RefreshCw, Workflow } from 'lucide-react';
import { api } from '../api.js';
import { StatePanel } from '../components/StatePanel.js';
import { useResource } from '../hooks/useResource.js';
import { useLocale } from '../locales/index.js';

interface OverviewViewProps {
  tenantId: string;
}

export function OverviewView({ tenantId }: OverviewViewProps) {
  const { t, locale } = useLocale();
  const resource = useResource(`overview:${tenantId}`, () => api.overview(tenantId), { refreshInterval: 30_000 });
  if (resource.loading && !resource.data) return <StatePanel kind="loading" title={t('overview.loading')} />;
  if (resource.error && !resource.data) {
    return <StatePanel kind="error" title={t('overview.unavailable')} detail={resource.error} onRetry={resource.reload} />;
  }
  const data = resource.data;
  if (!data) return <StatePanel kind="empty" title={t('overview.empty')} />;
  const metrics = [
    { label: t('overview.metric.conversations'), value: data.active_conversations.toLocaleString(locale), icon: MessageSquare },
    { label: t('overview.metric.autorate'), value: `${data.auto_rate.toFixed(1)}%`, icon: Workflow },
    { label: t('overview.metric.backlog'), value: data.approval_backlog.toLocaleString(locale), icon: AlertCircle },
    { label: t('overview.metric.p95'), value: `${Math.round(data.p95_latency_ms)} ms`, icon: Clock3 },
    { label: t('overview.metric.dailycost'), value: `$${data.daily_cost.toFixed(3)}`, icon: Coins },
  ];
  const maxWorkload = Math.max(1, ...data.workload.map((point) => point.traces));
  return (
    <div className="view-stack">
      {resource.stale ? <div className="stale-banner">{t('overview.stale')}</div> : null}
      <section className="metric-grid" aria-label={t('overview.workload.aria')}>
        {metrics.map(({ label, value, icon: Icon }) => (
          <article className="metric" key={label}>
            <div className="metric-label"><Icon size={16} />{label}</div>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <section className="panel">
        <header className="panel-header">
          <div><span className="eyebrow">{t('overview.last24h')}</span><h2>{t('overview.workload')}</h2></div>
          <button className="icon-button" type="button" onClick={resource.reload} title={t('overview.refresh')}><RefreshCw size={17} /></button>
        </header>
        {data.workload.length === 0 ? (
          <StatePanel kind="empty" title={t('overview.no_traces')} />
        ) : (
          <div className="workload-chart" role="img" aria-label={t('overview.workload.aria')}>
            {data.workload.map((point) => (
              <div className="workload-column" key={point.bucket} title={t('overview.workload.tooltip', { count: point.traces })}>
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
        <div><span>{t('overview.failures')}</span><strong>{data.failure_count}</strong></div>
        <p>{t('overview.failures.detail')}</p>
      </section>
    </div>
  );
}