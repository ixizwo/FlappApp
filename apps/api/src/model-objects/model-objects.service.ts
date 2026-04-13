import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ModelObjectCreate,
  ModelObjectNode,
  ModelObjectUpdate,
  ObjectStatus,
  ObjectType,
  assertValidParent,
  descendantIds,
} from '@flappapp/shared';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ListModelObjectsFilter {
  domainId: string;
  type?: ObjectType;
  status?: ObjectStatus;
  parentId?: string | null;
  techChoiceId?: string;
  hasDescription?: boolean;
  search?: string;
}

/**
 * The service layer is the single place where C4 hierarchy rules are
 * enforced. Controllers hand us already-zod-validated DTOs, but zod can't
 * check cross-row invariants (e.g. "this parent exists in the same domain
 * and has a compatible type") — that's our job here.
 */
@Injectable()
export class ModelObjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ListModelObjectsFilter) {
    return this.prisma.modelObject.findMany({
      where: {
        domainId: filter.domainId,
        ...(filter.type !== undefined && { type: filter.type }),
        ...(filter.status !== undefined && { status: filter.status }),
        ...(filter.parentId !== undefined && { parentId: filter.parentId }),
        ...(filter.techChoiceId !== undefined && {
          techChoiceId: filter.techChoiceId,
        }),
        ...(filter.hasDescription !== undefined && {
          displayDescription: filter.hasDescription ? { not: null } : null,
        }),
        ...(filter.search && {
          name: { contains: filter.search, mode: 'insensitive' },
        }),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: { techChoice: true, tagLinks: { include: { tag: true } } },
    });
  }

  async get(id: string) {
    const obj = await this.prisma.modelObject.findUnique({
      where: { id },
      include: { techChoice: true, tagLinks: { include: { tag: true } } },
    });
    if (!obj) throw new NotFoundException(`ModelObject ${id} not found`);
    return obj;
  }

  async create(input: ModelObjectCreate) {
    await this.assertParentCompatible(input.domainId, input.parentId, input.type);

    const { tagIds, links, metadata, ...scalar } = input;
    return this.prisma.modelObject.create({
      data: {
        ...scalar,
        links: links as object,
        metadata: metadata as object,
        tagLinks: tagIds.length
          ? { create: tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: { techChoice: true, tagLinks: { include: { tag: true } } },
    });
  }

  async update(id: string, input: ModelObjectUpdate) {
    const existing = await this.get(id);
    const { tagIds, links, metadata, ...scalar } = input;
    return this.prisma.modelObject.update({
      where: { id: existing.id },
      data: {
        ...scalar,
        ...(links !== undefined && { links: links as object }),
        ...(metadata !== undefined && { metadata: metadata as object }),
        ...(tagIds && {
          tagLinks: {
            deleteMany: {},
            create: tagIds.map((tagId) => ({ tagId })),
          },
        }),
      },
      include: { techChoice: true, tagLinks: { include: { tag: true } } },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.modelObject.delete({ where: { id } });
  }

  /**
   * Impact preview for "Delete from Model" — returns every descendant that
   * would also be deleted (cascading) and every connection that references
   * the object or one of its descendants.
   */
  async deletionImpact(id: string) {
    const obj = await this.get(id);
    const allInDomain = await this.prisma.modelObject.findMany({
      where: { domainId: obj.domainId },
      select: { id: true, parentId: true, type: true, name: true },
    });
    const map = new Map<string, ModelObjectNode>();
    for (const o of allInDomain) {
      map.set(o.id, {
        id: o.id,
        type: o.type as ObjectType,
        parentId: o.parentId,
      });
    }

    const descendants = descendantIds(id, map, { includeRoot: true });
    const connections = await this.prisma.connection.findMany({
      where: {
        OR: [
          { senderId: { in: [...descendants] } },
          { receiverId: { in: [...descendants] } },
          { viaId: { in: [...descendants] } },
        ],
      },
    });

    return {
      objectIds: [...descendants],
      connectionIds: connections.map((c) => c.id),
    };
  }

  /**
   * Verify that `parentId` (if provided) lives in the same domain and has a
   * type that legally parents `childType` under C4.
   */
  private async assertParentCompatible(
    domainId: string,
    parentId: string | null,
    childType: ObjectType,
  ): Promise<void> {
    if (parentId === null) {
      assertValidParent(childType, null);
      return;
    }
    const parent = await this.prisma.modelObject.findUnique({
      where: { id: parentId },
      select: { id: true, domainId: true, type: true },
    });
    if (!parent) {
      throw new BadRequestException(`parent ${parentId} does not exist`);
    }
    if (parent.domainId !== domainId) {
      throw new BadRequestException(
        `parent ${parentId} belongs to a different domain`,
      );
    }
    assertValidParent(childType, parent.type as ObjectType);
  }
}
