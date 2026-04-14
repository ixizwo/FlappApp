import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ObjectStatus, ObjectType } from '@flappapp/shared';
import { ObjectStatus as Status, ObjectType as Type } from '@flappapp/shared';
import { api, type ModelObject } from '../lib/api.ts';
import { allExpandableIds, buildTree, type TreeRow } from '../lib/build-tree.ts';
import { statusBadgeClass, typeGlyph, typeTextClass } from '../lib/ui.ts';

/**
 * Virtualized hierarchical tree of Model Objects scoped to the active
 * Domain. The tree is computed on the client from a flat list returned
 * by /model-objects — this keeps the server simple and lets us filter
 * locally with no extra round-trips.
 *
 * The TanStack Virtual row window keeps rendering cheap even with
 * thousands of objects, satisfying the "canvas virtualization" NFR in
 * the PRD (§5).
 */
export function ModelObjectsView() {
  const { domainId = '' } = useParams<{ domainId: string }>();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ObjectType | ''>('');
  const [statusFilter, setStatusFilter] = useState<ObjectStatus | ''>('');
  const [hasDescription, setHasDescription] = useState<boolean | undefined>(undefined);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'model-objects',
      domainId,
      typeFilter,
      statusFilter,
      hasDescription,
      search,
    ],
    queryFn: () =>
      api.modelObjects.list({
        domainId,
        ...(typeFilter && { type: typeFilter }),
        ...(statusFilter && { status: statusFilter }),
        ...(hasDescription !== undefined && { hasDescription }),
        ...(search && { search }),
      }),
    enabled: !!domainId,
  });

  const rows = useMemo<TreeRow[]>(
    () => (data ? buildTree(data, expanded) : []),
    [data, expanded],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar
        count={data?.length ?? 0}
        search={search}
        onSearch={setSearch}
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        hasDescription={hasDescription}
        onHasDescription={setHasDescription}
        onExpandAll={() => data && setExpanded(allExpandableIds(data))}
        onCollapseAll={() => setExpanded(new Set())}
      />

      {error && (
        <div className="border-b border-rose-900 bg-rose-950/40 px-4 py-2 text-sm text-rose-300">
          Failed to load model objects. Is the API running at /api?
        </div>
      )}

      <div ref={parentRef} className="flex-1 overflow-auto" data-testid="model-tree">
        {isLoading && (
          <div className="p-6 text-sm text-surface-200">Loading model…</div>
        )}
        {!isLoading && rows.length === 0 && (
          <div className="p-6 text-sm text-surface-200">
            No objects match the current filters.
          </div>
        )}
        <div
          style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            return (
              <div
                key={row.id}
                data-testid="tree-row"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${virtualRow.size}px`,
                }}
              >
                <TreeRowView
                  row={row}
                  onToggle={() => toggle(row.id)}
                  domainId={domainId}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Toolbar(props: {
  count: number;
  search: string;
  onSearch: (v: string) => void;
  typeFilter: ObjectType | '';
  onTypeFilter: (v: ObjectType | '') => void;
  statusFilter: ObjectStatus | '';
  onStatusFilter: (v: ObjectStatus | '') => void;
  hasDescription: boolean | undefined;
  onHasDescription: (v: boolean | undefined) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-surface-800 bg-surface-900/40 px-4 py-3">
      <h1 className="mr-4 text-lg font-semibold">Model Objects</h1>
      <input
        type="search"
        value={props.search}
        onChange={(e) => props.onSearch(e.target.value)}
        placeholder="Search by name…"
        className="w-56 rounded border border-surface-800 bg-surface-950 px-2 py-1 text-sm text-surface-100"
        aria-label="Search by name"
      />
      <select
        value={props.typeFilter}
        onChange={(e) => props.onTypeFilter((e.target.value as ObjectType) || '')}
        className="rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-100"
        aria-label="Filter by type"
      >
        <option value="">All types</option>
        {Object.values(Type).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        value={props.statusFilter}
        onChange={(e) => props.onStatusFilter((e.target.value as ObjectStatus) || '')}
        className="rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-100"
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        {Object.values(Status).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs text-surface-200">
        <input
          type="checkbox"
          checked={props.hasDescription === true}
          onChange={(e) => props.onHasDescription(e.target.checked ? true : undefined)}
        />
        Has description
      </label>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-surface-200">{props.count} objects</span>
        <button
          type="button"
          className="rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-100 hover:border-surface-200"
          onClick={props.onExpandAll}
        >
          Expand all
        </button>
        <button
          type="button"
          className="rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-100 hover:border-surface-200"
          onClick={props.onCollapseAll}
        >
          Collapse
        </button>
      </div>
    </div>
  );
}

function TreeRowView({
  row,
  onToggle,
  domainId,
}: {
  row: TreeRow;
  onToggle: () => void;
  domainId: string;
}) {
  const obj = row.object;
  return (
    <div
      className="flex h-9 items-center gap-2 border-b border-surface-800/60 px-2 text-sm hover:bg-surface-900"
      style={{ paddingLeft: 8 + row.depth * 20 }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!row.hasChildren}
        className={clsx(
          'h-5 w-5 shrink-0 rounded text-xs text-surface-200',
          row.hasChildren && 'hover:bg-surface-800',
          !row.hasChildren && 'opacity-0',
        )}
        aria-label={row.expanded ? 'Collapse' : 'Expand'}
        aria-expanded={row.expanded}
      >
        {row.expanded ? '▾' : '▸'}
      </button>
      <span className={clsx('w-5 text-center', typeTextClass(obj.type))}>
        {typeGlyph(obj.type)}
      </span>
      <Link
        to={`/domains/${domainId}/dependencies/${obj.id}`}
        className="truncate text-surface-100 hover:underline"
      >
        {obj.name}
      </Link>
      {obj.displayDescription && (
        <span className="truncate text-xs text-surface-200">
          — {obj.displayDescription}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2">
        {obj.techChoice && (
          <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] text-surface-200">
            {obj.techChoice.name}
          </span>
        )}
        <span
          className={clsx(
            'rounded px-1.5 py-0.5 text-[10px] font-medium',
            statusBadgeClass(obj.status),
          )}
        >
          {obj.status}
        </span>
      </span>
    </div>
  );
}

// Expose the inner row for component tests that want to render without
// the virtualizer layer (which depends on layout measurement in jsdom).
export function __TreeRowViewForTests(props: {
  row: TreeRow;
  onToggle: () => void;
  domainId: string;
}) {
  return <TreeRowView {...props} />;
}

// And the toolbar so its filter wiring can be exercised directly.
export function __ToolbarForTests(props: Parameters<typeof Toolbar>[0]) {
  return <Toolbar {...props} />;
}

// Helper re-export so test files can construct rows without importing
// the pure helper twice.
export function __buildRows(data: ModelObject[], expanded: Set<string>) {
  return buildTree(data, expanded);
}
