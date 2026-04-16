import { Injectable, NotFoundException } from '@nestjs/common';
import { TechChoiceCreate, TechChoiceUpdate } from '@flappapp/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class TechChoicesService {
  constructor(private readonly prisma: PrismaService) {}

  list(category?: string) {
    return this.prisma.techChoice.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async get(id: string) {
    const t = await this.prisma.techChoice.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`TechChoice ${id} not found`);
    return t;
  }

  create(input: TechChoiceCreate) {
    return this.prisma.techChoice.create({ data: input });
  }

  async update(id: string, input: TechChoiceUpdate) {
    await this.get(id);
    return this.prisma.techChoice.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.icon !== undefined && { icon: input.icon }),
      },
    });
  }
}
