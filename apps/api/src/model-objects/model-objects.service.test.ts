import { BadRequestException } from '@nestjs/common';
import { ObjectStatus, ObjectType } from '@flappapp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ModelObjectsService } from './model-objects.service.js';

/**
 * Service-level tests for the C4 hierarchy enforcement. We don't run
 * against a real database — instead we stub PrismaService with the exact
 * shape the service touches. This keeps the tests hermetic and runnable
 * in CI without a Postgres container.
 */

interface FakeParent {
  id: string;
  domainId: string;
  type: ObjectType;
}

function makePrismaStub(parentRow: FakeParent | null) {
  const created = vi.fn().mockResolvedValue({
    id: 'generated-id',
    tagLinks: [],
    techChoice: null,
  });
  const findUnique = vi.fn().mockResolvedValue(parentRow);

  return {
    prisma: {
      modelObject: {
        findUnique,
        create: created,
      },
    } as unknown as PrismaService,
    findUnique,
    create: created,
  };
}

const baseCreateDto = {
  tagIds: [] as string[],
  links: [] as { label: string; url: string }[],
  metadata: {} as Record<string, unknown>,
  internal: true,
  status: ObjectStatus.LIVE,
};

describe('ModelObjectsService C4 validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts an APP whose parent is a SYSTEM in the same domain', async () => {
    const { prisma, create, findUnique } = makePrismaStub({
      id: 'sys-1',
      domainId: 'dom-1',
      type: ObjectType.SYSTEM,
    });
    const svc = new ModelObjectsService(prisma);

    await svc.create({
      ...baseCreateDto,
      domainId: 'dom-1',
      parentId: 'sys-1',
      type: ObjectType.APP,
      name: 'Web App',
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'sys-1' },
      select: { id: true, domainId: true, type: true },
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it('rejects an APP whose parent is another APP', async () => {
    const { prisma, create } = makePrismaStub({
      id: 'app-parent',
      domainId: 'dom-1',
      type: ObjectType.APP,
    });
    const svc = new ModelObjectsService(prisma);

    await expect(
      svc.create({
        ...baseCreateDto,
        domainId: 'dom-1',
        parentId: 'app-parent',
        type: ObjectType.APP,
        name: 'Nested',
      }),
    ).rejects.toThrow(/Invalid C4 parent\/child/);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an APP whose parent is in a different domain', async () => {
    const { prisma, create } = makePrismaStub({
      id: 'sys-in-other-domain',
      domainId: 'dom-2',
      type: ObjectType.SYSTEM,
    });
    const svc = new ModelObjectsService(prisma);

    await expect(
      svc.create({
        ...baseCreateDto,
        domainId: 'dom-1',
        parentId: 'sys-in-other-domain',
        type: ObjectType.APP,
        name: 'Web App',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an APP with parentId pointing at a non-existent object', async () => {
    const { prisma, create } = makePrismaStub(null);
    const svc = new ModelObjectsService(prisma);

    await expect(
      svc.create({
        ...baseCreateDto,
        domainId: 'dom-1',
        parentId: 'missing',
        type: ObjectType.APP,
        name: 'Web App',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a SYSTEM that is given a parent', async () => {
    const { prisma, create } = makePrismaStub({
      id: 'sys-parent',
      domainId: 'dom-1',
      type: ObjectType.SYSTEM,
    });
    const svc = new ModelObjectsService(prisma);

    await expect(
      svc.create({
        ...baseCreateDto,
        domainId: 'dom-1',
        parentId: 'sys-parent',
        type: ObjectType.SYSTEM,
        name: 'Nested System',
      }),
    ).rejects.toThrow(/Invalid C4 parent\/child/);
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts a top-level SYSTEM with parentId = null', async () => {
    const { prisma, create, findUnique } = makePrismaStub(null);
    const svc = new ModelObjectsService(prisma);

    await svc.create({
      ...baseCreateDto,
      domainId: 'dom-1',
      parentId: null,
      type: ObjectType.SYSTEM,
      name: 'Top-level',
    });

    // When parentId is null we never hit the DB for the parent.
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
  });
});
