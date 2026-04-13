import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateLandscapeInput {
  organizationId: string;
  name: string;
  description?: string;
}

@Injectable()
export class LandscapesService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId?: string) {
    return this.prisma.landscape.findMany({
      where: organizationId ? { organizationId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const l = await this.prisma.landscape.findUnique({ where: { id } });
    if (!l) throw new NotFoundException(`Landscape ${id} not found`);
    return l;
  }

  create(input: CreateLandscapeInput) {
    return this.prisma.landscape.create({ data: input });
  }
}
