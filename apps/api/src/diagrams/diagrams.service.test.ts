import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ObjectType } from '@flappapp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { DiagramsService } from './diagrams.service.js';

/**
 * Service-level tests for DiagramsService. We stub PrismaService with just
 * the fields the service reads and assert on the shape of the calls,
 * rather than spinning up Postgres.
 */

interface FakeDiagram {
  id: string;
  domainId: string;
  level: 1 | 2 | 3;
}

interface FakeObject {
  id: string;
  domainId: string;
  type: ObjectType;
}

function makePrismaStub(opts: {
  diagram?: FakeDiagram | null;
  modelObject?: FakeObject | null;
  connection?: {
    id: string;
    senderId: string;
    receiverId: string;
    viaId: string | null;
    sender: { domainId: string };
  } | null;
  existingNodeIds?: string[];
}) {
  const diagramNodeCreate = vi.fn().mockResolvedValue({ id: 'new-node' });
  const diagramEdgeCreate = vi.fn().mockResolvedValue({ id: 'new-edge' });
  const diagramFindUnique = vi.fn().mockResolvedValue(opts.diagram ?? null);
  const modelObjectFindUnique = vi.fn().mockResolvedValue(opts.modelObject ?? null);
  const connectionFindUnique = vi.fn().mockResolvedValue(opts.connection ?? null);
  const diagramNodeFindMany = vi
    .fn()
    .mockResolvedValue((opts.existingNodeIds ?? []).map((id) => ({ modelObjectId: id })));

  const prisma = {
    diagram: { findUnique: diagramFindUnique },
    modelObject: { findUnique: modelObjectFindUnique },
    connection: { findUnique: connectionFindUnique },
    diagramNode: {
      findMany: diagramNodeFindMany,
      create: diagramNodeCreate,
    },
    diagramEdge: { create: diagramEdgeCreate },
  } as unknown as PrismaService;

  return { prisma, diagramNodeCreate, diagramEdgeCreate };
}

describe('DiagramsService.addNode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a matching-level object into its diagram', async () => {
    const { prisma, diagramNodeCreate } = makePrismaStub({
      diagram: { id: 'd1', domainId: 'dom-1', level: 1 },
      modelObject: { id: 'sys-1', domainId: 'dom-1', type: ObjectType.SYSTEM },
    });
    const svc = new DiagramsService(prisma);
    await svc.addNode('d1', { modelObjectId: 'sys-1', x: 10, y: 20 });
    expect(diagramNodeCreate).toHaveBeenCalledOnce();
  });

  it('rejects a higher-level object placed on a lower-level diagram', async () => {
    const { prisma, diagramNodeCreate } = makePrismaStub({
      diagram: { id: 'd1', domainId: 'dom-1', level: 1 },
      // COMPONENT is level 3 — cannot live on a level 1 diagram.
      modelObject: { id: 'cmp-1', domainId: 'dom-1', type: ObjectType.COMPONENT },
    });
    const svc = new DiagramsService(prisma);
    await expect(
      svc.addNode('d1', { modelObjectId: 'cmp-1', x: 0, y: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(diagramNodeCreate).not.toHaveBeenCalled();
  });

  it('rejects an object from another domain', async () => {
    const { prisma, diagramNodeCreate } = makePrismaStub({
      diagram: { id: 'd1', domainId: 'dom-1', level: 1 },
      modelObject: { id: 'sys-x', domainId: 'dom-other', type: ObjectType.SYSTEM },
    });
    const svc = new DiagramsService(prisma);
    await expect(
      svc.addNode('d1', { modelObjectId: 'sys-x', x: 0, y: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(diagramNodeCreate).not.toHaveBeenCalled();
  });

  it('404s when the diagram does not exist', async () => {
    const { prisma } = makePrismaStub({ diagram: null });
    const svc = new DiagramsService(prisma);
    await expect(
      svc.addNode('missing', { modelObjectId: 'x', x: 0, y: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DiagramsService.addEdge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an edge when both endpoints already have nodes on the diagram', async () => {
    const { prisma, diagramEdgeCreate } = makePrismaStub({
      diagram: { id: 'd1', domainId: 'dom-1', level: 1 },
      connection: {
        id: 'c1',
        senderId: 's1',
        receiverId: 'r1',
        viaId: null,
        sender: { domainId: 'dom-1' },
      },
      existingNodeIds: ['s1', 'r1'],
    });
    const svc = new DiagramsService(prisma);
    await svc.addEdge('d1', { connectionId: 'c1' });
    expect(diagramEdgeCreate).toHaveBeenCalledOnce();
  });

  it('rejects an edge when an endpoint is missing from the diagram', async () => {
    const { prisma, diagramEdgeCreate } = makePrismaStub({
      diagram: { id: 'd1', domainId: 'dom-1', level: 1 },
      connection: {
        id: 'c1',
        senderId: 's1',
        receiverId: 'r1',
        viaId: null,
        sender: { domainId: 'dom-1' },
      },
      existingNodeIds: ['s1'], // r1 missing
    });
    const svc = new DiagramsService(prisma);
    await expect(
      svc.addEdge('d1', { connectionId: 'c1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(diagramEdgeCreate).not.toHaveBeenCalled();
  });
});
