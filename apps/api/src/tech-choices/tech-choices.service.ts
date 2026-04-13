import { Injectable } from '@nestjs/common';
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
}
