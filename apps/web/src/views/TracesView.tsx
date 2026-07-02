import { ChevronLeft, ChevronRight, Eye, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { StatePanel } from '../components/StatePanel.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { useResource } from '../hooks/useResource.js';
import { useLocale } from '../locales/index.js';
import type { TraceDetail } from '../types.js';

interface TracesViewProps {
  tenantId: string;
}

export function TracesView({ tenantId }: TracesViewProps) {
  const { t, locale } = useLocale();
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
        <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('trace.search.placeholder')} /></label>
        <select aria-label={t('trace.filter.mode')} value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="">{t('trace.filter.mode.all')}</option><option value="shadow">{t('settings.mode.shadow')}</option><option value="assist">{t('settings.mode.assist')}</option><option value="auto">{t('settings.mode.auto')}</option>
        </select>
        <select aria-label={t('trace.filter.state')} value={state} onChange={(event) => setState(event.target.value)}>
          <option value="">{t('trace.filter.state.all')}</option>
          {[...new Set((traces.data?.items ?? []).map((trace) => trace.execution_state))].map((value) => <option key={value}>{value}</option>)}
        </select>
      </section>
      <section className="panel table-panel">
        {traces.loading && !traces.data ? <StatePanel kind="loading" title={t('trace.loading')} /> : null}
        {traces.error && !traces.data ? <StatePanel kind="error" title={t('trace.unavailable')} detail={traces.error} onRetry={traces.reload} /> : null}
        {traces.data && filtered.length === 0 ? <StatePanel kind="empty" title={t('trace.empty')} /> : null}
        {filtered.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>{t('trace.table.conversation')}</th><th>{t('trace.table.mode')}</th><th>{t('trace.table.state')}</th><th>{t('trace.table.intent')}</th><th>{t('trace.table.latency')}</th><th>{t('trace.table.cost')}</th><th>{t('trace.table.created')}</th><th>{t('trace.table.action')}</th></tr></thead>
              <tbody>{filtered.map((trace) => (
                <tr key={trace.trace_id} onClick={() => setSelectedId(trace.trace_id)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && setSelectedId(trace.trace_id)}>
                  <td><strong>{trace.conversation_id}</strong><small>{trace.trace_id.slice(0, 8)}</small></td>
                  <td><StatusBadge value={trace.runtime_mode} /></td>
                  <td><StatusBadge value={trace.execution_state} /></td>
                  <td>{trace.intent ?? t('common.unclassified')}</td>
                  <td>{trace.latency_ms === null ? '—' : `${trace.latency_ms} ms`}</td>
                  <td>${trace.estimated_cost.toFixed(4)}</td>
                  <td>{formatTime(trace.created_at, locale)}</td>
                  <td>
                    <button
                      className="button button-secondary button-sm"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(trace.trace_id);
                      }}
                    >
                      <Eye size={14} /> {t('trace.button.view')}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
        <footer className="pagination">
          <span>{t('trace.count', { count: traces.data?.total ?? 0 })}</span>
          <div>
            <button className="icon-button" type="button" title={t('trace.page.previous')} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}><ChevronLeft size={17} /></button>
            <button className="icon-button" type="button" title={t('trace.page.next')} disabled={offset + 50 >= (traces.data?.total ?? 0)} onClick={() => setOffset(offset + 50)}><ChevronRight size={17} /></button>
          </div>
        </footer>
      </section>
      {selectedId ? (
        <aside className="detail-drawer" aria-label={t('trace.detail.aria')}>
          <header><div><span className="eyebrow">{t('trace.detail.eyebrow')}</span><h2>{selectedId.slice(0, 12)}</h2></div><button className="icon-button" type="button" title={t('common.close')} onClick={() => setSelectedId(null)}><X size={18} /></button></header>
          {detail.loading ? <StatePanel kind="loading" title={t('trace.detail.loading')} /> : null}
          {detail.error ? <StatePanel kind="error" title={t('trace.detail.unavailable')} detail={detail.error} onRetry={detail.reload} /> : null}
          {detail.data ? <TraceBody trace={detail.data} /> : null}
        </aside>
      ) : null}
    </div>
  );
}

function TraceBody({ trace }: { trace: TraceDetail }) {
  const { t, locale } = useLocale();
  return (
    <div className="detail-content">
      <dl className="key-values">
        <div><dt>{t('trace.detail.execution')}</dt><dd><StatusBadge value={trace.execution_state} /></dd></div>
        <div><dt>{t('trace.detail.finalaction')}</dt><dd>{trace.final_action ?? t('common.pending')}</dd></div>
        <div><dt>{t('trace.detail.risk')}</dt><dd>{trace.risk_level ?? t('common.none')} / {trace.risk_decision ?? t('common.none')}</dd></div>
        <div><dt>{t('trace.detail.pii')}</dt><dd>{trace.pii_categories.join(', ') || t('common.none')}</dd></div>
      </dl>
      <section><h3>{t('trace.detail.evidence')}</h3><div className="token-list">{trace.retrieved_doc_ids.length ? trace.retrieved_doc_ids.map((id) => <code key={id}>{id}</code>) : <span>{t('common.none')}</span>}</div></section>
      <section><h3>{t('trace.detail.snapshot')}</h3><dl className="snapshot-list">{Object.entries(trace.version_snapshot).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd><code>{value}</code></dd></div>)}</dl></section>
      {trace.llm_calls.length > 0 ? (
        <section>
          <h3>{t('trace.detail.llmcalls')}</h3>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>{t('trace.detail.llm.model')}</th><th>{t('trace.detail.llm.status')}</th><th>{t('trace.detail.llm.tokens')}</th><th>{t('trace.detail.llm.latency')}</th><th>{t('trace.detail.llm.cost')}</th></tr></thead>
              <tbody>{trace.llm_calls.map((call, index) => (
                <tr key={String(call.id ?? index)}>
                  <td><strong>{String(call.model_name ?? t('common.unknown'))}</strong><small>{String(call.model_provider ?? '')}</small></td>
                  <td><StatusBadge value={String(call.call_status ?? t('common.unknown'))} /></td>
                  <td>{formatTokenCount(call.input_tokens, call.output_tokens, locale)}</td>
                  <td>{call.latency_ms != null ? `${call.latency_ms} ms` : '—'}</td>
                  <td>${typeof call.estimated_cost === 'number' ? call.estimated_cost.toFixed(4) : '0.0000'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}
      {trace.runtime_decision ? (
        <section>
          <h3>{t('trace.detail.decision')}</h3>
          <dl className="key-values">
            <div><dt>{t('trace.detail.decision.requested')}</dt><dd><StatusBadge value={String(trace.runtime_decision.requested_mode ?? t('common.unknown'))} /></dd></div>
            <div><dt>{t('trace.detail.decision.effective')}</dt><dd><StatusBadge value={String(trace.runtime_decision.effective_mode ?? t('common.unknown'))} /></dd></div>
            <div><dt>{t('trace.detail.decision.action')}</dt><dd>{String(trace.runtime_decision.action ?? t('common.none'))}</dd></div>
            <div><dt>{t('trace.detail.decision.blocking')}</dt><dd>{trace.runtime_decision.blocking ? t('common.yes') : t('common.no')}</dd></div>
          </dl>
          {Array.isArray(trace.runtime_decision.reason_codes) && trace.runtime_decision.reason_codes.length > 0 ? (
            <div className="token-list" style={{ marginTop: 8 }}>
              {(trace.runtime_decision.reason_codes as string[]).map((code) => <code key={code}>{code}</code>)}
            </div>
          ) : null}
        </section>
      ) : null}
      <section><h3>{t('trace.detail.transitions')}</h3><div className="timeline">{trace.transitions.map((item, index) => <div key={String(item.transition_id ?? index)}><span /><p>{String(item.from_state ?? t('common.start'))} → {String(item.to_state ?? t('common.unknown'))}</p></div>)}</div></section>
    </div>
  );
}

function formatTokenCount(input: unknown, output: unknown, locale: string): string {
  const inTokens = typeof input === 'number' ? input : 0;
  const outTokens = typeof output === 'number' ? output : 0;
  if (inTokens === 0 && outTokens === 0) return '—';
  return `${inTokens.toLocaleString(locale)} → ${outTokens.toLocaleString(locale)}`;
}

function formatTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}