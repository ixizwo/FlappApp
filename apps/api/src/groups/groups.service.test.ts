import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GroupKind } from '@flappapp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { GroupsService } from './groups.service.js';

/**
 * Phase 5 — service-level tests for GroupsService. We stub Prisma with
 * enough surface area to exercise the cross-diagram and cycle guards.
 */

interface FakeGroup {
  id: string;
  diagramId: string;
  parentGroupId: string | null;
}

function makeStub(opts: {
  diagram?: { id: string } | null;
  groupsById?: Record<string, FakeGroup>;
  nodeById?: Record<string, { id: string; diagramId: string }>;
}) {
  const diagramFindUnique = vi.fn().mockResolvedValue(opts.diagram ?? null);
  const groupFindUnique = vi
    .fn()
    .mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(opts.groupsById?.[where.id] ?? null),
    );
  const diagramNodeFindUnique = vi
    .fn()
    .mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(opts.nodeById?.[where.id] ?? null),
    );
  const groupCreate = vi.fn().mockResolvedValue({ id: 'new-group' });
  const groupUpdate = vi.fn().mockResolvedValue({ id: 'updated' });
  const diagramNodeUpdate = vi.fn().mockResolvedValue({ id: 'node-updated' });
  const prisma = {
    diagram: { findUnique: diagramFindUnique },
    group: {
      findUnique: groupFindUnique,
      create: groupCreate,
      update: groupUpdate,
    },
    diagramNode: {
      findUnique: diagramNodeFindUnique,
      update: diagramNodeUpdate,
    },
  } as unknown as PrismaService;
  return {
    prisma,
    groupCreate,
    groupUpdate,
    diagramNodeUpdate,
  };
}

describe('GroupsService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a top-level group on an existing diagram', async () => {
    const { prisma, groupCreate } = makeStub({ diagram: { id: 'd1' } });
    const svc = new GroupsService(prisma);
    await svc.create('d1', {
      name: 'Prod VPC',
      kind: GroupKind.VPC,
      autosize: true,
    });
    expect(groupCreate).toHaveBeenCalledOnce();
  });

  it('rejects nested groups whose parent lives on a different diagram', async () => {
    const { prisma, groupCreate } = makeStub({
      diagram: { id: 'd1' },
      groupsById: {
        'other-g': { id: 'other-g', diagramId: 'd2', parentGroupId: null },
      },
    });
    const svc = new GroupsService(prisma);
    await expect(
      svc.create('d1', {
        name: 'Child',
        kind: GroupKind.LOGICAL,
        autosize: true,
        parentGroupId: 'other-g',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(groupCreate).not.toHaveBeenCalled();
  });

  it('404s when the diagram does not exist', async () => {
    const { prisma } = makeStub({ diagram: null });
    const svc = new GroupsService(prisma);
    await expect(
      svc.create('missing', {
        name: 'x',
        kind: GroupKind.LOGICAL,
        autosize: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('GroupsService.update (nesting cycle guard)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a group reparenting itself', async () => {
    const { prisma, groupUpdate } = makeStub({
      groupsById: {
        g1: { id: 'g1', diagramId: 'd1', parentGroupId: null },
      },
    });
    const svc = new GroupsService(prisma);
    await expect(
      svc.update('g1', { parentGroupId: 'g1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(groupUpdate).not.toHaveBeenCalled();
  });

  it('rejects a reparent that walks back to the group via ancestors', async () => {
    // g1 -> g2 -> g3 currently. Trying to reparent g1 under g3 would cycle.
    const { prisma, groupUpdate } = makeStub({
      groupsById: {
        g1: { id: 'g1', diagramId: 'd1', parentGroupId: null },
        g2: { id: 'g2', diagramId: 'd1', parentGroupId: 'g1' },
        g3: { id: 'g3', diagramId: 'd1', parentGroupId: 'g2' },
      },
    });
    const svc = new GroupsService(prisma);
    await expect(
      svc.update('g1', { parentGroupId: 'g3' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(groupUpdate).not.toHaveBeenCalled();
  });

  it('accepts a legal reparent within the same diagram', async () => {
    // g2 -> g1 is fine: g1 has no parents of its own.
    const { prisma, groupUpdate } = makeStub({
      groupsById: {
        g1: { id: 'g1', diagramId: 'd1', parentGroupId: null },
        g2: { id: 'g2', diagramId: 'd1', parentGroupId: null },
      },
    });
    const svc = new GroupsService(prisma);
    await svc.update('g2', { parentGroupId: 'g1' });
    expect(groupUpdate).toHaveBeenCalledOnce();
  });
});

describe('GroupsService.assignMembership', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects assigning a node to a group on another diagram', async () => {
    const { prisma, diagramNodeUpdate } = makeStub({
      nodeById: { n1: { id: 'n1', diagramId: 'd1' } },
      groupsById: { g1: { id: 'g1', diagramId: 'd2', parentGroupId: null } },
    });
    const svc = new GroupsService(prisma);
    await expect(
      svc.assignMembership({ diagramNodeId: 'n1', groupId: 'g1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(diagramNodeUpdate).not.toHaveBeenCalled();
  });

  it('allows detaching a node by setting groupId to null', async () => {
    const { prisma, diagramNodeUpdate } = makeStub({
      nodeById: { n1: { id: 'n1', diagramId: 'd1' } },
    });
    const svc = new GroupsService(prisma);
    await svc.assignMembership({ diagramNodeId: 'n1', groupId: null });
    expect(diagramNodeUpdate).toHaveBeenCalledOnce();
  });
});
