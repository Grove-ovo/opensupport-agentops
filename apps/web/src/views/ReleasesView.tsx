import { Archive, Play, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { StatePanel } from '../components/StatePanel.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { useResource } from '../hooks/useResource.js';
import { useLocale } from '../locales/index.js';
import type { ReleaseCandidate, ReleaseDetail } from '../types.js';

interface ReleasesViewProps {
  tenantId: string;
}

export function ReleasesView({ tenantId }: ReleasesViewProps) {
  const { t } = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<'start_evaluation' | 'archive' | null>(null);
  const [busy, setBusy] = useState(false);
  const releases = useResource(`releases:${tenantId}`, () => api.releases(tenantId));
  const detail = useResource(
    `release:${tenantId}:${selectedId ?? 'none'}`,
    () => selectedId ? api.release(tenantId, selectedId) : Promise.resolve(null as unknown as ReleaseDetail),
  );
  const transition = async () => {
    if (!selectedId || !action) return;
    setBusy(true);
    try {
      await api.releaseTransition(tenantId, selectedId, {
        action,
        idempotency_key: crypto.randomUUID(),
        confirm: true,
      });
      setAction(null);
      releases.reload();
      detail.reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="release-layout">
      <section className="panel table-panel">
        {releases.loading && !releases.data ? <StatePanel kind="loading" title={t('release.loading')} /> : null}
        {releases.error && !releases.data ? <StatePanel kind="error" title={t('release.unavailable')} detail={releases.error} onRetry={releases.reload} /> : null}
        {releases.data?.items.length === 0 ? <StatePanel kind="empty" title={t('release.empty')} /> : null}
        {releases.data?.items.length ? <ReleaseTable items={releases.data.items} onSelect={setSelectedId} /> : null}
      </section>
      {selectedId ? (
        <aside className="release-detail">
          <header><div><span className="eyebrow">{t('release.candidate')}</span><h2>{selectedId.slice(0, 12)}</h2></div><button className="icon-button" title={t('common.close')} type="button" onClick={() => setSelectedId(null)}><X size={18} /></button></header>
          {detail.loading ? <StatePanel kind="loading" title={t('release.gateloading')} /> : null}
          {detail.error ? <StatePanel kind="error" title={t('release.unavailable.candidate')} detail={detail.error} onRetry={detail.reload} /> : null}
          {detail.data ? (
            <div className="detail-content">
              <dl className="key-values"><div><dt>{t('release.state')}</dt><dd><StatusBadge value={detail.data.state} /></dd></div><div><dt>{t('release.snapshot')}</dt><dd><code>{detail.data.snapshot_hash.slice(0, 16)}</code></dd></div></dl>
              <section>
                <h3>{t('release.gatedecisions')}</h3>
                <div className="gate-list">
                  {detail.data.gate_decisions.length ? detail.data.gate_decisions.map((gate, index) => (
                    <div key={String(gate.gate_name ?? index)}>
                      <div className="gate-info">
                        <span className="gate-name">{String(gate.gate_name ?? 'gate')}</span>
                        {gate.actual_value != null && gate.threshold_value != null ? (
                          <span className="gate-metrics">
                            <code>{formatGateValue(gate.actual_value)}</code>
                            <span className="gate-operator">{String(gate.threshold_operator ?? '>=')}</span>
                            <code>{formatGateValue(gate.threshold_value)}</code>
                          </span>
                        ) : null}
                        {gate.reason_code ? <span className="muted gate-reason">{String(gate.reason_code)}</span> : null}
                      </div>
                      <div className="gate-status">
                        <StatusBadge value={String(gate.decision ?? 'unknown')} />
                        {gate.blocking ? <span className="gate-blocking">{t('release.blocking')}</span> : null}
                      </div>
                    </div>
                  )) : <span className="muted">{t('release.evalnotdone')}</span>}
                </div>
              </section>
              {detail.data.gate_result ? (
                <section>
                  <h3>{t('release.overall')}</h3>
                  <dl className="key-values">
                    <div><dt>{t('release.promotion')}</dt><dd><StatusBadge value={String(detail.data.gate_result.promotion_state ?? 'unknown')} /></dd></div>
                    <div><dt>{t('release.snapshot')}</dt><dd><code>{String(detail.data.gate_result.candidate_snapshot_hash ?? '').slice(0, 16)}</code></dd></div>
                  </dl>
                </section>
              ) : null}
              <div className="action-row">
                {detail.data.state === 'draft' ? <button className="button button-primary" type="button" onClick={() => setAction('start_evaluation')}><Play size={16} />{t('release.start')}</button> : null}
                {['failed', 'shadow', 'assist', 'auto'].includes(detail.data.state) ? <button className="button button-secondary" type="button" onClick={() => setAction('archive')}><Archive size={16} />{t('release.archive')}</button> : null}
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}
      <ConfirmDialog open={action !== null} title={action === 'archive' ? t('release.confirm.archive.title') : t('release.confirm.eval.title')} detail={action === 'archive' ? t('release.confirm.archive.detail') : t('release.confirm.eval.detail')} confirmLabel={action === 'archive' ? t('release.confirm.archive') : t('release.confirm.eval')} danger={action === 'archive'} busy={busy} onCancel={() => setAction(null)} onConfirm={transition} />
    </div>
  );
}

function ReleaseTable({ items, onSelect }: { items: ReleaseCandidate[]; onSelect(id: string): void }) {
  const { t, locale } = useLocale();
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t('release.table.candidate')}</th><th>{t('release.table.state')}</th><th>{t('release.table.agent')}</th><th>{t('release.table.prompt')}</th><th>{t('release.table.updated')}</th></tr></thead><tbody>{items.map((item) => <tr key={item.candidate_id} onClick={() => onSelect(item.candidate_id)}><td><strong>{item.candidate_id.slice(0, 12)}</strong><small>{item.snapshot_hash.slice(0, 12)}</small></td><td><StatusBadge value={item.state} /></td><td>{item.agent_version_id}</td><td>{item.prompt_version_id}</td><td>{new Date(item.updated_at).toLocaleDateString(locale === 'zh' ? 'zh-CN' : undefined)}</td></tr>)}</tbody></table></div>;
}

function formatGateValue(value: unknown): string {
  if (typeof value === 'number') return value >= 1 ? `${value}%` : `${(value * 100).toFixed(1)}%`;
  return String(value ?? '—');
}