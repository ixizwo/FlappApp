import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupCreate,
  GroupMembership,
  GroupUpdate,
} from '@flappapp/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Groups are visual containers on a Diagram. Phase 5 adds nestable groups
 * (parent-child) and optional autosize that recomputes `x/y/w/h` to fit the
 * group's current child nodes on the server side so every client sees the
 * same bounding box.
 *
 * The service enforces:
 *   1. `parentGroupId`, when set, must live on the same diagram.
 *   2. Nesting is acyclic — a group cannot be its own ancestor.
 *   3. DiagramNode reassignments must keep the node on the same diagram
 *      as the target group.
 */
@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  list(diagramId: string) {
    return this.prisma.group.findMany({
      where: { diagramId },
      orderBy: { name: 'asc' },
      include: { nodes: { select: { id: true } } },
    });
  }

  async get(id: string) {
    const g = await this.prisma.group.findUnique({
      where: { id },
      include: { nodes: { select: { id: true } } },
    });
    if (!g) throw new NotFoundException(`Group ${id} not found`);
    return g;
  }

  async create(diagramId: string, input: GroupCreate) {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id: diagramId },
      select: { id: true },
    });
    if (!diagram) throw new NotFoundException(`Diagram ${diagramId} not found`);

    if (input.parentGroupId) {
      const parent = await this.prisma.group.findUnique({
        where: { id: input.parentGroupId },
        select: { id: true, diagramId: true },
      });
      if (!parent) {
        throw new BadRequestException(
          `parentGroupId ${input.parentGroupId} does not exist`,
        );
      }
      if (parent.diagramId !== diagramId) {
        throw new BadRequestException(
          'parent group must live on the same diagram',
        );
      }
    }

    return this.prisma.group.create({
      data: {
        diagramId,
        name: input.name,
        kind: input.kind,
        autosize: input.autosize,
        ...(input.parentGroupId !== undefined && {
          parentGroupId: input.parentGroupId,
        }),
        ...(input.x !== undefined && { x: input.x }),
        ...(input.y !== undefined && { y: input.y }),
        ...(input.w !== undefined && { w: input.w }),
        ...(input.h !== undefined && { h: input.h }),
      },
    });
  }

  async update(id: string, input: GroupUpdate) {
    const existing = await this.get(id);

    if (input.parentGroupId !== undefined && input.parentGroupId !== null) {
      if (input.parentGroupId === id) {
        throw new BadRequestException('a group cannot be its own parent');
      }
      const parent = await this.prisma.group.findUnique({
        where: { id: input.parentGroupId },
        select: { id: true, diagramId: true, parentGroupId: true },
      });
      if (!parent) {
        throw new BadRequestException(
          `parentGroupId ${input.parentGroupId} does not exist`,
        );
      }
      if (parent.diagramId !== existing.diagramId) {
        throw new BadRequestException(
          'parent group must live on the same diagram',
        );
      }
      // Walk up the chain to prevent cycles. Bounded by group depth on the
      // diagram, which in practice is at most a handful of levels deep.
      let cursor: { id: string; parentGroupId: string | null } | null = parent;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor.id === id) {
          throw new BadRequestException('parent assignment would create a cycle');
        }
        if (seen.has(cursor.id)) break;
        seen.add(cursor.id);
        if (!cursor.parentGroupId) break;
        cursor = await this.prisma.group.findUnique({
          where: { id: cursor.parentGroupId },
          select: { id: true, parentGroupId: true },
        });
      }
    }

    return this.prisma.group.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.kind !== undefined && { kind: input.kind }),
        ...(input.parentGroupId !== undefined && {
          parentGroupId: input.parentGroupId,
        }),
        ...(input.autosize !== undefined && { autosize: input.autosize }),
        ...(input.x !== undefined && { x: input.x }),
        ...(input.y !== undefined && { y: input.y }),
        ...(input.w !== undefined && { w: input.w }),
        ...(input.h !== undefined && { h: input.h }),
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    // Cascading to child groups is handled by the Prisma onDelete: Cascade
    // on the self-relation, but DiagramNodes point back with SetNull so the
    // nodes simply become unassigned overlays instead of disappearing.
    await this.prisma.group.delete({ where: { id } });
  }

  /**
   * Reassign a single DiagramNode to a group (or detach with `groupId: null`).
   * Uses the same cross-diagram guard as `create` so a group from diagram A
   * can never adopt a node from diagram B.
   */
  async assignMembership(input: GroupMembership) {
    const node = await this.prisma.diagramNode.findUnique({
      where: { id: input.diagramNodeId },
      select: { id: true, diagramId: true },
    });
    if (!node) {
      throw new NotFoundException(
        `DiagramNode ${input.diagramNodeId} not found`,
      );
    }
    if (input.groupId) {
      const group = await this.prisma.group.findUnique({
        where: { id: input.groupId },
        select: { id: true, diagramId: true },
      });
      if (!group) {
        throw new BadRequestException(`group ${input.groupId} does not exist`);
      }
      if (group.diagramId !== node.diagramId) {
        throw new BadRequestException(
          'group and node must live on the same diagram',
        );
      }
    }
    return this.prisma.diagramNode.update({
      where: { id: input.diagramNodeId },
      data: { groupId: input.groupId },
    });
  }
}
