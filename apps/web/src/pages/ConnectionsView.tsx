import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { C4Level, ObjectStatus } from '@flappapp/shared';
import { ObjectStatus as Status } from '@flappapp/shared';
import { api, type Connection, type ImpliedConnection, type ModelObject } from '../lib/api.ts';
import { statusBadgeClass, typeGlyph, typeTextClass } from '../lib/ui.ts';

/**
 * Connections table for the active Domain.
 *
 * Two modes:
 *  - `concrete`: the raw Connection rows persisted in the DB
 *  - `implied`:  those same connections projected up to a chosen C4 level
 *    via the shared `resolveImpliedConnections` helper (API-side).
 *
 * The toggle exists so a user reviewing, say, a Level-1 Context diagram can
 * verify that *every* lower-level connection is represented by at least
 * one higher-level edge — the defining feature of the PRD's "lower
 * connections" concept (PRD §3.3).
 */
export function ConnectionsView() {
  const { domainId = '' } = useParams<{ domainId: string }>();
  const [mode, setMode] = useState<'concrete' | 'implied'>('concrete');
  const [level, setLevel] = useState<C4Level>(1);
  const [statusFilter, setStatusFilter] = useState<ObjectStatus | ''>('');
  const [search, setSearch] = useState('');

  const concrete = useQuery({
    queryKey: ['connections', domainId, statusFilter],
    queryFn: () =>
      api.connections.list({
        domainId,
        ...(statusFilter && { status: statusFilter }),
      }),
    enabled: !!domainId && mode === 'concrete',
  });

  const implied = useQuery({
    queryKey: ['connections-implied', domainId, level],
    queryFn: () => api.connections.implied(domainId, level),
    enabled: !!domainId && mode === 'implied',
  });

  // Implied edges only give us ids — fetch the full object list once so
  // we can render names alongside them. Cached by domain.
  const objects = useQuery({
    queryKey: ['model-objects', domainId, '', '', undefined, ''],
    queryFn: () => api.modelObjects.list({ domainId }),
    enabled: !!domainId,
  });

  const objectMap = useMemo(() => {
    const map = new Map<string, ModelObject>();
    for (const o of objects.data ?? []) map.set(o.id, o);
    return map;
  }, [objects.data]);

  const filteredConcrete = useMemo(() => {
    const rows = concrete.data ?? [];
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (c) =>
        c.sender.name.toLowerCase().includes(q) ||
        c.receiver.name.toLowerCase().includes(q) ||
        (c.via?.name.toLowerCase().includes(q) ?? false),
    );
  }, [concrete.data, search]);

  const filteredImplied = useMemo(() => {
    const rows = implied.data ?? [];
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const s = objectMap.get(r.senderId)?.name.toLowerCase() ?? '';
      const rec = objectMap.get(r.receiverId)?.name.toLowerCase() ?? '';
      return s.includes(q) || rec.includes(q);
    });
  }, [implied.data, objectMap, search]);

  const loading =
    (mode === 'concrete' && concrete.isLoading) ||
    (mode === 'implied' && implied.isLoading);
  const error = mode === 'concrete' ? concrete.error : implied.error;
  const count = mode === 'concrete' ? filteredConcrete.length : filteredImplied.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-surface-800 bg-surface-900/40 px-4 py-3">
        <h1 className="mr-4 text-lg font-semibold">Connections</h1>
        <div
          className="inline-flex overflow-hidden rounded border border-surface-800"
          role="tablist"
          aria-label="Connection mode"
        >
          <ModeButton
            label="Concrete"
            active={mode === 'concrete'}
            onClick={() => setMode('concrete')}
          />
          <ModeButton
            label="Implied"
            active={mode === 'implied'}
            onClick={() => setMode('implied')}
          />
        </div>
        {mode === 'implied' && (
          <select
            aria-label="Projection level"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value) as C4Level)}
            className="rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-100"
          >
            <option value={1}>Level 1 — Context</option>
            <option value={2}>Level 2 — Container</option>
            <option value={3}>Level 3 — Component</option>
          </select>
        )}
        <input
          type="search"
          placeholder="Filter by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded border border-surface-800 bg-surface-950 px-2 py-1 text-sm text-surface-100"
          aria-label="Filter by name"
        />
        {mode === 'concrete' && (
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target.value as ObjectStatus) || '')}
            className="rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-100"
          >
            <option value="">All statuses</option>
            {Object.values(Status).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto text-xs text-surface-200">{count} rows</span>
      </div>

      {error && (
        <div className="border-b border-rose-900 bg-rose-950/40 px-4 py-2 text-sm text-rose-300">
          Failed to load connections.
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading && <div className="p-6 text-sm text-surface-200">Loading connections…</div>}
        {!loading && mode === 'concrete' && (
          <ConcreteTable rows={filteredConcrete} />
        )}
        {!loading && mode === 'implied' && (
          <ImpliedTable rows={filteredImplied} objectMap={objectMap} />
        )}
      </div>
    </div>
  );
}

function ModeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'px-3 py-1 text-xs ' +
        (active
          ? 'bg-surface-800 text-surface-100'
          : 'bg-surface-950 text-surface-200 hover:text-surface-100')
      }
    >
      {label}
    </button>
  );
}

function ConcreteTable({ rows }: { rows: Connection[] }) {
  if (rows.length === 0) {
    return <div className="p-6 text-sm text-surface-200">No connections match.</div>;
  }
  return (
    <table className="w-full border-collapse text-sm" data-testid="connections-table">
      <thead className="sticky top-0 bg-surface-900 text-left text-xs uppercase tracking-wider text-surface-200">
        <tr>
          <th className="px-4 py-2">Sender</th>
          <th className="px-4 py-2">Receiver</th>
          <th className="px-4 py-2">Via</th>
          <th className="px-4 py-2">Direction</th>
          <th className="px-4 py-2">Status</th>
          <th className="px-4 py-2">Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr
            key={c.id}
            data-testid="connection-row"
            className="border-b border-surface-800/60 hover:bg-surface-900"
          >
            <td className="px-4 py-2">
              <ObjectCell obj={c.sender} />
            </td>
            <td className="px-4 py-2">
              <ObjectCell obj={c.receiver} />
            </td>
            <td className="px-4 py-2 text-surface-200">
              {c.via ? <ObjectCell obj={c.via} /> : <span className="opacity-40">—</span>}
            </td>
            <td className="px-4 py-2 text-xs text-surface-200">{c.direction}</td>
            <td className="px-4 py-2">
              <span
                className={
                  'rounded px-1.5 py-0.5 text-[10px] font-medium ' +
                  statusBadgeClass(c.status)
                }
              >
                {c.status}
              </span>
            </td>
            <td className="max-w-xs truncate px-4 py-2 text-xs text-surface-200">
              {c.description ?? ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ImpliedTable({
  rows,
  objectMap,
}: {
  rows: ImpliedConnection[];
  objectMap: Map<string, ModelObject>;
}) {
  if (rows.length === 0) {
    return (
      <div className="p-6 text-sm text-surface-200">
        No implied edges at this level. Try another projection level.
      </div>
    );
  }
  return (
    <table className="w-full border-collapse text-sm" data-testid="implied-table">
      <thead className="sticky top-0 bg-surface-900 text-left text-xs uppercase tracking-wider text-surface-200">
        <tr>
          <th className="px-4 py-2">Sender</th>
          <th className="px-4 py-2">Receiver</th>
          <th className="px-4 py-2">Self-loop</th>
          <th className="px-4 py-2">Sources</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const sender = objectMap.get(r.senderId);
          const receiver = objectMap.get(r.receiverId);
          return (
            <tr
              key={`${r.senderId}->${r.receiverId}-${i}`}
              data-testid="implied-row"
              className="border-b border-surface-800/60 hover:bg-surface-900"
            >
              <td className="px-4 py-2">
                {sender ? (
                  <ObjectCell obj={sender} />
                ) : (
                  <span className="text-surface-200">{r.senderId}</span>
                )}
              </td>
              <td className="px-4 py-2">
                {receiver ? (
                  <ObjectCell obj={receiver} />
                ) : (
                  <span className="text-surface-200">{r.receiverId}</span>
                )}
              </td>
              <td className="px-4 py-2 text-xs text-surface-200">
                {r.selfLoop ? 'yes' : ''}
              </td>
              <td className="px-4 py-2 text-xs text-surface-200">
                {r.sourceConnectionIds.length}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ObjectCell({ obj }: { obj: ModelObject }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={typeTextClass(obj.type)}>{typeGlyph(obj.type)}</span>
      <span className="text-surface-100">{obj.name}</span>
      <span className="font-mono text-[10px] text-surface-200">{obj.type}</span>
    </span>
  );
}
