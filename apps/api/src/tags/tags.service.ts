import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateTagInput {
  domainId: string;
  name: string;
  color?: string;
}

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  list(domainId: string) {
    return this.prisma.tag.findMany({
      where: { domainId },
      orderBy: { name: 'asc' },
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

  async remove(id: string) {
    await this.get(id);
    await this.prisma.tag.delete({ where: { id } });
  }
}
