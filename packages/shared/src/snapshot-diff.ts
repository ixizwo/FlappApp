/**
 * Phase 6 — domain snapshot diff.
 *
 * Compares two `DomainPayload` instances (or a payload against live) and
 * produces a human-readable list of changes grouped by entity type. The
 * diff viewer renders this in the web UI; the promote-draft flow uses it
 * to preview what changes would land.
 *
 * The algorithm is straightforward: index both sides by id, then walk
 * through added / removed / modified items comparing the JSON fields.
 */
import type { DomainPayload } from './schemas.js';

export interface DiffEntry {
  /** Entity kind — matches the top-level keys of DomainPayload. */
  kind: 'object' | 'connection' | 'diagram';
  id: string;
  name: string;
  change: 'added' | 'removed' | 'modified';
  /** Field-level changes for 'modified' entries. */
  fields?: { field: string; from: unknown; to: unknown }[];
}

export interface DomainDiff {
  entries: DiffEntry[];
  stats: {
    added: number;
    removed: number;
    modified: number;
  };
}

function indexById<T extends { id: string }>(arr: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const item of arr) m.set(item.id, item);
  return m;
}

function diffFields(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  skip: Set<string>,
): { field: string; from: unknown; to: unknown }[] {
  const changes: { field: string; from: unknown; to: unknown }[] = [];
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of allKeys) {
    if (skip.has(k)) continue;
    const va = a[k];
    const vb = b[k];
    if (JSON.stringify(va) !== JSON.stringify(vb)) {
      changes.push({ field: k, from: va, to: vb });
    }
  }
  return changes;
}

function nameOf(item: Record<string, unknown>): string {
  return (item.name as string) ?? (item.id as string) ?? '?';
}

/**
 * Compute the diff between two DomainPayload snapshots.
 *
 * @param before The "old" state (e.g. last snapshot or live).
 * @param after  The "new" state (e.g. draft payload or current live).
 */
export function diffPayloads(
  before: DomainPayload,
  after: DomainPayload,
): DomainDiff {
  const entries: DiffEntry[] = [];

  const SKIP = new Set(['id']);

  // Objects
  const objBefore = indexById(before.objects);
  const objAfter = indexById(after.objects);
  for (const [id, obj] of objAfter) {
    const old = objBefore.get(id);
    if (!old) {
      entries.push({ kind: 'object', id, name: nameOf(obj as unknown as Record<string, unknown>), change: 'added' });
    } else {
      const fields = diffFields(
        old as unknown as Record<string, unknown>,
        obj as unknown as Record<string, unknown>,
        SKIP,
      );
      if (fields.length > 0) {
        entries.push({ kind: 'object', id, name: nameOf(obj as unknown as Record<string, unknown>), change: 'modified', fields });
      }
    }
  }
  for (const [id, obj] of objBefore) {
    if (!objAfter.has(id)) {
      entries.push({ kind: 'object', id, name: nameOf(obj as unknown as Record<string, unknown>), change: 'removed' });
    }
  }

  // Connections
  const connBefore = indexById(before.connections);
  const connAfter = indexById(after.connections);
  for (const [id, conn] of connAfter) {
    const old = connBefore.get(id);
    if (!old) {
      entries.push({ kind: 'connection', id, name: `${conn.senderId} → ${conn.receiverId}`, change: 'added' });
    } else {
      const fields = diffFields(
        old as unknown as Record<string, unknown>,
        conn as unknown as Record<string, unknown>,
        SKIP,
      );
      if (fields.length > 0) {
        entries.push({ kind: 'connection', id, name: `${conn.senderId} → ${conn.receiverId}`, change: 'modified', fields });
      }
    }
  }
  for (const [id, conn] of connBefore) {
    if (!connAfter.has(id)) {
      entries.push({ kind: 'connection', id, name: `${conn.senderId} → ${conn.receiverId}`, change: 'removed' });
    }
  }

  // Diagrams
  const diagBefore = indexById(before.diagrams);
  const diagAfter = indexById(after.diagrams);
  for (const [id, diag] of diagAfter) {
    const old = diagBefore.get(id);
    if (!old) {
      entries.push({ kind: 'diagram', id, name: nameOf(diag as unknown as Record<string, unknown>), change: 'added' });
    } else {
      const fields = diffFields(
        old as unknown as Record<string, unknown>,
        diag as unknown as Record<string, unknown>,
        SKIP,
      );
      if (fields.length > 0) {
        entries.push({ kind: 'diagram', id, name: nameOf(diag as unknown as Record<string, unknown>), change: 'modified', fields });
      }
    }
  }
  for (const [id, diag] of diagBefore) {
    if (!diagAfter.has(id)) {
      entries.push({ kind: 'diagram', id, name: nameOf(diag as unknown as Record<string, unknown>), change: 'removed' });
    }
  }

  const stats = {
    added: entries.filter((e) => e.change === 'added').length,
    removed: entries.filter((e) => e.change === 'removed').length,
    modified: entries.filter((e) => e.change === 'modified').length,
  };

  return { entries, stats };
}
