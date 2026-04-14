import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { C4Level } from '@flappapp/shared';
import { api } from '../lib/api.ts';

/**
 * Lists every Diagram in the active Domain and lets the user create a
 * new one. Clicking a row opens the Phase 3 canvas at
 * `/domains/:domainId/diagrams/:diagramId`.
 *
 * The create dialog is intentionally minimal — name + level only. Scope
 * object (required for L2/L3) is picked on the canvas itself once the
 * diagram exists, to avoid a second modal here.
 */
export function DiagramsView() {
  const { domainId = '' } = useParams<{ domainId: string }>();
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const diagrams = useQuery({
    queryKey: ['diagrams', domainId],
    queryFn: () => api.diagrams.list(domainId),
    enabled: !!domainId,
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; level: C4Level }) =>
      api.diagrams.create({ domainId, ...input }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['diagrams', domainId] });
      setShowCreate(false);
      navigate(`/domains/${domainId}/diagrams/${created.id}`);
    },
  });

  const rows = diagrams.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-surface-800 bg-surface-900/40 px-4 py-3">
        <h1 className="text-lg font-semibold">Diagrams</h1>
        <span className="text-xs text-surface-200">{rows.length} total</span>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="ml-auto rounded border border-surface-800 bg-surface-950 px-3 py-1 text-xs text-surface-100 hover:border-indigo-400"
        >
          + New diagram
        </button>
      </div>

      {diagrams.isLoading && (
        <div className="p-6 text-sm text-surface-200">Loading diagrams…</div>
      )}

      {!diagrams.isLoading && rows.length === 0 && (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md rounded border border-dashed border-surface-800 bg-surface-900/40 p-6 text-center">
            <div className="mb-2 text-4xl">📐</div>
            <h2 className="text-sm font-semibold text-surface-100">
              No diagrams yet
            </h2>
            <p className="mt-2 text-xs text-surface-200">
              Create a diagram to start laying out your model visually.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-4 rounded border border-indigo-400 bg-indigo-500/20 px-3 py-1 text-xs text-indigo-200 hover:bg-indigo-500/30"
            >
              Create the first diagram
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex-1 overflow-auto divide-y divide-surface-800">
          {rows.map((d) => (
            <li key={d.id}>
              <Link
                to={`/domains/${domainId}/diagrams/${d.id}`}
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-900"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded bg-surface-800 text-sm">
                  L{d.level}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-surface-100">
                      {d.name}
                    </span>
                    {d.pinned && (
                      <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-300">
                        PINNED
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-surface-200">
                    {d._count.nodes} nodes · {d._count.edges} edges · updated{' '}
                    {new Date(d.updatedAt).toLocaleString()}
                  </div>
                </div>
                <span className="text-xs text-surface-200">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <CreateDiagramDialog
          onCancel={() => setShowCreate(false)}
          onCreate={(input) => createMutation.mutate(input)}
          submitting={createMutation.isPending}
        />
      )}
    </div>
  );
}

function CreateDiagramDialog({
  onCancel,
  onCreate,
  submitting,
}: {
  onCancel: () => void;
  onCreate: (input: { name: string; level: C4Level }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState<C4Level>(1);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-surface-950/80"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-lg border border-surface-800 bg-surface-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Create diagram"
      >
        <h2 className="text-sm font-semibold">New diagram</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onCreate({ name: name.trim(), level });
          }}
        >
          <label className="block text-xs text-surface-200">
            Name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-surface-800 bg-surface-950 px-2 py-1 text-sm text-surface-100"
              placeholder="e.g. Checkout Context"
            />
          </label>
          <label className="block text-xs text-surface-200">
            C4 Level
            <select
              value={level}
              onChange={(e) => setLevel(Number(e.target.value) as C4Level)}
              className="mt-1 w-full rounded border border-surface-800 bg-surface-950 px-2 py-1 text-sm text-surface-100"
            >
              <option value={1}>Level 1 — Context (Actors + Systems)</option>
              <option value={2}>Level 2 — Container (Apps + Stores)</option>
              <option value={3}>Level 3 — Component</option>
            </select>
          </label>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-3 py-1 text-xs text-surface-200 hover:text-surface-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="rounded bg-indigo-500 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
