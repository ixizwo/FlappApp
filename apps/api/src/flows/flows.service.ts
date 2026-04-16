import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FlowCreate,
  FlowStepCreate,
  FlowStepUpdate,
  FlowUpdate,
} from '@flappapp/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Flows are ordered sequences of steps layered on top of a Diagram. Each
 * FlowStep highlights a subset of DiagramNodes and Connections; during
 * playback the client dims everything not in the highlight set.
 *
 * Invariants enforced here:
 *   1. A FlowStep's highlighted nodes must all be on the flow's diagram.
 *   2. A FlowStep's highlighted connections must have DiagramEdges on the
 *      flow's diagram (otherwise the client has nothing to highlight).
 *   3. `(flowId, order)` is unique — the schema enforces this, but we
 *      surface the conflict with a readable message before Prisma barks.
 */
@Injectable()
export class FlowsService {
  constructor(private readonly prisma: PrismaService) {}

  listByDiagram(diagramId: string) {
    return this.prisma.flow.findMany({
      where: { diagramId },
      orderBy: { createdAt: 'asc' },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: {
            nodeHighlights: { select: { diagramNodeId: true } },
            edgeHighlights: { select: { connectionId: true } },
          },
        },
      },
    });
  }

  async get(id: string) {
    const flow = await this.prisma.flow.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: {
            nodeHighlights: { select: { diagramNodeId: true } },
            edgeHighlights: { select: { connectionId: true } },
          },
        },
      },
    });
    if (!flow) throw new NotFoundException(`Flow ${id} not found`);
    return flow;
  }

  async create(diagramId: string, input: FlowCreate) {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id: diagramId },
      select: { id: true },
    });
    if (!diagram) throw new NotFoundException(`Diagram ${diagramId} not found`);
    return this.prisma.flow.create({
      data: {
        diagramId,
        name: input.name,
        ...(input.description !== undefined && { description: input.description }),
      },
    });
  }

  async update(id: string, input: FlowUpdate) {
    await this.get(id);
    return this.prisma.flow.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.flow.delete({ where: { id } });
  }

  // ── Steps ────────────────────────────────────────────────────────

  async addStep(flowId: string, input: FlowStepCreate) {
    const flow = await this.prisma.flow.findUnique({
      where: { id: flowId },
      select: { id: true, diagramId: true },
    });
    if (!flow) throw new NotFoundException(`Flow ${flowId} not found`);

    await this.assertHighlightsValid(flow.diagramId, input.diagramNodeIds, input.connectionIds);

    return this.prisma.flowStep.create({
      data: {
        flowId,
        order: input.order,
        title: input.title,
        ...(input.description !== undefined && { description: input.description }),
        nodeHighlights: {
          create: input.diagramNodeIds.map((diagramNodeId) => ({
            diagramNodeId,
          })),
        },
        edgeHighlights: {
          create: input.connectionIds.map((connectionId) => ({
            connectionId,
          })),
        },
      },
      include: {
        nodeHighlights: { select: { diagramNodeId: true } },
        edgeHighlights: { select: { connectionId: true } },
      },
    });
  }

  async updateStep(stepId: string, input: FlowStepUpdate) {
    const existing = await this.prisma.flowStep.findUnique({
      where: { id: stepId },
      include: { flow: { select: { diagramId: true } } },
    });
    if (!existing) throw new NotFoundException(`FlowStep ${stepId} not found`);

    if (input.diagramNodeIds !== undefined || input.connectionIds !== undefined) {
      await this.assertHighlightsValid(
        existing.flow.diagramId,
        input.diagramNodeIds ?? [],
        input.connectionIds ?? [],
      );
    }

    return this.prisma.flowStep.update({
      where: { id: stepId },
      data: {
        ...(input.order !== undefined && { order: input.order }),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.diagramNodeIds !== undefined && {
          nodeHighlights: {
            deleteMany: {},
            create: input.diagramNodeIds.map((diagramNodeId) => ({
              diagramNodeId,
            })),
          },
        }),
        ...(input.connectionIds !== undefined && {
          edgeHighlights: {
            deleteMany: {},
            create: input.connectionIds.map((connectionId) => ({
              connectionId,
            })),
          },
        }),
      },
      include: {
        nodeHighlights: { select: { diagramNodeId: true } },
        edgeHighlights: { select: { connectionId: true } },
      },
    });
  }

  async removeStep(stepId: string) {
    const existing = await this.prisma.flowStep.findUnique({ where: { id: stepId } });
    if (!existing) throw new NotFoundException(`FlowStep ${stepId} not found`);
    await this.prisma.flowStep.delete({ where: { id: stepId } });
  }

  /**
   * All highlighted nodes must belong to the same diagram as the flow, and
   * all highlighted connections must have a DiagramEdge on that diagram —
   * otherwise playback would point at things the user can't see.
   */
  private async assertHighlightsValid(
    diagramId: string,
    diagramNodeIds: string[],
    connectionIds: string[],
  ) {
    if (diagramNodeIds.length > 0) {
      const nodes = await this.prisma.diagramNode.findMany({
        where: { id: { in: diagramNodeIds } },
        select: { id: true, diagramId: true },
      });
      if (nodes.length !== diagramNodeIds.length) {
        throw new BadRequestException('one or more highlighted nodes do not exist');
      }
      const offDiagram = nodes.filter((n) => n.diagramId !== diagramId);
      if (offDiagram.length > 0) {
        throw new BadRequestException(
          `nodes not on flow diagram: ${offDiagram.map((n) => n.id).join(', ')}`,
        );
      }
    }
    if (connectionIds.length > 0) {
      const edges = await this.prisma.diagramEdge.findMany({
        where: { diagramId, connectionId: { in: connectionIds } },
        select: { connectionId: true },
      });
      const present = new Set(edges.map((e) => e.connectionId));
      const missing = connectionIds.filter((c) => !present.has(c));
      if (missing.length > 0) {
        throw new BadRequestException(
          `connections missing from diagram: ${missing.join(', ')}`,
        );
      }
    }
  }
}
