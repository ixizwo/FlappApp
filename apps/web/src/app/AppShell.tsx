import { ReactNode } from 'react';

/**
 * The persistent three-pane layout used across the app per PRD §5:
 *   - Top bar:    workspace switcher, version dropdown (Phase 6), presence
 *   - Left:       model assets / model panel (Phase 2/3)
 *   - Center:     route content (list views now, canvas later)
 *   - Right:      object properties / context panel (Phase 2+)
 *
 * Kept purely structural here; real widgets land in later phases so the
 * shell stays stable as features are layered in.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftPanel />
        <main className="min-w-0 flex-1 overflow-auto bg-surface-950">{children}</main>
        <RightPanel />
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <header className="flex h-12 items-center justify-between border-b border-surface-800 bg-surface-900 px-4">
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 rounded bg-gradient-to-br from-indigo-400 to-emerald-400" />
        <span className="font-semibold tracking-tight">FlappApp</span>
        <span className="rounded bg-surface-800 px-2 py-0.5 text-xs text-surface-200">
          demo · Live
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm text-surface-200">
        <span className="hidden sm:inline">C4 architecture modeling</span>
      </div>
    </header>
  );
}

function LeftPanel() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-surface-800 bg-surface-900 p-3 md:block">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-200">
        Model
      </h2>
      <ul className="space-y-1 text-sm text-surface-100">
        <li className="rounded px-2 py-1 hover:bg-surface-800">Model Objects</li>
        <li className="rounded px-2 py-1 hover:bg-surface-800">Connections</li>
        <li className="rounded px-2 py-1 hover:bg-surface-800">Diagrams</li>
        <li className="rounded px-2 py-1 hover:bg-surface-800">Dependencies</li>
      </ul>
      <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-surface-200">
        Admin
      </h2>
      <ul className="space-y-1 text-sm text-surface-100">
        <li className="rounded px-2 py-1 hover:bg-surface-800">Teams</li>
        <li className="rounded px-2 py-1 hover:bg-surface-800">Tech Choices</li>
        <li className="rounded px-2 py-1 hover:bg-surface-800">Audit Log</li>
      </ul>
    </aside>
  );
}

function RightPanel() {
  return (
    <aside className="hidden w-80 shrink-0 border-l border-surface-800 bg-surface-900 p-3 lg:block">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-200">
        Properties
      </h2>
      <p className="text-sm text-surface-200">
        Select an object to edit its name, description, status, tags, and technology.
      </p>
    </aside>
  );
}
