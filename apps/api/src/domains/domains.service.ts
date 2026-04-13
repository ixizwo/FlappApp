import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateDomainInput {
  landscapeId: string;
  name: string;
  description?: string;
  ownerTeamId?: string;
}

@Injectable()
export class DomainsService {
  constructor(private readonly prisma: PrismaService) {}

  list(landscapeId?: string) {
    return this.prisma.domain.findMany({
      where: landscapeId ? { landscapeId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const d = await this.prisma.domain.findUnique({ where: { id } });
    if (!d) throw new NotFoundException(`Domain ${id} not found`);
    return d;
  }

  create(input: CreateDomainInput) {
    return this.prisma.domain.create({ data: input });
  }
}
