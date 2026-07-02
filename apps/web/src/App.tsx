import { useEffect, useState } from 'react';
import { ApiError, api } from './api.js';
import { AppShell } from './components/AppShell.js';
import { StatePanel } from './components/StatePanel.js';
import { useResource } from './hooks/useResource.js';
import { LocaleProvider, useLocale } from './locales/index.js';
import type { AuthSession, ViewName } from './types.js';
import { ApprovalsView } from './views/ApprovalsView.js';
import { OverviewView } from './views/OverviewView.js';
import { PolicyKBView } from './views/PolicyKBView.js';
import { ReleasesView } from './views/ReleasesView.js';
import { SettingsView } from './views/SettingsView.js';
import { ToolRiskView } from './views/ToolRiskView.js';
import { TracesView } from './views/TracesView.js';

export function App() {
  return (
    <LocaleProvider>
      <AppRoot />
    </LocaleProvider>
  );
}

function AppRoot() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authState, setAuthState] = useState<
    'loading' | 'authenticated' | 'signed_out' | 'forbidden' | 'error'
  >('loading');

  useEffect(() => {
    let active = true;
    void api.session().then((value) => {
      if (active) {
        setSession(value);
        setAuthState('authenticated');
      }
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) {
        setAuthState('signed_out');
      } else if (error instanceof ApiError && error.status === 403) {
        setAuthState('forbidden');
      } else {
        setAuthState('error');
      }
    });
    const expire = () => {
      setSession(null);
      setAuthState('signed_out');
    };
    window.addEventListener('agentops:session-expired', expire);
    return () => {
      active = false;
      window.removeEventListener('agentops:session-expired', expire);
    };
  }, []);

  if (authState === 'loading') {
    return <AuthSurface title="auth.session.checking" />;
  }
  if (authState === 'signed_out') {
    return (
      <AuthSurface
        title="auth.signin.required"
        detail="auth.signin.detail"
        action
      />
    );
  }
  if (authState === 'forbidden') {
    return <AuthSurface title="auth.forbidden.title" detail="auth.forbidden.detail" />;
  }
  if (authState === 'error' || session === null) {
    return <AuthSurface title="auth.error.title" detail="auth.error.detail" />;
  }

  return (
    <AuthenticatedApp
      session={session}
      onLogout={() => {
        void api.logout().finally(() => {
          setSession(null);
          setAuthState('signed_out');
        });
      }}
    />
  );
}

function AuthenticatedApp({
  session,
  onLogout,
}: {
  session: AuthSession;
  onLogout(): void;
}) {
  const { t } = useLocale();
  const [view, setView] = useState<ViewName>('overview');
  const [tenantId, setTenantId] = useState('');
  const tenants = useResource('tenants', api.tenants);
  const ready = useResource('ready', api.ready);

  useEffect(() => {
    if (!tenantId && tenants.data?.items[0]) setTenantId(tenants.data.items[0].id);
  }, [tenantId, tenants.data]);

  if (tenants.loading && !tenants.data) return <div className="boot-state"><StatePanel kind="loading" title={t('auth.loading.title')} /></div>;
  if (tenants.error && !tenants.data) return <div className="boot-state"><StatePanel kind="error" title={t('auth.unavailable.title')} detail={tenants.error} onRetry={tenants.reload} /></div>;
  if (!tenants.data?.items.length) return <div className="boot-state"><StatePanel kind="empty" title={t('auth.notenants.title')} /></div>;
  const content = tenantId ? {
    overview: <OverviewView tenantId={tenantId} />,
    traces: <TracesView tenantId={tenantId} />,
    approvals: <ApprovalsView tenantId={tenantId} />,
    releases: <ReleasesView tenantId={tenantId} />,
    knowledge: <PolicyKBView tenantId={tenantId} />,
    tools: <ToolRiskView tenantId={tenantId} />,
    settings: <SettingsView tenantId={tenantId} />,
  }[view] : null;
  return (
    <AppShell
      view={view}
      tenants={tenants.data.items}
      tenantId={tenantId}
      ready={ready.error ? false : ready.data ? true : null}
      principal={session.principal}
      onViewChange={setView}
      onTenantChange={setTenantId}
      onLogout={onLogout}
    >
      {content}
    </AppShell>
  );
}

function AuthSurface({
  title,
  detail,
  action = false,
}: {
  title: string;
  detail?: string;
  action?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="auth-surface">
      <div className="auth-panel">
        <span className="auth-mark">OS</span>
        <h1>{t(title)}</h1>
        {detail ? <p>{t(detail)}</p> : null}
        {action ? (
          <a className="button button-primary" href="/api/v1/auth/login">
            {t('auth.signin.button')}
          </a>
        ) : null}
      </div>
    </div>
  );
}