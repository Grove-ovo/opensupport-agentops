import { useEffect, useState } from 'react';
import { api } from './api.js';
import { AppShell } from './components/AppShell.js';
import { StatePanel } from './components/StatePanel.js';
import { useResource } from './hooks/useResource.js';
import type { ViewName } from './types.js';
import { ApprovalsView } from './views/ApprovalsView.js';
import { OverviewView } from './views/OverviewView.js';
import { ReleasesView } from './views/ReleasesView.js';
import { SettingsView } from './views/SettingsView.js';
import { TracesView } from './views/TracesView.js';

export function App() {
  const [view, setView] = useState<ViewName>('overview');
  const [tenantId, setTenantId] = useState('');
  const tenants = useResource('tenants', api.tenants);
  const ready = useResource('ready', api.ready);

  useEffect(() => {
    if (!tenantId && tenants.data?.items[0]) setTenantId(tenants.data.items[0].id);
  }, [tenantId, tenants.data]);

  if (tenants.loading && !tenants.data) return <div className="boot-state"><StatePanel kind="loading" title="Loading AgentOps" /></div>;
  if (tenants.error && !tenants.data) return <div className="boot-state"><StatePanel kind="error" title="AgentOps unavailable" detail={tenants.error} onRetry={tenants.reload} /></div>;
  if (!tenants.data?.items.length) return <div className="boot-state"><StatePanel kind="empty" title="No tenants configured" /></div>;
  const content = tenantId ? {
    overview: <OverviewView tenantId={tenantId} />,
    traces: <TracesView tenantId={tenantId} />,
    approvals: <ApprovalsView tenantId={tenantId} />,
    releases: <ReleasesView tenantId={tenantId} />,
    settings: <SettingsView tenantId={tenantId} />,
  }[view] : null;
  return (
    <AppShell
      view={view}
      tenants={tenants.data.items}
      tenantId={tenantId}
      ready={ready.error ? false : ready.data ? true : null}
      onViewChange={setView}
      onTenantChange={setTenantId}
    >
      {content}
    </AppShell>
  );
}
