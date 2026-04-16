import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SnapshotsService } from './snapshots.service.js';

/**
 * Phase 6 — SnapshotsService tests. We verify version auto-increment
 * and the captureLive → payload shape.
 */

function makeStub(opts: {
  domain?: { id: string } | null;
  latestVersion?: number | null;
  objects?: unknown[];
  connections?: unknown[];
  diagrams?: unknown[];
}) {
  const domainFindUnique = vi.fn().mockResolvedValue(opts.domain ?? null);
  const snapshotFindFirst = vi.fn().mockResolvedValue(
    opts.latestVersion != null ? { version: opts.latestVersion } : null,
  );
  const snapshotCreate = vi.fn().mockImplementation(({ data }: any) =>
    Promise.resolve({ id: 'snap-new', ...data }),
  );
  const modelObjectFindMany = vi.fn().mockResolvedValue(
    (opts.objects ?? []).map((o: any) => ({ ...o, tagLinks: o.tagLinks ?? [] })),
  );
  const connectionFindMany = vi.fn().mockResolvedValue(opts.connections ?? []);
  const diagramFindMany = vi.fn().mockResolvedValue(opts.diagrams ?? []);
  const snapshotFindUnique = vi.fn().mockResolvedValue(null);
  const snapshotFindMany = vi.fn().mockResolvedValue([]);

  const prisma = {
    domain: { findUnique: domainFindUnique },
    snapshot: {
      findFirst: snapshotFindFirst,
      findUnique: snapshotFindUnique,
      findMany: snapshotFindMany,
      create: snapshotCreate,
    },
    modelObject: { findMany: modelObjectFindMany },
    connection: { findMany: connectionFindMany },
    diagram: { findMany: diagramFindMany },
  } as unknown as PrismaService;

  return { prisma, snapshotCreate };
}

describe('SnapshotsService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('auto-increments version from the latest snapshot', async () => {
    const { prisma, snapshotCreate } = makeStub({
      domain: { id: 'dom-1' },
      latestVersion: 3,
      objects: [
        { id: 'o1', parentId: null, type: 'SYSTEM', name: 'S1', internal: true, status: 'LIVE', displayDescription: null, techChoiceId: null },
      ],
    });
    const svc = new SnapshotsService(prisma);
    await svc.create('dom-1', { name: 'v4' });
    expect(snapshotCreate).toHaveBeenCalledOnce();
    const data = snapshotCreate.mock.calls[0]![0].data;
    expect(data.version).toBe(4);
  });

  it('starts at version 1 when no snapshots exist', async () => {
    const { prisma, snapshotCreate } = makeStub({
      domain: { id: 'dom-1' },
      latestVersion: null,
    });
    const svc = new SnapshotsService(prisma);
    await svc.create('dom-1', { name: 'Initial' });
    expect(snapshotCreate.mock.calls[0]![0].data.version).toBe(1);
  });

  it('404s when the domain does not exist', async () => {
    const { prisma } = makeStub({ domain: null });
    const svc = new SnapshotsService(prisma);
    await expect(
      svc.create('missing', { name: 'fail' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SnapshotsService.captureLive', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shapes the live model into a DomainPayload', async () => {
    const { prisma } = makeStub({
      domain: { id: 'dom-1' },
      objects: [
        {
          id: 'o1',
          parentId: null,
          type: 'SYSTEM',
          name: 'Gateway',
          internal: true,
          status: 'LIVE',
          displayDescription: 'desc',
          techChoiceId: 'tc1',
          tagLinks: [{ tagId: 'tag-1' }],
        },
      ],
      connections: [
        {
          id: 'c1',
          senderId: 'o1',
          receiverId: 'o2',
          viaId: null,
          direction: 'OUTGOING',
          status: 'LIVE',
          lineShape: 'CURVED',
          description: null,
        },
      ],
      diagrams: [
        { id: 'd1', name: 'Context', level: 1, scopeObjectId: null, pinned: false },
      ],
    });
    const svc = new SnapshotsService(prisma);
    const payload = await svc.captureLive('dom-1');

    expect(payload.objects).toHaveLength(1);
    expect(payload.objects[0]!.name).toBe('Gateway');
    expect(payload.objects[0]!.tagIds).toEqual(['tag-1']);
    expect(payload.connections).toHaveLength(1);
    expect(payload.diagrams).toHaveLength(1);
  });
});
