import {
  Activity,
  CheckSquare,
  Gauge,
  Rocket,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { Tenant, ViewName } from '../types.js';

interface AppShellProps {
  view: ViewName;
  tenants: Tenant[];
  tenantId: string;
  ready: boolean | null;
  children: React.ReactNode;
  onViewChange(view: ViewName): void;
  onTenantChange(tenantId: string): void;
}

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'traces', label: 'Traces', icon: Activity },
  { id: 'approvals', label: 'Approvals', icon: CheckSquare },
  { id: 'releases', label: 'Releases', icon: Rocket },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

export function AppShell({
  view,
  tenants,
  tenantId,
  ready,
  children,
  onViewChange,
  onTenantChange,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><ShieldCheck size={19} /></span>
          <span>OpenSupport</span>
        </div>
        <nav aria-label="Operations">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={view === id ? 'nav-item active' : 'nav-item'}
              onClick={() => onViewChange(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="service-state">
          <span className={`health-dot ${ready === false ? 'down' : ready === null ? 'unknown' : ''}`} />
          <span>{ready === false ? 'Dependencies unavailable' : ready === null ? 'Checking runtime' : 'Runtime ready'}</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Agent operations</span>
            <h1>{NAV_ITEMS.find((item) => item.id === view)?.label}</h1>
          </div>
          <label className="tenant-picker">
            <span>Tenant</span>
            <select value={tenantId} onChange={(event) => onTenantChange(event.target.value)}>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.display_name}</option>
              ))}
            </select>
          </label>
        </header>
        <nav className="mobile-nav" aria-label="Operations">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={view === id ? 'active' : ''}
              onClick={() => onViewChange(id)}
              aria-label={label}
              title={label}
            >
              <Icon size={18} />
            </button>
          ))}
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
