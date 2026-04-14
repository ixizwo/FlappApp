import { describe, expect, it } from 'vitest';
import { ObjectType } from './c4.js';
import {
  ConcreteConnection,
  ModelObjectNode,
  descendantIds,
  resolveImpliedConnections,
} from './implied-connections.js';

/**
 * Phase 4 perf smoke.
 *
 * The implied-connection resolver runs on every canvas render that shows
 * "Implied" edges, so it's on the hot path. This test builds a ~2k-node
 * fixture (matching PLAN.md §Phase 4's "2k-node fixture perf smoke test"
 * requirement) and asserts the resolver finishes within a generous time
 * budget. Failure here means we've regressed an O(n²) pattern into the
 * walk somehow — investigate before merging.
 *
 * The fixture shape: 100 Systems, each with 10 Apps, each with 2
 * Components → 2100 nodes total. Every Component connects to another
 * Component in the next System, producing ~2000 concrete connections
 * that all project to distinct System-level implied edges at L1.
 */

const SYSTEMS = 100;
const APPS_PER_SYSTEM = 10;
const COMPS_PER_APP = 2;

function buildFixture() {
  const objects = new Map<string, ModelObjectNode>();
  const systems: string[] = [];
  const components: string[] = [];

  for (let s = 0; s < SYSTEMS; s++) {
    const sysId = `sys-${s}`;
    systems.push(sysId);
    objects.set(sysId, { id: sysId, type: ObjectType.SYSTEM, parentId: null });
    for (let a = 0; a < APPS_PER_SYSTEM; a++) {
      const appId = `${sysId}-app-${a}`;
      objects.set(appId, { id: appId, type: ObjectType.APP, parentId: sysId });
      for (let c = 0; c < COMPS_PER_APP; c++) {
        const compId = `${appId}-comp-${c}`;
        objects.set(compId, {
          id: compId,
          type: ObjectType.COMPONENT,
          parentId: appId,
        });
        components.push(compId);
      }
    }
  }

  const connections: ConcreteConnection[] = [];
  // Each component → the first component of the next system. This gives
  // every concrete connection a distinct (senderSystem, receiverSystem)
  // pair for components inside different systems, so the resolver
  // exercises both walk + dedup paths.
  for (let i = 0; i < components.length; i++) {
    const sender = components[i]!;
    const nextSystem = (Math.floor(i / (APPS_PER_SYSTEM * COMPS_PER_APP)) + 1) % SYSTEMS;
    const receiver = `sys-${nextSystem}-app-0-comp-0`;
    if (sender === receiver) continue;
    connections.push({ id: `c-${i}`, senderId: sender, receiverId: receiver });
  }

  return { objects, connections, systemCount: systems.length };
}

describe('resolveImpliedConnections perf', () => {
  it('handles a 2k-node fixture under budget', () => {
    const { objects, connections } = buildFixture();

    expect(objects.size).toBeGreaterThanOrEqual(2100);
    expect(connections.length).toBeGreaterThanOrEqual(1900);

    const start = performance.now();
    const implied = resolveImpliedConnections(1, objects, connections);
    const elapsed = performance.now() - start;

    // Sanity: the L1 projection must dedupe down to at most SYSTEMS-1
    // pairs (every component → the first component of the next system).
    expect(implied.length).toBeLessThanOrEqual(SYSTEMS);
    expect(implied.length).toBeGreaterThan(0);

    // Budget: 500ms is generous — typical runs finish in <30ms. This
    // is a regression guard, not a micro-benchmark.
    expect(elapsed).toBeLessThan(500);
  });

  it('descendantIds on a deep tree stays linear', () => {
    const { objects } = buildFixture();
    const rootSys = 'sys-0';
    const start = performance.now();
    const descendants = descendantIds(rootSys, objects);
    const elapsed = performance.now() - start;

    // sys-0 has APPS_PER_SYSTEM apps + APPS_PER_SYSTEM * COMPS_PER_APP
    // components = 10 + 20 = 30 descendants.
    expect(descendants.size).toBe(APPS_PER_SYSTEM + APPS_PER_SYSTEM * COMPS_PER_APP);
    expect(elapsed).toBeLessThan(100);
  });
});
