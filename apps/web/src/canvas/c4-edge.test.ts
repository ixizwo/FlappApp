import { describe, expect, it } from 'vitest';
import {
  ConnectionDirection,
  LineShape,
  ObjectStatus,
} from '@flappapp/shared';
import { __markersForTests, __strokeForTests } from './c4-edge.tsx';

/**
 * Phase 4 edges encode Connection.direction / status / lineShape visually.
 * These tests pin the mapping so the PRD "read it at a glance" rule holds
 * as we touch the stroke/marker logic in later phases.
 */
describe('c4-edge strokeFor', () => {
  it('uses the indigo implied palette when implied=true', () => {
    const s = __strokeForTests(ObjectStatus.LIVE, true);
    expect(s.color).toBe('#818cf8');
    expect(s.dashArray).toBe('6 4');
    expect(s.opacity).toBeLessThan(1);
  });

  it('renders deprecated connections dashed + amber', () => {
    const s = __strokeForTests(ObjectStatus.DEPRECATED, false);
    expect(s.color).toBe('#f59e0b');
    expect(s.dashArray).toBe('4 2');
  });

  it('renders live connections solid', () => {
    const s = __strokeForTests(ObjectStatus.LIVE, false);
    expect(s.dashArray).toBeUndefined();
    expect(s.opacity).toBe(1);
  });

  it('fades removed connections heavily', () => {
    const s = __strokeForTests(ObjectStatus.REMOVED, false);
    expect(s.opacity).toBeLessThanOrEqual(0.5);
  });
});

describe('c4-edge markersFor', () => {
  it('omits both markers when direction is NONE', () => {
    const m = __markersForTests(ConnectionDirection.NONE, false);
    expect(m.start).toBeUndefined();
    expect(m.end).toBeUndefined();
  });

  it('puts an arrow only at the target for OUTGOING', () => {
    const m = __markersForTests(ConnectionDirection.OUTGOING, false);
    expect(m.start).toBeUndefined();
    expect(m.end).toBeTruthy();
  });

  it('puts arrows at both ends for BIDIRECTIONAL', () => {
    const m = __markersForTests(ConnectionDirection.BIDIRECTIONAL, false);
    expect(m.start).toBeTruthy();
    expect(m.end).toBeTruthy();
  });

  it('uses the implied marker for implied edges', () => {
    const m = __markersForTests(ConnectionDirection.OUTGOING, true);
    expect(m.end).toContain('implied');
  });
});

// Sanity: confirm we handle all LineShape values (pin the enum surface).
describe('c4-edge LineShape enum coverage', () => {
  it('enumerates the 3 expected shapes', () => {
    expect(Object.keys(LineShape)).toEqual(['CURVED', 'STRAIGHT', 'SQUARE']);
  });
});
