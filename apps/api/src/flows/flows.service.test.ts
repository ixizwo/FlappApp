import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { FlowsService } from './flows.service.js';

/**
 * Phase 5 — service-level tests for FlowsService. The highlight validator
 * is the interesting surface: we want to be sure we don't let users pin a
 * flow step to a node/edge that isn't visible on the diagram.
 */

function makeStub(opts: {
  flowsById?: Record<string, { id: string; diagramId: string }>;
  diagram?: { id: string } | null;
  nodes?: { id: string; diagramId: string }[];
  edges?: { connectionId: string; diagramId: string }[];
}) {
  const flowFindUnique = vi
    .fn()
    .mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(opts.flowsById?.[where.id] ?? null),
    );
  const diagramFindUnique = vi.fn().mockResolvedValue(opts.diagram ?? null);
  const nodeFindMany = vi.fn().mockImplementation(({ where }: any) => {
    const ids = where.id.in as string[];
    return Promise.resolve((opts.nodes ?? []).filter((n) => ids.includes(n.id)));
  });
  const edgeFindMany = vi.fn().mockImplementation(({ where }: any) => {
    const ids = where.connectionId.in as string[];
    return Promise.resolve(
      (opts.edges ?? []).filter(
        (e) => ids.includes(e.connectionId) && e.diagramId === where.diagramId,
      ),
    );
  });
  const flowStepCreate = vi.fn().mockResolvedValue({ id: 'step-new' });
  const flowCreate = vi.fn().mockResolvedValue({ id: 'flow-new' });
  const prisma = {
    flow: { findUnique: flowFindUnique, create: flowCreate },
    diagram: { findUnique: diagramFindUnique },
    diagramNode: { findMany: nodeFindMany },
    diagramEdge: { findMany: edgeFindMany },
    flowStep: { create: flowStepCreate },
  } as unknown as PrismaService;
  return { prisma, flowStepCreate, flowCreate };
}

describe('FlowsService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('404s when the diagram does not exist', async () => {
    const { prisma } = makeStub({ diagram: null });
    const svc = new FlowsService(prisma);
    await expect(
      svc.create('d-missing', { name: 'User login' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('persists a flow scoped to the diagram', async () => {
    const { prisma, flowCreate } = makeStub({ diagram: { id: 'd1' } });
    const svc = new FlowsService(prisma);
    await svc.create('d1', { name: 'Checkout' });
    expect(flowCreate).toHaveBeenCalledOnce();
  });
});

describe('FlowsService.addStep — highlight validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a highlighted node from another diagram', async () => {
    const { prisma, flowStepCreate } = makeStub({
      flowsById: { f1: { id: 'f1', diagramId: 'd1' } },
      nodes: [
        { id: 'n1', diagramId: 'd1' },
        { id: 'n2', diagramId: 'd2' }, // wrong diagram
      ],
    });
    const svc = new FlowsService(prisma);
    await expect(
      svc.addStep('f1', {
        order: 0,
        title: 'Step 1',
        diagramNodeIds: ['n1', 'n2'],
        connectionIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(flowStepCreate).not.toHaveBeenCalled();
  });

  it('rejects a highlighted connection missing from the diagram', async () => {
    const { prisma, flowStepCreate } = makeStub({
      flowsById: { f1: { id: 'f1', diagramId: 'd1' } },
      edges: [{ connectionId: 'c1', diagramId: 'd1' }],
    });
    const svc = new FlowsService(prisma);
    await expect(
      svc.addStep('f1', {
        order: 0,
        title: 'Step 1',
        diagramNodeIds: [],
        connectionIds: ['c1', 'c-missing'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(flowStepCreate).not.toHaveBeenCalled();
  });

  it('accepts a step whose highlights are all on the flow diagram', async () => {
    const { prisma, flowStepCreate } = makeStub({
      flowsById: { f1: { id: 'f1', diagramId: 'd1' } },
      nodes: [{ id: 'n1', diagramId: 'd1' }],
      edges: [{ connectionId: 'c1', diagramId: 'd1' }],
    });
    const svc = new FlowsService(prisma);
    await svc.addStep('f1', {
      order: 0,
      title: 'Step 1',
      diagramNodeIds: ['n1'],
      connectionIds: ['c1'],
    });
    expect(flowStepCreate).toHaveBeenCalledOnce();
  });
});
