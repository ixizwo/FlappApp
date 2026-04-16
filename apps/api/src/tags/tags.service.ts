import { Injectable, NotFoundException } from '@nestjs/common';
import { TagAssignment, TagUpdate } from '@flappapp/shared';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateTagInput {
  domainId: string;
  name: string;
  color?: string;
}

/**
 * Phase 2 provided read+create+delete. Phase 5 adds:
 *   - `update` for rename / colour changes from the Tags admin UI
 *   - `assignBulk` so the bottom tag bar focus mode can toggle a tag across
 *     many selected objects in one round-trip
 */
@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  list(domainId: string) {
    return this.prisma.tag.findMany({
      where: { domainId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { objects: true } } },
    });
  }

  async get(id: string) {
    const t = await this.prisma.tag.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`Tag ${id} not found`);
    return t;
  }

  create(input: CreateTagInput) {
    return this.prisma.tag.create({ data: input });
  }

  async update(id: string, input: TagUpdate) {
    await this.get(id);
    return this.prisma.tag.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.color !== undefined && { color: input.color }),
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.tag.delete({ where: { id } });
  }

  /**
   * Bulk tag assignment. `assign=true` adds the tag to every object in
   * `modelObjectIds`; `assign=false` removes it. We use createMany with
   * `skipDuplicates` so the assign path is idempotent — re-running after a
   * partial failure is safe.
   */
  async assignBulk(input: TagAssignment) {
    await this.get(input.tagId);
    if (input.assign) {
      await this.prisma.modelObjectTag.createMany({
        data: input.modelObjectIds.map((modelObjectId) => ({
          modelObjectId,
          tagId: input.tagId,
        })),
        skipDuplicates: true,
      });
    } else {
      await this.prisma.modelObjectTag.deleteMany({
        where: {
          tagId: input.tagId,
          modelObjectId: { in: input.modelObjectIds },
        },
      });
    }
    return { tagId: input.tagId, count: input.modelObjectIds.length };
  }
}
