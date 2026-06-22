import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { StatePanel } from '../components/StatePanel.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { useResource } from '../hooks/useResource.js';
import type { TraceDetail } from '../types.js';

interface TracesViewProps {
  tenantId: string;
}

export function TracesView({ tenantId }: TracesViewProps) {
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('');
  const [state, setState] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const traces = useResource(`traces:${tenantId}:${offset}`, () => api.traces(tenantId, 50, offset));
  const detail = useResource(
    `trace:${tenantId}:${selectedId ?? 'none'}`,
    () => selectedId ? api.trace(tenantId, selectedId) : Promise.resolve(null as unknown as TraceDetail),
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (traces.data?.items ?? []).filter((trace) =>
      (!mode || trace.runtime_mode === mode) &&
      (!state || trace.execution_state === state) &&
      (!needle || [trace.trace_id, trace.conversation_id, trace.intent, trace.route]
        .some((value) => value?.toLowerCase().includes(needle))));
  }, [mode, query, state, traces.data]);

  return (
    <div className="view-stack">
      <section className="filter-bar">
        <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Trace, conversation, intent" /></label>
        <select aria-label="Runtime mode" value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="">All modes</option><option value="shadow">Shadow</option><option value="assist">Assist</option><option value="auto">Auto</option>
        </select>
        <select aria-label="Execution state" value={state} onChange={(event) => setState(event.target.value)}>
          <option value="">All states</option>
          {[...new Set((traces.data?.items ?? []).map((trace) => trace.execution_state))].map((value) => <option key={value}>{value}</option>)}
        </select>
      </section>
      <section className="panel table-panel">
        {traces.loading && !traces.data ? <StatePanel kind="loading" title="Loading traces" /> : null}
        {traces.error && !traces.data ? <StatePanel kind="error" title="Traces unavailable" detail={traces.error} onRetry={traces.reload} /> : null}
        {traces.data && filtered.length === 0 ? <StatePanel kind="empty" title="No matching traces" /> : null}
        {filtered.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Conversation</th><th>Mode</th><th>State</th><th>Intent</th><th>Latency</th><th>Cost</th><th>Created</th></tr></thead>
              <tbody>{filtered.map((trace) => (
                <tr key={trace.trace_id} onClick={() => setSelectedId(trace.trace_id)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && setSelectedId(trace.trace_id)}>
                  <td><strong>{trace.conversation_id}</strong><small>{trace.trace_id.slice(0, 8)}</small></td>
                  <td><StatusBadge value={trace.runtime_mode} /></td>
                  <td><StatusBadge value={trace.execution_state} /></td>
                  <td>{trace.intent ?? 'Unclassified'}</td>
                  <td>{trace.latency_ms === null ? '—' : `${trace.latency_ms} ms`}</td>
                  <td>${trace.estimated_cost.toFixed(4)}</td>
                  <td>{formatTime(trace.created_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
        <footer className="pagination">
          <span>{traces.data?.total ?? 0} traces</span>
          <div>
            <button className="icon-button" type="button" title="Previous" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}><ChevronLeft size={17} /></button>
            <button className="icon-button" type="button" title="Next" disabled={offset + 50 >= (traces.data?.total ?? 0)} onClick={() => setOffset(offset + 50)}><ChevronRight size={17} /></button>
          </div>
        </footer>
      </section>
      {selectedId ? (
        <aside className="detail-drawer" aria-label="Trace details">
          <header><div><span className="eyebrow">Trace detail</span><h2>{selectedId.slice(0, 12)}</h2></div><button className="icon-button" type="button" title="Close" onClick={() => setSelectedId(null)}><X size={18} /></button></header>
          {detail.loading ? <StatePanel kind="loading" title="Loading trace" /> : null}
          {detail.error ? <StatePanel kind="error" title="Trace unavailable" detail={detail.error} onRetry={detail.reload} /> : null}
          {detail.data ? <TraceBody trace={detail.data} /> : null}
        </aside>
      ) : null}
    </div>
  );
}

function TraceBody({ trace }: { trace: TraceDetail }) {
  return (
    <div className="detail-content">
      <dl className="key-values">
        <div><dt>Execution</dt><dd><StatusBadge value={trace.execution_state} /></dd></div>
        <div><dt>Final action</dt><dd>{trace.final_action ?? 'Pending'}</dd></div>
        <div><dt>Risk</dt><dd>{trace.risk_level ?? 'None'} / {trace.risk_decision ?? 'None'}</dd></div>
        <div><dt>PII categories</dt><dd>{trace.pii_categories.join(', ') || 'None'}</dd></div>
      </dl>
      <section><h3>Evidence</h3><div className="token-list">{trace.retrieved_doc_ids.length ? trace.retrieved_doc_ids.map((id) => <code key={id}>{id}</code>) : <span>None</span>}</div></section>
      <section><h3>Version snapshot</h3><dl className="snapshot-list">{Object.entries(trace.version_snapshot).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd><code>{value}</code></dd></div>)}</dl></section>
      <section><h3>Transitions</h3><div className="timeline">{trace.transitions.map((item, index) => <div key={String(item.transition_id ?? index)}><span /><p>{String(item.from_state ?? 'start')} → {String(item.to_state ?? 'unknown')}</p></div>)}</div></section>
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
