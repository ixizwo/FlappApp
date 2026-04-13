import { C4Level, levelOf, ObjectType } from './c4.js';

/**
 * Implied / lower connections.
 *
 * Per PRD §4.1: "If a low-level component in System A communicates with an
 * app in System B, a top-level connection must automatically be inferred
 * between System A and System B at Level 1."
 *
 * This module is the canonical resolver used by both the API service layer
 * and the canvas (for rendering dashed "inferred" edges). It is pure TS so
 * it can be unit-tested exhaustively and property-tested against random
 * hierarchies without touching a database.
 */

export interface ModelObjectNode {
  id: string;
  type: ObjectType;
  /** Null when the object has no parent (Actors, top-level Systems). */
  parentId: string | null;
}

export interface ConcreteConnection {
  id: string;
  senderId: string;
  receiverId: string;
  /** Optional routing via an intermediary object (e.g. Kafka topic). */
  viaId?: string | null;
}

export interface ImpliedConnection {
  /** Projected sender at the requested level. */
  senderId: string;
  /** Projected receiver at the requested level. */
  receiverId: string;
  /** The concrete lower-level connection(s) this projection rolls up. */
  sourceConnectionIds: string[];
  /** True when sender and receiver are identical after projection
   *  (self-loops are filtered by default). */
  selfLoop: boolean;
}

/**
 * Walk a ModelObject up to the ancestor whose level is `targetLevel`.
 * Returns the ancestor's id, or null if no such ancestor exists
 * (e.g. projecting a System to level 3 is a no-op).
 */
export function ancestorAtLevel(
  objectId: string,
  targetLevel: C4Level,
  objects: ReadonlyMap<string, ModelObjectNode>,
): string | null {
  let current = objects.get(objectId);
  if (!current) return null;

  // Walk up while we're below the target level.
  while (current && levelOf(current.type) > targetLevel) {
    if (!current.parentId) return null;
    current = objects.get(current.parentId);
  }

  if (!current) return null;
  // If we've arrived at a level higher than requested it means no ancestor
  // exists at that exact level (can happen if the hierarchy skips — it
  // shouldn't under the C4 rules, but we guard anyway).
  if (levelOf(current.type) !== targetLevel) return null;
  return current.id;
}

export interface ResolveImpliedOptions {
  /** If true (default) drop implied connections where sender === receiver. */
  dropSelfLoops?: boolean;
}

/**
 * Given all objects and all concrete connections, project the connection
 * set up to `targetLevel` and return the deduplicated implied connections.
 *
 * The `via` object does not participate in projection — it is only relevant
 * at its native level.
 */
export function resolveImpliedConnections(
  targetLevel: C4Level,
  objects: ReadonlyMap<string, ModelObjectNode>,
  connections: readonly ConcreteConnection[],
  options: ResolveImpliedOptions = {},
): ImpliedConnection[] {
  const dropSelfLoops = options.dropSelfLoops ?? true;
  const byPair = new Map<string, ImpliedConnection>();

  for (const conn of connections) {
    const projSender = ancestorAtLevel(conn.senderId, targetLevel, objects);
    const projReceiver = ancestorAtLevel(conn.receiverId, targetLevel, objects);
    if (!projSender || !projReceiver) continue;

    const isSelf = projSender === projReceiver;
    if (isSelf && dropSelfLoops) continue;

    const key = `${projSender}→${projReceiver}`;
    const existing = byPair.get(key);
    if (existing) {
      existing.sourceConnectionIds.push(conn.id);
    } else {
      byPair.set(key, {
        senderId: projSender,
        receiverId: projReceiver,
        sourceConnectionIds: [conn.id],
        selfLoop: isSelf,
      });
    }
  }

  return [...byPair.values()];
}

/**
 * Convenience: given an object id, return all its descendant ids (inclusive
 * or exclusive of the root). Used by the Dependencies view and by
 * "Delete from Model" impact warnings.
 */
export function descendantIds(
  rootId: string,
  objects: ReadonlyMap<string, ModelObjectNode>,
  { includeRoot = false }: { includeRoot?: boolean } = {},
): Set<string> {
  // Build a children adjacency on the fly (O(n) — fine for realistic sizes,
  // callers can memoize if they care).
  const children = new Map<string, string[]>();
  for (const obj of objects.values()) {
    if (obj.parentId) {
      const arr = children.get(obj.parentId);
      if (arr) arr.push(obj.id);
      else children.set(obj.parentId, [obj.id]);
    }
  }

  const out = new Set<string>();
  const stack: string[] = [rootId];
  if (includeRoot) out.add(rootId);

  while (stack.length) {
    const id = stack.pop()!;
    const kids = children.get(id);
    if (!kids) continue;
    for (const kid of kids) {
      if (!out.has(kid)) {
        out.add(kid);
        stack.push(kid);
      }
    }
  }
  return out;
}
