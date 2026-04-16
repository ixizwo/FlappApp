import { describe, expect, it } from 'vitest';
import {
  ConnectionDirection,
  LineShape,
  ObjectStatus,
  ObjectType,
} from './c4.js';
import type { DomainPayload } from './schemas.js';
import { diffPayloads } from './snapshot-diff.js';

const EMPTY: DomainPayload = { objects: [], connections: [], diagrams: [] };

function basePayload(): DomainPayload {
  return {
    objects: [
      {
        id: 'sys-1',
        parentId: null,
        type: ObjectType.SYSTEM,
        name: 'Gateway',
        internal: true,
        status: ObjectStatus.LIVE,
        displayDescription: null,
        techChoiceId: null,
        tagIds: [],
      },
    ],
    connections: [
      {
        id: 'c-1',
        senderId: 'sys-1',
        receiverId: 'sys-2',
        viaId: null,
        direction: ConnectionDirection.OUTGOING,
        status: ObjectStatus.LIVE,
        lineShape: LineShape.CURVED,
        description: null,
      },
    ],
    diagrams: [
      { id: 'd-1', name: 'Context', level: 1, scopeObjectId: null, pinned: false },
    ],
  };
}

describe('diffPayloads', () => {
  it('detects no changes between identical payloads', () => {
    const a = basePayload();
    const b = basePayload();
    const diff = diffPayloads(a, b);
    expect(diff.entries).toHaveLength(0);
    expect(diff.stats).toEqual({ added: 0, removed: 0, modified: 0 });
  });

  it('detects added objects', () => {
    const after = basePayload();
    after.objects.push({
      id: 'sys-2',
      parentId: null,
      type: ObjectType.SYSTEM,
      name: 'Auth',
      internal: true,
      status: ObjectStatus.LIVE,
      displayDescription: null,
      techChoiceId: null,
      tagIds: [],
    });
    const diff = diffPayloads(basePayload(), after);
    expect(diff.stats.added).toBe(1);
    expect(diff.entries.find((e) => e.id === 'sys-2')?.change).toBe('added');
  });

  it('detects removed connections', () => {
    const before = basePayload();
    const after = basePayload();
    after.connections = [];
    const diff = diffPayloads(before, after);
    expect(diff.stats.removed).toBe(1);
    expect(diff.entries.find((e) => e.id === 'c-1')?.change).toBe('removed');
  });

  it('detects modified fields on objects', () => {
    const before = basePayload();
    const after = basePayload();
    after.objects[0]!.name = 'API Gateway';
    after.objects[0]!.status = ObjectStatus.DEPRECATED;
    const diff = diffPayloads(before, after);
    expect(diff.stats.modified).toBe(1);
    const mod = diff.entries.find((e) => e.id === 'sys-1');
    expect(mod?.change).toBe('modified');
    expect(mod?.fields).toEqual(
      expect.arrayContaining([
        { field: 'name', from: 'Gateway', to: 'API Gateway' },
        { field: 'status', from: 'LIVE', to: 'DEPRECATED' },
      ]),
    );
  });

  it('detects modified diagram', () => {
    const before = basePayload();
    const after = basePayload();
    after.diagrams[0]!.pinned = true;
    const diff = diffPayloads(before, after);
    expect(diff.stats.modified).toBe(1);
    const mod = diff.entries.find((e) => e.id === 'd-1');
    expect(mod?.fields?.[0]).toMatchObject({ field: 'pinned', from: false, to: true });
  });

  it('handles diff from empty to populated', () => {
    const after = basePayload();
    const diff = diffPayloads(EMPTY, after);
    expect(diff.stats.added).toBe(3); // 1 object + 1 connection + 1 diagram
    expect(diff.stats.removed).toBe(0);
    expect(diff.stats.modified).toBe(0);
  });

  it('handles diff from populated to empty', () => {
    const before = basePayload();
    const diff = diffPayloads(before, EMPTY);
    expect(diff.stats.removed).toBe(3);
    expect(diff.stats.added).toBe(0);
  });
});
