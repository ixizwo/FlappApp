import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import { __handlesForTypeForTests } from './c4-nodes.tsx';

/**
 * The PRD's "12 anchor points" rule (6 for Actors) is correctness-critical:
 * edge routing in later phases assumes every non-Actor exposes 12 handles
 * at fixed offsets. These tests pin the layout to avoid accidental drift.
 */
describe('handlesForType', () => {
  it('returns 12 handles for SYSTEM', () => {
    expect(__handlesForTypeForTests('SYSTEM')).toHaveLength(12);
  });

  it('returns 12 handles for APP, STORE, COMPONENT', () => {
    expect(__handlesForTypeForTests('APP')).toHaveLength(12);
    expect(__handlesForTypeForTests('STORE')).toHaveLength(12);
    expect(__handlesForTypeForTests('COMPONENT')).toHaveLength(12);
  });

  it('returns 6 handles for ACTOR (dropped t1 and b1 middles)', () => {
    const actor = __handlesForTypeForTests('ACTOR');
    expect(actor).toHaveLength(6);
    expect(actor.find((h) => h.id === 't1')).toBeUndefined();
    expect(actor.find((h) => h.id === 'b1')).toBeUndefined();
  });

  it('distributes handles evenly along each side', () => {
    const sys = __handlesForTypeForTests('SYSTEM');
    const top = sys.filter((h) => h.position === Position.Top);
    expect(top.map((h) => h.offset)).toEqual([25, 50, 75]);
  });
});
