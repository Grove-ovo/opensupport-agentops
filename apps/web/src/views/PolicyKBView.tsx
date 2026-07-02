import { FileUp, FlaskConical, Rocket } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api.js';
import { StatePanel } from '../components/StatePanel.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { useResource } from '../hooks/useResource.js';
import { useLocale } from '../locales/index.js';
import type { PolicyDocument, RetrievalSmokeTestResult } from '../types.js';

interface PolicyKBViewProps {
  tenantId: string;
}

export function PolicyKBView({ tenantId }: PolicyKBViewProps) {
  const { t, locale } = useLocale();
  const versions = useResource(`policy-versions:${tenantId}`, () => api.policyVersions(tenantId));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const documents = useResource(
    `policy-documents:${tenantId}:${selectedId ?? 'none'}`,
    () => selectedId ? api.policyDocuments(tenantId, selectedId) : Promise.resolve([] as PolicyDocument[]),
  );

  const [name, setName] = useState('');
  const [sourceKey, setSourceKey] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [smokeQuery, setSmokeQuery] = useState('');
  const [smokeResults, setSmokeResults] = useState<RetrievalSmokeTestResult[] | null>(null);
  const [smokeMessage, setSmokeMessage] = useState<string | null>(null);
  const [smokeBusy, setSmokeBusy] = useState(false);

  if (versions.loading && !versions.data) return <div className="view-stack"><StatePanel kind="loading" title={t('kb.loading')} /></div>;
  if (versions.error && !versions.data) return <div className="view-stack"><StatePanel kind="error" title={t('kb.unavailable')} detail={versions.error} onRetry={versions.reload} /></div>;

  const versionList = versions.data ?? [];
  const selectedVersion = versionList.find((v) => v.id === selectedId) ?? null;

  const upload = async () => {
    setBusy(true); setUploadMessage(null);
    try {
      if (!name.trim() || !sourceKey.trim() || !title.trim() || !content.trim()) {
        throw new Error(t('kb.allfields'));
      }
      const created = await api.createPolicyVersion(tenantId, {
        name: name.trim(),
        documents: [{ source_key: sourceKey.trim(), title: title.trim(), content }],
      });
      setUploadMessage(t('kb.created', { version: created.version }));
      setName(''); setSourceKey(''); setTitle(''); setContent('');
      versions.reload();
      setSelectedId(created.id);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : t('kb.uploadfailed'));
    } finally {
      setBusy(false);
    }
  };

  const publish = async (versionId: string) => {
    setBusy(true); setUploadMessage(null);
    try {
      await api.publishPolicyVersion(tenantId, versionId);
      setUploadMessage(t('kb.published'));
      versions.reload();
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : t('kb.publishfailed'));
    } finally {
      setBusy(false);
    }
  };

  const runSmokeTest = async () => {
    setSmokeBusy(true); setSmokeMessage(null); setSmokeResults(null);
    try {
      if (!smokeQuery.trim()) throw new Error(t('kb.queryrequired'));
      const results = await api.runRetrievalSmokeTest(tenantId, { query: smokeQuery.trim() });
      setSmokeResults(results);
      if (results.length === 0) setSmokeMessage(t('kb.smoke.nomatch'));
    } catch (error) {
      setSmokeMessage(error instanceof Error ? error.message : t('kb.smokefailed'));
    } finally {
      setSmokeBusy(false);
    }
  };

  return (
    <div className="view-stack">
      <section className="panel">
        <header className="panel-header">
          <div><span className="eyebrow">{t('kb.versions')}</span><h2>{t('nav.knowledge')}</h2></div>
        </header>
        {versionList.length === 0 ? <StatePanel kind="empty" title={t('kb.empty')} detail={t('kb.empty.detail')} /> : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>{t('kb.table.version')}</th><th>{t('kb.table.name')}</th><th>{t('kb.table.status')}</th><th>{t('kb.table.documents')}</th><th>{t('kb.table.chunks')}</th><th>{t('kb.table.created')}</th><th></th></tr></thead>
              <tbody>{versionList.map((version) => (
                <tr key={version.id} className={version.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(version.id)} tabIndex={0}>
                  <td><strong>v{version.version}</strong></td>
                  <td>{version.name}</td>
                  <td><StatusBadge value={version.status} /></td>
                  <td>{version.document_count}</td>
                  <td>{version.chunk_count}</td>
                  <td>{formatTime(version.created_at, locale)}</td>
                  <td>{version.status === 'draft' ? <button className="button button-primary button-sm" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); publish(version.id); }}><Rocket size={14} /> {t('kb.publish')}</button> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel kb-upload">
        <header className="panel-header"><div><span className="eyebrow">{t('kb.upload')}</span><h2>{t('kb.newdoc')}</h2></div></header>
        {uploadMessage ? <div className="save-message" role="status">{uploadMessage}</div> : null}
        <div className="kb-form">
          <label className="field">{t('kb.field.name')}<input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('kb.placeholder.name')} /></label>
          <label className="field">{t('kb.field.sourcekey')}<input value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} placeholder={t('kb.placeholder.sourcekey')} /></label>
          <label className="field">{t('kb.field.title')}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('kb.placeholder.title')} /></label>
          <label className="field kb-content-field">{t('kb.field.content')}<textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} placeholder={t('kb.placeholder.content')} /></label>
        </div>
        <footer><button className="button button-primary" type="button" disabled={busy} onClick={upload}><FileUp size={16} /> {t('kb.create')}</button></footer>
      </section>

      {selectedVersion ? (
        <section className="panel table-panel">
          <header className="panel-header"><div><span className="eyebrow">{t('kb.docs')}</span><h2>v{selectedVersion.version} · {selectedVersion.name}</h2></div></header>
          {documents.loading && !documents.data ? <StatePanel kind="loading" title={t('kb.docs.loading')} /> : null}
          {documents.error ? <StatePanel kind="error" title={t('kb.docs.unavailable')} detail={documents.error} onRetry={documents.reload} /> : null}
          {documents.data && documents.data.length === 0 ? <StatePanel kind="empty" title={t('kb.docs.empty')} /> : null}
          {documents.data && documents.data.length > 0 ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>{t('kb.docs.table.sourcekey')}</th><th>{t('kb.docs.table.title')}</th><th>{t('kb.docs.table.type')}</th><th>{t('kb.docs.table.chunks')}</th><th>{t('kb.docs.table.hash')}</th><th>{t('kb.docs.table.created')}</th></tr></thead>
                <tbody>{documents.data.map((doc) => (
                  <tr key={doc.id}>
                    <td><code>{doc.source_key}</code></td>
                    <td>{doc.title}</td>
                    <td>{doc.media_type}</td>
                    <td>{doc.chunk_count}</td>
                    <td><code>{doc.content_hash.slice(0, 12)}</code></td>
                    <td>{formatTime(doc.created_at, locale)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="panel kb-smoke">
        <header className="panel-header"><div><span className="eyebrow">{t('kb.retrieval')}</span><h2>{t('kb.smoke')}</h2></div></header>
        <div className="kb-smoke-form">
          <input value={smokeQuery} onChange={(e) => setSmokeQuery(e.target.value)} placeholder={t('kb.smoke.placeholder')} onKeyDown={(e) => e.key === 'Enter' && runSmokeTest()} />
          <button className="button button-primary" type="button" disabled={smokeBusy} onClick={runSmokeTest}><FlaskConical size={16} /> {t('kb.smoke.run')}</button>
        </div>
        {smokeMessage ? <div className="save-message" role="status">{smokeMessage}</div> : null}
        {smokeResults && smokeResults.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>{t('kb.smoke.table.score')}</th><th>{t('kb.smoke.table.chunk')}</th><th>{t('kb.smoke.table.content')}</th></tr></thead>
              <tbody>{smokeResults.map((result) => (
                <tr key={result.chunk_id}>
                  <td>{result.score.toFixed(4)}</td>
                  <td><small>#{result.chunk_index}</small><code>{result.chunk_id.slice(0, 8)}</code></td>
                  <td className="kb-smoke-content">{result.content}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function formatTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}