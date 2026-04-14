import { describe, expect, it } from 'vitest';
import type { ModelObject } from './api.ts';
import { allExpandableIds, buildTree } from './build-tree.ts';

function obj(
  id: string,
  name: string,
  type: ModelObject['type'],
  parentId: string | null,
): ModelObject {
  return {
    id,
    domainId: 'dom',
    parentId,
    type,
    name,
    internal: true,
    status: 'LIVE',
    displayDescription: null,
    detailedDescriptionMd: null,
    techChoiceId: null,
    techChoice: null,
    tagLinks: [],
    createdAt: '',
    updatedAt: '',
  };
}

const fixture: ModelObject[] = [
  obj('user', 'Customer', 'ACTOR', null),
  obj('sys', 'Checkout System', 'SYSTEM', null),
  obj('sys2', 'Payments', 'SYSTEM', null),
  obj('app', 'Web App', 'APP', 'sys'),
  obj('api', 'Checkout API', 'APP', 'sys'),
  obj('db', 'Orders DB', 'STORE', 'sys'),
  obj('cart', 'CartController', 'COMPONENT', 'api'),
  obj('pay', 'PaymentService', 'COMPONENT', 'api'),
];

describe('buildTree', () => {
  it('returns only top-level rows when nothing is expanded', () => {
    const rows = buildTree(fixture, new Set());
    expect(rows.map((r) => r.id)).toEqual(['user', 'sys', 'sys2']);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
  });

  it('sorts by C4 type (Actor < System < App < Store < Component), then by name', () => {
    const rows = buildTree(fixture, new Set(['sys']));
    // Inside sys: APP(api,app) -> STORE(db). Within APP, alphabetical: Checkout API, Web App.
    const inside = rows.filter((r) => r.depth === 1).map((r) => r.object.name);
    expect(inside).toEqual(['Checkout API', 'Web App', 'Orders DB']);
  });

  it('descends into expanded children up to depth 2', () => {
    const rows = buildTree(fixture, new Set(['sys', 'api']));
    const names = rows.map((r) => `${r.depth}:${r.object.name}`);
    // Components appear at depth 2 under Checkout API
    expect(names).toContain('2:CartController');
    expect(names).toContain('2:PaymentService');
  });

  it('marks hasChildren correctly', () => {
    const rows = buildTree(fixture, new Set(['sys']));
    const map = Object.fromEntries(rows.map((r) => [r.id, r.hasChildren]));
    expect(map.sys).toBe(true);
    expect(map.api).toBe(true); // has components
    expect(map.app).toBe(false); // Web App has no children in fixture
    expect(map.db).toBe(false);
  });
});

describe('allExpandableIds', () => {
  it('returns the set of every node that has at least one child', () => {
    expect(allExpandableIds(fixture)).toEqual(new Set(['sys', 'api']));
  });
});
