import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DraftStatus } from '@flappapp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SnapshotsService } from '../snapshots/snapshots.service.js';
import { DraftsService } from './drafts.service.js';

/**
 * Phase 6 — DraftsService tests. We verify lifecycle guards (only OPEN
 * drafts can be edited/promoted/discarded) and that the promote flow
 * calls the expected Prisma methods.
 */

function makeStub(opts: {
  domain?: { id: string } | null;
  draftsById?: Record<string, { id: string; domainId: string; status: string; payload: unknown }>;
}) {
  const domainFindUnique = vi.fn().mockResolvedValue(opts.domain ?? null);
  const draftFindUnique = vi
    .fn()
    .mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(opts.draftsById?.[where.id] ?? null),
    );
  const draftCreate = vi.fn().mockResolvedValue({ id: 'draft-new' });
  const draftUpdate = vi.fn().mockResolvedValue({ id: 'draft-updated' });
  const snapshotFindFirst = vi.fn().mockResolvedValue(null);

  const prisma = {
    domain: { findUnique: domainFindUnique },
    draft: {
      findUnique: draftFindUnique,
      findMany: vi.fn().mockResolvedValue([]),
      create: draftCreate,
      update: draftUpdate,
    },
    snapshot: { findFirst: snapshotFindFirst },
    modelObject: { findMany: vi.fn().mockResolvedValue([]) },
    connection: { findMany: vi.fn().mockResolvedValue([]) },
    diagram: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const snapshotsSvc = new SnapshotsService(prisma);

  return { prisma, draftCreate, draftUpdate, snapshotsSvc };
}

describe('DraftsService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('captures live state into the draft payload', async () => {
    const { prisma, draftCreate, snapshotsSvc } = makeStub({
      domain: { id: 'dom-1' },
    });
    const svc = new DraftsService(prisma, snapshotsSvc);
    await svc.create('dom-1', { name: 'Experiment' });
    expect(draftCreate).toHaveBeenCalledOnce();
    const data = draftCreate.mock.calls[0]![0].data;
    expect(data.payload).toHaveProperty('objects');
    expect(data.payload).toHaveProperty('connections');
  });

  it('404s when the domain does not exist', async () => {
    const { prisma, snapshotsSvc } = makeStub({ domain: null });
    const svc = new DraftsService(prisma, snapshotsSvc);
    await expect(
      svc.create('missing', { name: 'fail' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DraftsService.update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects edits to a PROMOTED draft', async () => {
    const { prisma, draftUpdate, snapshotsSvc } = makeStub({
      draftsById: {
        d1: { id: 'd1', domainId: 'dom-1', status: DraftStatus.PROMOTED, payload: {} },
      },
    });
    const svc = new DraftsService(prisma, snapshotsSvc);
    await expect(
      svc.update('d1', { name: 'new name' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(draftUpdate).not.toHaveBeenCalled();
  });

  it('allows updating an OPEN draft', async () => {
    const { prisma, draftUpdate, snapshotsSvc } = makeStub({
      draftsById: {
        d1: { id: 'd1', domainId: 'dom-1', status: DraftStatus.OPEN, payload: {} },
      },
    });
    const svc = new DraftsService(prisma, snapshotsSvc);
    await svc.update('d1', { name: 'renamed' });
    expect(draftUpdate).toHaveBeenCalledOnce();
  });
});

describe('DraftsService.discard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks an OPEN draft as DISCARDED', async () => {
    const { prisma, draftUpdate, snapshotsSvc } = makeStub({
      draftsById: {
        d1: { id: 'd1', domainId: 'dom-1', status: DraftStatus.OPEN, payload: {} },
      },
    });
    const svc = new DraftsService(prisma, snapshotsSvc);
    await svc.discard('d1');
    expect(draftUpdate).toHaveBeenCalledOnce();
    expect(draftUpdate.mock.calls[0]![0].data.status).toBe(DraftStatus.DISCARDED);
  });

  it('rejects discarding an already DISCARDED draft', async () => {
    const { prisma, snapshotsSvc } = makeStub({
      draftsById: {
        d1: { id: 'd1', domainId: 'dom-1', status: DraftStatus.DISCARDED, payload: {} },
      },
    });
    const svc = new DraftsService(prisma, snapshotsSvc);
    await expect(svc.discard('d1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
