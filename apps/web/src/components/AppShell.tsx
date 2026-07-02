import {
  Activity,
  BookOpen,
  CheckSquare,
  Gauge,
  Rocket,
  Settings,
  ShieldCheck,
  ShieldQuestion,
  LogOut,
} from 'lucide-react';
import type { OperatorPrincipal, Tenant, ViewName } from '../types.js';
import { useLocale } from '../locales/index.js';
import { LanguageSwitcher } from './LanguageSwitcher.js';

interface AppShellProps {
  view: ViewName;
  tenants: Tenant[];
  tenantId: string;
  ready: boolean | null;
  principal: OperatorPrincipal;
  children: React.ReactNode;
  onViewChange(view: ViewName): void;
  onTenantChange(tenantId: string): void;
  onLogout(): void;
}

const NAV_ITEMS = [
  { id: 'overview', labelKey: 'nav.overview', icon: Gauge },
  { id: 'traces', labelKey: 'nav.traces', icon: Activity },
  { id: 'approvals', labelKey: 'nav.approvals', icon: CheckSquare },
  { id: 'releases', labelKey: 'nav.releases', icon: Rocket },
  { id: 'knowledge', labelKey: 'nav.knowledge', icon: BookOpen },
  { id: 'tools', labelKey: 'nav.tools', icon: ShieldQuestion },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings },
] as const;

export function AppShell({
  view,
  tenants,
  tenantId,
  ready,
  principal,
  children,
  onViewChange,
  onTenantChange,
  onLogout,
}: AppShellProps) {
  const { t } = useLocale();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><ShieldCheck size={19} /></span>
          <span>{t('brand.name')}</span>
        </div>
        <nav aria-label={t('shell.operations.aria')}>
          {NAV_ITEMS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={view === id ? 'nav-item active' : 'nav-item'}
              onClick={() => onViewChange(id)}
            >
              <Icon size={18} />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </nav>
        <div className="service-state">
          <span className={`health-dot ${ready === false ? 'down' : ready === null ? 'unknown' : ''}`} />
          <span>{ready === false ? t('shell.runtime.unavailable') : ready === null ? t('shell.runtime.checking') : t('shell.runtime.ready')}</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{t('shell.eyebrow')}</span>
            <h1>{t(NAV_ITEMS.find((item) => item.id === view)?.labelKey ?? '')}</h1>
          </div>
          <div className="operator-tools">
            <label className="tenant-picker">
              <span>{t('shell.tenant')}</span>
              <select value={tenantId} onChange={(event) => onTenantChange(event.target.value)}>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.display_name}</option>
                ))}
              </select>
            </label>
            <LanguageSwitcher />
            <div className="operator-identity">
              <strong>{principal.display_name ?? principal.email ?? principal.subject}</strong>
              <span>{principal.admin ? t('shell.admin') : t('shell.operator')}</span>
            </div>
            <button className="icon-button" type="button" onClick={onLogout} aria-label={t('shell.signout')} title={t('shell.signout')}>
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <nav className="mobile-nav" aria-label={t('shell.operations.aria')}>
          {NAV_ITEMS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={view === id ? 'active' : ''}
              onClick={() => onViewChange(id)}
              aria-label={t(labelKey)}
              title={t(labelKey)}
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