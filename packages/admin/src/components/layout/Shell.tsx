import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSchema } from '../../hooks/queries';
import { useDensity, useTheme } from '../../lib/theme';
import { Icon, type IconName } from '../ui/icon';
import { Button, Kbd, Select } from '../ui/primitives';
import { cn } from '../../lib/cn';

export function Shell({
  onOpenCmd, onOpenCopilot, children,
}: { onOpenCmd: () => void; onOpenCopilot: () => void; children: React.ReactNode }) {
  const { data: schema } = useSchema();
  const [theme, setTheme]     = useTheme();
  const [density, setDensity] = useDensity();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="h-full grid" style={{ gridTemplateColumns: collapsed ? '64px 1fr' : '240px 1fr' }}>
      <aside className="border-r border-border bg-surface flex flex-col min-w-0">
        <div className={cn('h-14 flex items-center gap-2 border-b border-border', collapsed ? 'justify-center px-0' : 'px-3')}>
          {collapsed ? (
            <button
              className="w-9 h-9 rounded-md bg-accent text-accent-fg grid place-items-center font-mono font-bold text-sm hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              CM
            </button>
          ) : (
            <>
              <div className="w-7 h-7 rounded-md bg-accent text-accent-fg grid place-items-center font-mono font-bold text-sm shrink-0">CM</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{schema?.appName ?? 'Casemaster'}</div>
                <div className="text-xs text-muted truncate">v{schema?.version ?? '?'}.0 admin</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} title="Collapse sidebar" aria-label="Collapse sidebar">
                <Icon name="menu" />
              </Button>
            </>
          )}
        </div>

        <SidebarNav collapsed={collapsed} />

        <div className="border-t border-border p-2 flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme (mod-shift-l)">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </Button>
          {!collapsed && (
            <Select className="!h-7 !text-xs flex-1" value={density} onChange={(e) => setDensity(e.currentTarget.value as any)}>
              <option value="compact">Compact</option>
              <option value="cozy">Cozy</option>
              <option value="comfortable">Comfortable</option>
            </Select>
          )}
        </div>
      </aside>

      <div className="flex flex-col min-w-0">
        <header className="h-14 px-4 border-b border-border bg-surface flex items-center gap-3">
          <Breadcrumbs />
          <div className="flex-1" />
          <Button onClick={onOpenCmd} title="Command palette">
            <Icon name="search" /> <span className="hidden md:inline">Search</span>
            <span className="ml-2"><Kbd>{isMac() ? '⌘' : 'Ctrl'}</Kbd><Kbd>K</Kbd></span>
          </Button>
          <Button onClick={onOpenCopilot} title="Copilot (Cmd-J)">
            <Icon name="sparkles" /> <span className="hidden md:inline">Copilot</span>
          </Button>
          <a href="/" className="btn btn-ghost text-muted" title="Open the Old vs New comparison">
            <Icon name="zap" /> <span className="hidden md:inline">Compare</span>
          </a>
          <div className="w-7 h-7 rounded-full bg-elev grid place-items-center text-xs font-medium" title="Demo Operator">DO</div>
        </header>
        <main className="flex-1 min-h-0 overflow-auto p-6 bg-bg">{children}</main>
      </div>
    </div>
  );
}

function SidebarNav({ collapsed }: { collapsed: boolean }) {
  const { data: schema, isLoading } = useSchema();
  const loc = useLocation();
  const [open, setOpen] = useState(() => new Set<string>());

  if (isLoading || !schema) {
    return (
      <nav className="flex-1 p-3 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel h-7" />)}
      </nav>
    );
  }

  const isActive = (path?: string) => {
    if (!path) return false;
    const p = path.replace(/^\/admin/, '').replace(/^\//, '');
    return loc.pathname.replace(/^\//, '') === p;
  };

  return (
    <nav className="flex-1 overflow-y-auto p-2 text-sm">
      {schema.navigation.map((n) => {
        if (n.children) {
          const isOpen = open.has(n.label) || n.children.some((c) => isActive(c.path));
          return (
            <div key={n.label} className="mb-1">
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-elev text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => setOpen((s) => {
                  const x = new Set(s);
                  if (x.has(n.label)) x.delete(n.label); else x.add(n.label);
                  return x;
                })}
              >
                <Icon name={(n.icon as IconName) || 'chevronRight'} />
                {!collapsed && <span className="flex-1 text-left">{n.label}</span>}
                {!collapsed && <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} />}
              </button>
              {isOpen && !collapsed && (
                <ul className="ml-3 pl-3 border-l border-border my-1">
                  {n.children.map((c) => (
                    <li key={c.path}>
                      <Link
                        to={(c.path ?? '/').replace(/^\/admin/, '') || '/'}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-elev focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          isActive(c.path) && 'bg-accent/10 text-accent',
                        )}
                      >
                        <Icon name={(c.icon as IconName) || 'circle'} size={14} />
                        <span className="truncate">{c.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        }
        return (
          <Link
            key={n.path}
            to={(n.path ?? '/').replace(/^\/admin/, '') || '/'}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-elev mb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              isActive(n.path) && 'bg-accent/10 text-accent',
            )}
          >
            <Icon name={(n.icon as IconName) || 'circle'} />
            {!collapsed && <span className="truncate">{n.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function Breadcrumbs() {
  const loc = useLocation();
  const parts = loc.pathname.split('/').filter(Boolean);
  return (
    <nav className="flex items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
      <Link to="/" className="hover:text-fg">Home</Link>
      {parts.map((p, i) => {
        const path = '/' + parts.slice(0, i + 1).join('/');
        const last = i === parts.length - 1;
        return (
          <span key={path} className="flex items-center gap-1">
            <Icon name="chevronRight" size={10} />
            <Link to={path} className={cn('hover:text-fg', last && 'text-fg font-medium')}>{p}</Link>
          </span>
        );
      })}
    </nav>
  );
}

function isMac() {
  return typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
}
