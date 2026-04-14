import type { ModelObject } from './api.ts';

/**
 * Turn a flat list of ModelObjects into the flattened "visible rows" a
 * virtualized list wants to render. The caller owns the expanded-set so
 * toggling a node is a pure state update, not a DOM-dependent operation.
 *
 * Output is depth-sorted so parents always appear immediately above
 * their children (stable within a level by name).
 */

export interface TreeRow {
  id: string;
  object: ModelObject;
  depth: 0 | 1 | 2;
  hasChildren: boolean;
  expanded: boolean;
}

const TYPE_ORDER = ['ACTOR', 'SYSTEM', 'APP', 'STORE', 'COMPONENT'] as const;

export function buildTree(
  objects: readonly ModelObject[],
  expanded: ReadonlySet<string>,
): TreeRow[] {
  const byParent = new Map<string | null, ModelObject[]>();
  for (const obj of objects) {
    const parentKey = obj.parentId;
    const list = byParent.get(parentKey);
    if (list) list.push(obj);
    else byParent.set(parentKey, [obj]);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type as (typeof TYPE_ORDER)[number]);
      const bi = TYPE_ORDER.indexOf(b.type as (typeof TYPE_ORDER)[number]);
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
  }

  const rows: TreeRow[] = [];
  const walk = (parentId: string | null, depth: 0 | 1 | 2) => {
    const children = byParent.get(parentId);
    if (!children) return;
    for (const obj of children) {
      const hasChildren = (byParent.get(obj.id) ?? []).length > 0;
      const isExpanded = expanded.has(obj.id);
      rows.push({
        id: obj.id,
        object: obj,
        depth,
        hasChildren,
        expanded: isExpanded,
      });
      if (hasChildren && isExpanded && depth < 2) {
        walk(obj.id, (depth + 1) as 0 | 1 | 2);
      }
    }
  };
  walk(null, 0);
  return rows;
}

/** Expand every row that has any children — the "expand all" button. */
export function allExpandableIds(objects: readonly ModelObject[]): Set<string> {
  const byParent = new Map<string | null, ModelObject[]>();
  for (const obj of objects) {
    const list = byParent.get(obj.parentId);
    if (list) list.push(obj);
    else byParent.set(obj.parentId, [obj]);
  }
  const out = new Set<string>();
  for (const obj of objects) {
    if ((byParent.get(obj.id) ?? []).length > 0) out.add(obj.id);
  }
  return out;
}
