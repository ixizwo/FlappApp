import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { DomainDiff, DraftStatus } from '@flappapp/shared';
import {
  api,
  type DraftSummary,
  type SnapshotSummary,
} from '../lib/api.ts';

/**
 * Phase 6 — Versioning & Snapshots page.
 *
 * Three sections:
 *   1. **Live** — current model state, with a "Create Snapshot" button.
 *   2. **Snapshots** — immutable past versions, with inter-snapshot diff.
 *   3. **Drafts** — open / promoted / discarded drafts with preview-promote.
 */
export function VersionsView() {
  const { domainId = '' } = useParams<{ domainId: string }>();
  const queryClient = useQueryClient();

  const snapshotsQuery = useQuery({
    queryKey: ['snapshots', domainId],
    queryFn: () => api.snapshots.list(domainId),
    enabled: !!domainId,
  });
  const draftsQuery = useQuery({
    queryKey: ['drafts', domainId],
    queryFn: () => api.drafts.list(domainId),
    enabled: !!domainId,
  });

  // ── Create snapshot ──────────────────────────────────────────────
  const createSnapshotMut = useMutation({
    mutationFn: (name: string) => api.snapshots.create(domainId, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['snapshots', domainId] });
    },
  });

  const handleCreateSnapshot = useCallback(() => {
    const name = window.prompt('Snapshot name')?.trim();
    if (!name) return;
    createSnapshotMut.mutate(name);
  }, [createSnapshotMut]);

  // ── Create draft ─────────────────────────────────────────────────
  const createDraftMut = useMutation({
    mutationFn: (name: string) => api.drafts.create(domainId, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drafts', domainId] });
    },
  });

  const handleCreateDraft = useCallback(() => {
    const name = window.prompt('Draft name')?.trim();
    if (!name) return;
    createDraftMut.mutate(name);
  }, [createDraftMut]);

  // ── Promote / discard ────────────────────────────────────────────
  const promoteMut = useMutation({
    mutationFn: (id: string) => api.drafts.promote(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drafts', domainId] });
      void queryClient.invalidateQueries({ queryKey: ['snapshots', domainId] });
      void queryClient.invalidateQueries({ queryKey: ['model-objects', domainId] });
      void queryClient.invalidateQueries({ queryKey: ['connections', domainId] });
    },
  });
  const discardMut = useMutation({
    mutationFn: (id: string) => api.drafts.discard(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drafts', domainId] });
    },
  });

  // ── Diff viewer state ────────────────────────────────────────────
  const [diffResult, setDiffResult] = useState<DomainDiff | null>(null);
  const [diffLabel, setDiffLabel] = useState('');

  const showDiffLive = useCallback(
    async (snap: SnapshotSummary) => {
      setDiffLabel(`v${snap.version} "${snap.name}" → Live`);
      setDiffResult(await api.snapshots.diffLive(snap.id));
    },
    [],
  );

  const showDiffTwoSnapshots = useCallback(
    async (a: SnapshotSummary, b: SnapshotSummary) => {
      setDiffLabel(`v${a.version} → v${b.version}`);
      setDiffResult(await api.snapshots.diff(a.id, b.id));
    },
    [],
  );

  const previewPromote = useCallback(async (draft: DraftSummary) => {
    setDiffLabel(`Draft "${draft.name}" → Live`);
    setDiffResult(await api.drafts.previewPromote(draft.id));
  }, []);

  const snapshots = snapshotsQuery.data ?? [];
  const drafts = draftsQuery.data ?? [];

  return (
    <div className="flex h-full min-h-0 gap-4 p-4">
      {/* ── Left: version management ─────────────────────────────── */}
      <div className="flex w-80 shrink-0 flex-col gap-4 overflow-auto">
        {/* Live */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-200">
              Live
            </h2>
            <button
              type="button"
              onClick={handleCreateSnapshot}
              disabled={createSnapshotMut.isPending}
              className="rounded border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-200 hover:border-indigo-400 disabled:opacity-50"
            >
              Create Snapshot
            </button>
          </div>
          <p className="mt-1 text-[10px] text-surface-200">
            Current model state. Snapshots capture a read-only copy.
          </p>
        </section>

        {/* Drafts */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-200">
              Drafts
            </h2>
            <button
              type="button"
              onClick={handleCreateDraft}
              disabled={createDraftMut.isPending}
              className="rounded border border-surface-800 bg-surface-950 px-2 py-0.5 text-[10px] text-surface-100 hover:border-indigo-400 disabled:opacity-50"
            >
              New Draft
            </button>
          </div>
          {drafts.length === 0 && (
            <p className="mt-1 text-[10px] text-surface-200">No drafts yet.</p>
          )}
          <ul className="mt-1 space-y-1">
            {drafts.map((d) => (
              <DraftRow
                key={d.id}
                draft={d}
                onPreview={() => previewPromote(d)}
                onPromote={() => {
                  const ok = window.confirm(
                    `Promote draft "${d.name}"? This will auto-snapshot the current live state, then replace it with the draft payload.`,
                  );
                  if (ok) promoteMut.mutate(d.id);
                }}
                onDiscard={() => {
                  const ok = window.confirm(`Discard draft "${d.name}"?`);
                  if (ok) discardMut.mutate(d.id);
                }}
              />
            ))}
          </ul>
        </section>

        {/* Snapshots */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-200">
            Snapshots
          </h2>
          {snapshots.length === 0 && (
            <p className="mt-1 text-[10px] text-surface-200">
              No snapshots yet. Create one to start versioning.
            </p>
          )}
          <ul className="mt-1 space-y-1">
            {snapshots.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded border border-surface-800 bg-surface-950 px-2 py-1.5 text-xs"
              >
                <span className="font-mono text-[10px] text-surface-200">
                  v{s.version}
                </span>
                <span className="flex-1 truncate text-surface-100">{s.name}</span>
                <button
                  type="button"
                  onClick={() => showDiffLive(s)}
                  className="text-[10px] text-indigo-300 hover:underline"
                >
                  vs Live
                </button>
                {i < snapshots.length - 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      showDiffTwoSnapshots(snapshots[i + 1]!, s)
                    }
                    className="text-[10px] text-indigo-300 hover:underline"
                  >
                    vs v{snapshots[i + 1]!.version}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ── Right: diff viewer ───────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-auto rounded border border-surface-800 bg-surface-950 p-4">
        {diffResult ? (
          <DiffViewer label={diffLabel} diff={diffResult} onClose={() => setDiffResult(null)} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-surface-200">
            Select two versions or click "vs Live" to see changes.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function DraftRow({
  draft,
  onPreview,
  onPromote,
  onDiscard,
}: {
  draft: DraftSummary;
  onPreview: () => void;
  onPromote: () => void;
  onDiscard: () => void;
}) {
  const isOpen = draft.status === 'OPEN';
  return (
    <li className="flex items-center gap-2 rounded border border-surface-800 bg-surface-950 px-2 py-1.5 text-xs">
      <DraftStatusBadge status={draft.status} />
      <span className="flex-1 truncate text-surface-100">{draft.name}</span>
      {isOpen && (
        <>
          <button
            type="button"
            onClick={onPreview}
            className="text-[10px] text-indigo-300 hover:underline"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={onPromote}
            className="text-[10px] text-emerald-300 hover:underline"
          >
            Promote
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="text-[10px] text-rose-300 hover:underline"
          >
            Discard
          </button>
        </>
      )}
    </li>
  );
}

function DraftStatusBadge({ status }: { status: DraftStatus }) {
  const cls: Record<string, string> = {
    OPEN: 'bg-emerald-500/15 text-emerald-300',
    PROMOTED: 'bg-indigo-500/15 text-indigo-300',
    DISCARDED: 'bg-surface-500/15 text-surface-200',
  };
  return (
    <span
      className={`rounded px-1 py-0.5 font-mono text-[9px] uppercase ${cls[status] ?? cls.OPEN}`}
    >
      {status}
    </span>
  );
}

function DiffViewer({
  label,
  diff,
  onClose,
}: {
  label: string;
  diff: DomainDiff;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-surface-800 pb-2">
        <h3 className="text-sm font-semibold text-surface-100">{label}</h3>
        <div className="flex items-center gap-3">
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
            +{diff.stats.added}
          </span>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
            ~{diff.stats.modified}
          </span>
          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300">
            -{diff.stats.removed}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] text-surface-200 hover:text-surface-100"
          >
            Close
          </button>
        </div>
      </div>

      {diff.entries.length === 0 ? (
        <p className="mt-4 text-xs text-surface-200">No changes detected.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs">
          {diff.entries.map((e) => (
            <li
              key={`${e.kind}-${e.id}`}
              className="flex items-start gap-2 rounded bg-surface-900/60 px-2 py-1"
            >
              <DiffChangeBadge change={e.change} />
              <span className="font-mono text-[10px] text-surface-200">
                {e.kind}
              </span>
              <span className="flex-1 text-surface-100">{e.name}</span>
              {e.fields && e.fields.length > 0 && (
                <span className="text-[10px] text-surface-200">
                  {e.fields.map((f) => f.field).join(', ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function DiffChangeBadge({ change }: { change: 'added' | 'removed' | 'modified' }) {
  const cls = {
    added: 'bg-emerald-500/20 text-emerald-300',
    removed: 'bg-rose-500/20 text-rose-300',
    modified: 'bg-amber-500/20 text-amber-300',
  };
  const sym = { added: '+', removed: '-', modified: '~' };
  return (
    <span
      className={`inline-block w-4 rounded text-center font-mono text-[10px] ${cls[change]}`}
    >
      {sym[change]}
    </span>
  );
}
