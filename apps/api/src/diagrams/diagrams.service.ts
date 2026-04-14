import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DiagramCreate,
  DiagramEdgeCreate,
  DiagramEdgeUpdate,
  DiagramNodeCreate,
  DiagramNodeUpdate,
  DiagramUpdate,
  levelOf,
  ObjectType,
} from '@flappapp/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Diagrams + DiagramNodes + DiagramEdges.
 *
 * Diagrams are **views** over the model: nothing here owns identity for a
 * ModelObject or Connection. The service enforces three rules:
 *   1. A DiagramNode must reference a ModelObject in the same Domain as the
 *      Diagram, and whose C4 level matches (or is below) the diagram level.
 *   2. A DiagramEdge's Connection endpoints must both already have nodes
 *      on the same Diagram — you can't draw an edge to nothing.
 *   3. `(diagram, modelObject)` and `(diagram, connection)` tuples are
 *      unique (the Prisma schema enforces this, we surface 409 on clash).
 */
@Injectable()
export class DiagramsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Diagram CRUD ─────────────────────────────────────────────────

  async list(domainId: string) {
    return this.prisma.diagram.findMany({
      where: { domainId },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      include: {
        _count: { select: { nodes: true, edges: true } },
      },
    });
  }

  async get(id: string) {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id },
      include: {
        nodes: {
          include: { modelObject: { include: { techChoice: true } } },
        },
        edges: {
          include: {
            connection: {
              include: { sender: true, receiver: true, via: true },
            },
          },
        },
      },
    });
    if (!diagram) throw new NotFoundException(`Diagram ${id} not found`);
    return diagram;
  }

  async create(input: DiagramCreate) {
    if (input.scopeObjectId) {
      const scope = await this.prisma.modelObject.findUnique({
        where: { id: input.scopeObjectId },
        select: { id: true, domainId: true, type: true },
      });
      if (!scope) {
        throw new BadRequestException(`scopeObjectId ${input.scopeObjectId} does not exist`);
      }
      if (scope.domainId !== input.domainId) {
        throw new BadRequestException('scope object must live in the diagram domain');
      }
    }
    return this.prisma.diagram.create({
      data: {
        domainId: input.domainId,
        name: input.name,
        level: input.level,
        scopeObjectId: input.scopeObjectId ?? null,
        pinned: input.pinned,
      },
    });
  }

  async update(id: string, input: DiagramUpdate) {
    await this.get(id);
    return this.prisma.diagram.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.pinned !== undefined && { pinned: input.pinned }),
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.diagram.delete({ where: { id } });
  }

  // ── Node CRUD ────────────────────────────────────────────────────

  async addNode(diagramId: string, input: DiagramNodeCreate) {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id: diagramId },
      select: { id: true, domainId: true, level: true },
    });
    if (!diagram) throw new NotFoundException(`Diagram ${diagramId} not found`);

    const obj = await this.prisma.modelObject.findUnique({
      where: { id: input.modelObjectId },
      select: { id: true, domainId: true, type: true },
    });
    if (!obj) {
      throw new BadRequestException(`modelObject ${input.modelObjectId} does not exist`);
    }
    if (obj.domainId !== diagram.domainId) {
      throw new BadRequestException('model object must belong to the diagram domain');
    }
    const objLevel = levelOf(obj.type as ObjectType);
    if (objLevel > diagram.level) {
      throw new BadRequestException(
        `level ${objLevel} object cannot be placed on a level ${diagram.level} diagram`,
      );
    }

    try {
      return await this.prisma.diagramNode.create({
        data: {
          diagramId,
          modelObjectId: input.modelObjectId,
          x: input.x,
          y: input.y,
          ...(input.w !== undefined && { w: input.w }),
          ...(input.h !== undefined && { h: input.h }),
          ...(input.groupId !== undefined && { groupId: input.groupId }),
        },
        include: { modelObject: { include: { techChoice: true } } },
      });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          `object ${input.modelObjectId} is already on diagram ${diagramId}`,
        );
      }
      throw err;
    }
  }

  async updateNode(nodeId: string, input: DiagramNodeUpdate) {
    const existing = await this.prisma.diagramNode.findUnique({ where: { id: nodeId } });
    if (!existing) throw new NotFoundException(`DiagramNode ${nodeId} not found`);
    return this.prisma.diagramNode.update({
      where: { id: nodeId },
      data: {
        ...(input.x !== undefined && { x: input.x }),
        ...(input.y !== undefined && { y: input.y }),
        ...(input.w !== undefined && { w: input.w }),
        ...(input.h !== undefined && { h: input.h }),
        ...(input.groupId !== undefined && { groupId: input.groupId }),
      },
      include: { modelObject: { include: { techChoice: true } } },
    });
  }

  async removeNode(nodeId: string) {
    const existing = await this.prisma.diagramNode.findUnique({ where: { id: nodeId } });
    if (!existing) throw new NotFoundException(`DiagramNode ${nodeId} not found`);
    await this.prisma.diagramNode.delete({ where: { id: nodeId } });
  }

  // ── Edge CRUD ────────────────────────────────────────────────────

  async addEdge(diagramId: string, input: DiagramEdgeCreate) {
    const [diagram, connection] = await Promise.all([
      this.prisma.diagram.findUnique({
        where: { id: diagramId },
        select: { id: true, domainId: true },
      }),
      this.prisma.connection.findUnique({
        where: { id: input.connectionId },
        select: {
          id: true,
          senderId: true,
          receiverId: true,
          viaId: true,
          sender: { select: { domainId: true } },
        },
      }),
    ]);
    if (!diagram) throw new NotFoundException(`Diagram ${diagramId} not found`);
    if (!connection) {
      throw new BadRequestException(`connection ${input.connectionId} does not exist`);
    }
    if (connection.sender.domainId !== diagram.domainId) {
      throw new BadRequestException('connection must belong to the diagram domain');
    }

    // Both endpoints need to be on the diagram before an edge can be drawn.
    const required = [connection.senderId, connection.receiverId];
    const nodes = await this.prisma.diagramNode.findMany({
      where: { diagramId, modelObjectId: { in: required } },
      select: { modelObjectId: true },
    });
    const present = new Set(nodes.map((n) => n.modelObjectId));
    const missing = required.filter((id) => !present.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `endpoints not on diagram: ${missing.join(', ')}`,
      );
    }

    try {
      return await this.prisma.diagramEdge.create({
        data: {
          diagramId,
          connectionId: input.connectionId,
          ...(input.sourceHandle !== undefined && { sourceHandle: input.sourceHandle }),
          ...(input.targetHandle !== undefined && { targetHandle: input.targetHandle }),
          ...(input.waypoints !== undefined && { waypoints: input.waypoints }),
        },
        include: {
          connection: {
            include: { sender: true, receiver: true, via: true },
          },
        },
      });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          `connection ${input.connectionId} already has an edge on diagram ${diagramId}`,
        );
      }
      throw err;
    }
  }

  async updateEdge(edgeId: string, input: DiagramEdgeUpdate) {
    const existing = await this.prisma.diagramEdge.findUnique({ where: { id: edgeId } });
    if (!existing) throw new NotFoundException(`DiagramEdge ${edgeId} not found`);
    return this.prisma.diagramEdge.update({
      where: { id: edgeId },
      data: {
        ...(input.sourceHandle !== undefined && { sourceHandle: input.sourceHandle }),
        ...(input.targetHandle !== undefined && { targetHandle: input.targetHandle }),
        ...(input.waypoints !== undefined && { waypoints: input.waypoints }),
      },
    });
  }

  async removeEdge(edgeId: string) {
    const existing = await this.prisma.diagramEdge.findUnique({ where: { id: edgeId } });
    if (!existing) throw new NotFoundException(`DiagramEdge ${edgeId} not found`);
    await this.prisma.diagramEdge.delete({ where: { id: edgeId } });
  }
}
