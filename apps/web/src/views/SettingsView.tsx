import { KeyRound, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { StatePanel } from '../components/StatePanel.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { useResource } from '../hooks/useResource.js';
import { useLocale } from '../locales/index.js';

interface SettingsViewProps {
  tenantId: string;
}

export function SettingsView({ tenantId }: SettingsViewProps) {
  const { t } = useLocale();
  const settings = useResource(`settings:${tenantId}`, () => api.settings(tenantId));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (settings.loading && !settings.data) return <StatePanel kind="loading" title={t('settings.loading')} />;
  if (settings.error && !settings.data) return <StatePanel kind="error" title={t('settings.unavailable')} detail={settings.error} onRetry={settings.reload} />;
  if (!settings.data) return <StatePanel kind="empty" title={t('settings.notfound')} />;
  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await operation();
      setMessage(t('settings.saved'));
      settings.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('settings.savefailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-grid">
      {message ? <div className="save-message" role="status">{message}</div> : null}
      <TenantForm data={settings.data.tenant} disabled={busy} onSave={(input) => mutate(() => api.updateTenant(tenantId, input))} />
      {settings.data.model_config ? <ModelForm data={settings.data.model_config} disabled={busy} onSave={(input) => mutate(() => api.updateModel(tenantId, input))} /> : <StatePanel kind="empty" title={t('settings.model.unavailable')} />}
      {settings.data.chatwoot ? <ChatwootForm data={settings.data.chatwoot} disabled={busy} onSave={(input) => mutate(() => api.updateChatwoot(tenantId, input))} /> : <StatePanel kind="empty" title={t('settings.chatwoot.unavailable')} />}
    </div>
  );
}

function TenantForm({ data, disabled, onSave }: { data: SettingsViewData['tenant']; disabled: boolean; onSave(input: Record<string, unknown> & { display_name: string; status: SettingsViewData['tenant']['status']; metadata: Record<string, unknown> }): void }) {
  const { t } = useLocale();
  const [name, setName] = useState(data.display_name);
  const [status, setStatus] = useState(data.status);
  useEffect(() => { setName(data.display_name); setStatus(data.status); }, [data]);
  return <form className="settings-section" onSubmit={(event) => { event.preventDefault(); onSave({ display_name: name, status, metadata: data.metadata }); }}><SectionHeader title={t('settings.section.tenant')} detail={data.slug} /><div className="form-grid"><label className="field"><span>{t('settings.field.displayname')}</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field"><span>{t('settings.field.status')}</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="active">{t('settings.tenant.active')}</option><option value="suspended">{t('settings.tenant.suspended')}</option><option value="archived">{t('settings.tenant.archived')}</option></select></label></div><SaveButton disabled={disabled} /></form>;
}

type SettingsViewData = Awaited<ReturnType<typeof api.settings>>;

function ModelForm({ data, disabled, onSave }: { data: NonNullable<SettingsViewData['model_config']>; disabled: boolean; onSave(input: Record<string, unknown>): void }) {
  const { t } = useLocale();
  const [form, setForm] = useState({ ...data, replacement_api_key: '' });
  useEffect(() => setForm({ ...data, replacement_api_key: '' }), [data]);
  const update = (key: keyof typeof form, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  return <form className="settings-section settings-wide" onSubmit={(event) => { event.preventDefault(); const { id: _id, version: _version, has_encrypted_api_key: _has, ...input } = form; onSave({ ...input, replacement_api_key: form.replacement_api_key || undefined }); }}><SectionHeader title={t('settings.model.title')} detail={t('settings.model.version', { version: data.version })} badge={data.has_encrypted_api_key ? t('settings.model.keyconfigured') : t('settings.model.keymissing')} /><div className="form-grid form-grid-three"><label className="field"><span>{t('settings.field.provider')}</span><input value={form.provider} onChange={(event) => update('provider', event.target.value)} /></label><label className="field"><span>{t('settings.field.fastmodel')}</span><input value={form.fast_model} onChange={(event) => update('fast_model', event.target.value)} /></label><label className="field"><span>{t('settings.field.strongmodel')}</span><input value={form.strong_model} onChange={(event) => update('strong_model', event.target.value)} /></label><label className="field"><span>{t('settings.field.embeddingmodel')}</span><input value={form.embedding_model} onChange={(event) => update('embedding_model', event.target.value)} /></label><label className="field"><span>{t('settings.field.fallbackmodel')}</span><input value={form.fallback_model} onChange={(event) => update('fallback_model', event.target.value)} /></label><label className="field"><span>{t('settings.field.timeout')}</span><input type="number" value={form.timeout_ms} onChange={(event) => update('timeout_ms', Number(event.target.value))} /></label><label className="field"><span>{t('settings.field.ticketbudget')}</span><input type="number" step="0.001" value={form.max_cost_per_ticket} onChange={(event) => update('max_cost_per_ticket', Number(event.target.value))} /></label><label className="field"><span>{t('settings.field.dailybudget')}</span><input type="number" step="0.01" value={form.daily_budget} onChange={(event) => update('daily_budget', Number(event.target.value))} /></label><label className="field secret-field"><span>{t('settings.field.replacekey')}</span><div><KeyRound size={16} /><input type="password" autoComplete="new-password" value={form.replacement_api_key} onChange={(event) => update('replacement_api_key', event.target.value)} placeholder={t('settings.placeholder.keyretain')} /></div></label></div><SaveButton disabled={disabled} /></form>;
}

function ChatwootForm({ data, disabled, onSave }: { data: NonNullable<SettingsViewData['chatwoot']>; disabled: boolean; onSave(input: Record<string, unknown>): void }) {
  const { t } = useLocale();
  const [form, setForm] = useState({ ...data, webhook_secret_ref: '', api_token_ref: '' });
  useEffect(() => setForm({ ...data, webhook_secret_ref: '', api_token_ref: '' }), [data]);
  const update = (key: keyof typeof form, value: string | number | null) => setForm((current) => ({ ...current, [key]: value }));
  return <form className="settings-section settings-wide" onSubmit={(event) => { event.preventDefault(); onSave({ base_url: form.base_url, account_id: form.account_id, inbox_id: form.inbox_id, agent_bot_id: form.agent_bot_id, runtime_mode: form.runtime_mode, webhook_secret_ref: form.webhook_secret_ref || undefined, api_token_ref: form.api_token_ref || undefined }); }}><SectionHeader title={t('settings.chatwoot.title')} detail={data.base_url} badge={data.verification_status} /><div className="form-grid form-grid-three"><label className="field"><span>{t('settings.field.baseurl')}</span><input value={form.base_url} onChange={(event) => update('base_url', event.target.value)} /></label><label className="field"><span>{t('settings.field.accountid')}</span><input type="number" value={form.account_id} onChange={(event) => update('account_id', Number(event.target.value))} /></label><label className="field"><span>{t('settings.field.runtimemode')}</span><select value={form.runtime_mode} onChange={(event) => update('runtime_mode', event.target.value)}><option value="shadow">{t('settings.mode.shadow')}</option><option value="assist">{t('settings.mode.assist')}</option><option value="auto">{t('settings.mode.auto')}</option></select></label><label className="field"><span>{t('settings.field.inboxid')}</span><input type="number" value={form.inbox_id ?? ''} onChange={(event) => update('inbox_id', event.target.value ? Number(event.target.value) : null)} /></label><label className="field secret-field"><span>{t('settings.field.webhooksecret')}</span><div><KeyRound size={16} /><input value={form.webhook_secret_ref} onChange={(event) => update('webhook_secret_ref', event.target.value)} placeholder={data.webhook_secret_ref_hint ?? t('settings.placeholder.webhook')} /></div></label><label className="field secret-field"><span>{t('settings.field.apitoken')}</span><div><KeyRound size={16} /><input value={form.api_token_ref} onChange={(event) => update('api_token_ref', event.target.value)} placeholder={data.api_token_ref_hint ?? t('settings.placeholder.apitoken')} /></div></label></div><SaveButton disabled={disabled} /></form>;
}

function SectionHeader({ title, detail, badge }: { title: string; detail: string; badge?: string }) {
  return <header className="settings-header"><div><h2>{title}</h2><span>{detail}</span></div>{badge ? <StatusBadge value={badge} /> : null}</header>;
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { t } = useLocale();
  return <footer><button className="button button-primary" type="submit" disabled={disabled}><Save size={16} />{t('settings.save')}</button></footer>;
}