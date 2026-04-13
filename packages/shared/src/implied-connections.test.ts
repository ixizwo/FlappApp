import { describe, expect, it } from 'vitest';
import { ObjectType } from './c4.js';
import {
  ModelObjectNode,
  ancestorAtLevel,
  descendantIds,
  resolveImpliedConnections,
} from './implied-connections.js';

/**
 * Fixture:
 *
 *   sysA (L1)                 sysB (L1)
 *   ├── appA1 (L2)            ├── appB1 (L2)
 *   │   └── compA1a (L3)      │   └── compB1a (L3)
 *   └── storeA1 (L2)          └── storeB1 (L2)
 *
 *   Actor "user" (L1, no parent)
 */
const objects = new Map<string, ModelObjectNode>([
  ['user', { id: 'user', type: ObjectType.ACTOR, parentId: null }],
  ['sysA', { id: 'sysA', type: ObjectType.SYSTEM, parentId: null }],
  ['sysB', { id: 'sysB', type: ObjectType.SYSTEM, parentId: null }],
  ['appA1', { id: 'appA1', type: ObjectType.APP, parentId: 'sysA' }],
  ['storeA1', { id: 'storeA1', type: ObjectType.STORE, parentId: 'sysA' }],
  ['compA1a', { id: 'compA1a', type: ObjectType.COMPONENT, parentId: 'appA1' }],
  ['appB1', { id: 'appB1', type: ObjectType.APP, parentId: 'sysB' }],
  ['storeB1', { id: 'storeB1', type: ObjectType.STORE, parentId: 'sysB' }],
  ['compB1a', { id: 'compB1a', type: ObjectType.COMPONENT, parentId: 'appB1' }],
]);

describe('ancestorAtLevel', () => {
  it('finds the System ancestor of a Component', () => {
    expect(ancestorAtLevel('compA1a', 1, objects)).toBe('sysA');
    expect(ancestorAtLevel('compB1a', 1, objects)).toBe('sysB');
  });

  it('finds the App ancestor of a Component', () => {
    expect(ancestorAtLevel('compA1a', 2, objects)).toBe('appA1');
  });

  it('returns the object itself when its level matches', () => {
    expect(ancestorAtLevel('sysA', 1, objects)).toBe('sysA');
    expect(ancestorAtLevel('appA1', 2, objects)).toBe('appA1');
  });

  it('returns null when projecting upwards beyond an orphan', () => {
    // An Actor at L1 cannot be projected to L2 or L3.
    expect(ancestorAtLevel('user', 2, objects)).toBe(null);
    expect(ancestorAtLevel('user', 3, objects)).toBe(null);
  });

  it('returns null for unknown ids', () => {
    expect(ancestorAtLevel('does-not-exist', 1, objects)).toBe(null);
  });
});

describe('resolveImpliedConnections', () => {
  it('lifts a component→component connection to the System level', () => {
    const connections = [
      { id: 'c1', senderId: 'compA1a', receiverId: 'compB1a' },
    ];
    const implied = resolveImpliedConnections(1, objects, connections);
    expect(implied).toEqual([
      {
        senderId: 'sysA',
        receiverId: 'sysB',
        sourceConnectionIds: ['c1'],
        selfLoop: false,
      },
    ]);
  });

  it('deduplicates multiple lower connections into one implied edge', () => {
    const connections = [
      { id: 'c1', senderId: 'compA1a', receiverId: 'appB1' },
      { id: 'c2', senderId: 'storeA1', receiverId: 'storeB1' },
      { id: 'c3', senderId: 'appA1', receiverId: 'compB1a' },
    ];
    const implied = resolveImpliedConnections(1, objects, connections);
    expect(implied).toHaveLength(1);
    expect(implied[0]!.senderId).toBe('sysA');
    expect(implied[0]!.receiverId).toBe('sysB');
    expect(implied[0]!.sourceConnectionIds.sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('drops self-loops by default (intra-system communication)', () => {
    const connections = [
      { id: 'c1', senderId: 'compA1a', receiverId: 'storeA1' },
    ];
    expect(resolveImpliedConnections(1, objects, connections)).toEqual([]);
  });

  it('keeps self-loops when asked', () => {
    const connections = [
      { id: 'c1', senderId: 'compA1a', receiverId: 'storeA1' },
    ];
    const implied = resolveImpliedConnections(1, objects, connections, {
      dropSelfLoops: false,
    });
    expect(implied).toHaveLength(1);
    expect(implied[0]!.selfLoop).toBe(true);
  });

  it('projects an Actor → System connection cleanly', () => {
    const connections = [{ id: 'c1', senderId: 'user', receiverId: 'appA1' }];
    const implied = resolveImpliedConnections(1, objects, connections);
    expect(implied).toEqual([
      {
        senderId: 'user',
        receiverId: 'sysA',
        sourceConnectionIds: ['c1'],
        selfLoop: false,
      },
    ]);
  });

  it('skips connections whose endpoints cannot project to the target level', () => {
    // sysA has no L3 ancestor — projection should drop this.
    const connections = [{ id: 'c1', senderId: 'sysA', receiverId: 'compB1a' }];
    expect(resolveImpliedConnections(3, objects, connections)).toEqual([]);
  });
});

describe('descendantIds', () => {
  it('returns all descendants of a System', () => {
    const d = descendantIds('sysA', objects);
    expect([...d].sort()).toEqual(['appA1', 'compA1a', 'storeA1']);
  });

  it('includes the root when asked', () => {
    const d = descendantIds('sysA', objects, { includeRoot: true });
    expect(d.has('sysA')).toBe(true);
  });

  it('returns empty for a leaf', () => {
    expect(descendantIds('compA1a', objects).size).toBe(0);
  });
});
