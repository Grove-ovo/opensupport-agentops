import { Archive, Play, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { StatePanel } from '../components/StatePanel.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { useResource } from '../hooks/useResource.js';
import type { ReleaseCandidate, ReleaseDetail } from '../types.js';

interface ReleasesViewProps {
  tenantId: string;
}

export function ReleasesView({ tenantId }: ReleasesViewProps) {
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
        {releases.loading && !releases.data ? <StatePanel kind="loading" title="Loading release candidates" /> : null}
        {releases.error && !releases.data ? <StatePanel kind="error" title="Releases unavailable" detail={releases.error} onRetry={releases.reload} /> : null}
        {releases.data?.items.length === 0 ? <StatePanel kind="empty" title="No release candidates" /> : null}
        {releases.data?.items.length ? <ReleaseTable items={releases.data.items} onSelect={setSelectedId} /> : null}
      </section>
      {selectedId ? (
        <aside className="release-detail">
          <header><div><span className="eyebrow">Candidate</span><h2>{selectedId.slice(0, 12)}</h2></div><button className="icon-button" title="Close" type="button" onClick={() => setSelectedId(null)}><X size={18} /></button></header>
          {detail.loading ? <StatePanel kind="loading" title="Loading gate results" /> : null}
          {detail.error ? <StatePanel kind="error" title="Candidate unavailable" detail={detail.error} onRetry={detail.reload} /> : null}
          {detail.data ? (
            <div className="detail-content">
              <dl className="key-values"><div><dt>State</dt><dd><StatusBadge value={detail.data.state} /></dd></div><div><dt>Snapshot</dt><dd><code>{detail.data.snapshot_hash.slice(0, 16)}</code></dd></div></dl>
              <section><h3>Gate decisions</h3><div className="gate-list">{detail.data.gate_decisions.length ? detail.data.gate_decisions.map((gate, index) => <div key={String(gate.gate_name ?? index)}><span>{String(gate.gate_name ?? 'gate')}</span><StatusBadge value={String(gate.decision ?? 'unknown')} /></div>) : <span className="muted">Evaluation not completed</span>}</div></section>
              <div className="action-row">
                {detail.data.state === 'draft' ? <button className="button button-primary" type="button" onClick={() => setAction('start_evaluation')}><Play size={16} />Start evaluation</button> : null}
                {['failed', 'shadow', 'assist', 'auto'].includes(detail.data.state) ? <button className="button button-secondary" type="button" onClick={() => setAction('archive')}><Archive size={16} />Archive</button> : null}
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}
      <ConfirmDialog open={action !== null} title={action === 'archive' ? 'Archive candidate' : 'Start evaluation'} detail={action === 'archive' ? 'The candidate will no longer be available for promotion.' : 'Evaluation runs against the immutable release snapshot. Promotion remains controlled by release gates.'} confirmLabel={action === 'archive' ? 'Archive' : 'Start evaluation'} danger={action === 'archive'} busy={busy} onCancel={() => setAction(null)} onConfirm={transition} />
    </div>
  );
}

function ReleaseTable({ items, onSelect }: { items: ReleaseCandidate[]; onSelect(id: string): void }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Candidate</th><th>State</th><th>Agent</th><th>Prompt</th><th>Updated</th></tr></thead><tbody>{items.map((item) => <tr key={item.candidate_id} onClick={() => onSelect(item.candidate_id)}><td><strong>{item.candidate_id.slice(0, 12)}</strong><small>{item.snapshot_hash.slice(0, 12)}</small></td><td><StatusBadge value={item.state} /></td><td>{item.agent_version_id}</td><td>{item.prompt_version_id}</td><td>{new Date(item.updated_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>;
}
