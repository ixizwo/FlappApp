import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { CommandPalette } from './CommandPalette.tsx';
import { WorkspaceSwitcher } from './WorkspaceSwitcher.tsx';

/**
 * Persistent three-pane layout (PRD §5):
 *  - Top bar:   workspace switcher + palette launcher
 *  - Left:      nav scoped to the active Domain
 *  - Center:    routed page content
 *  - Right:     properties panel (populated by individual pages)
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TopBar onOpenPalette={() => setPaletteOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <LeftNav />
        <main className="min-w-0 flex-1 overflow-auto bg-surface-950">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-surface-800 bg-surface-900 px-4">
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 rounded bg-gradient-to-br from-indigo-400 to-emerald-400" />
        <span className="font-semibold tracking-tight">FlappApp</span>
        <WorkspaceSwitcher />
      </div>
      <div className="flex items-center gap-3 text-sm text-surface-200">
        <button
          type="button"
          onClick={onOpenPalette}
          className="rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-200 hover:border-surface-200"
          aria-label="Open command palette"
        >
          Search <kbd className="ml-2 rounded bg-surface-800 px-1">⌘K</kbd>
        </button>
      </div>
    </header>
  );
}

function LeftNav() {
  const { domainId } = useParams<{ domainId?: string }>();

  const base = domainId ? `/domains/${domainId}` : null;

  return (
    <aside className="hidden w-60 shrink-0 border-r border-surface-800 bg-surface-900 p-3 md:block">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-200">
        Model
      </h2>
      <ul className="space-y-0.5 text-sm">
        <SidebarLink to={base ? `${base}/objects` : '/no-domain'} label="Model Objects" />
        <SidebarLink to={base ? `${base}/connections` : '/no-domain'} label="Connections" />
        <SidebarLink to={base ? `${base}/diagrams` : '/no-domain'} label="Diagrams" />
        <SidebarLink to={base ? `${base}/dependencies` : '/no-domain'} label="Dependencies" />
      </ul>
      <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-surface-200">
        Admin
      </h2>
      <ul className="space-y-0.5 text-sm text-surface-200">
        <li className="rounded px-2 py-1 opacity-60">Teams</li>
        <li className="rounded px-2 py-1 opacity-60">Tech Choices</li>
        <li className="rounded px-2 py-1 opacity-60">Audit Log</li>
      </ul>
    </aside>
  );
}

function SidebarLink({ to, label }: { to: string; label: string }) {
  return (
    <li>
      <NavLink
        to={to}
        end={false}
        className={({ isActive }) =>
          clsx(
            'block rounded px-2 py-1 text-surface-100 transition-colors',
            isActive ? 'bg-surface-800' : 'hover:bg-surface-800/60',
          )
        }
      >
        {label}
      </NavLink>
    </li>
  );
}
