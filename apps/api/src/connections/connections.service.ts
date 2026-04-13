import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  C4Level,
  ConcreteConnection,
  ConnectionCreate,
  ConnectionDirection,
  LineShape,
  ModelObjectNode,
  ObjectStatus,
  ObjectType,
  resolveImpliedConnections,
} from '@flappapp/shared';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ListConnectionsFilter {
  domainId?: string;
  senderId?: string;
  receiverId?: string;
  viaId?: string;
  status?: ObjectStatus;
}

export interface UpdateConnectionInput {
  direction?: ConnectionDirection;
  status?: ObjectStatus;
  lineShape?: LineShape;
  description?: string;
  viaId?: string | null;
}

@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ListConnectionsFilter) {
    // Domain scoping is done through the endpoints; if the caller gives us
    // a domainId we join through ModelObject.sender to keep things scoped.
    return this.prisma.connection.findMany({
      where: {
        ...(filter.senderId !== undefined && { senderId: filter.senderId }),
        ...(filter.receiverId !== undefined && { receiverId: filter.receiverId }),
        ...(filter.viaId !== undefined && { viaId: filter.viaId }),
        ...(filter.status !== undefined && { status: filter.status }),
        ...(filter.domainId !== undefined && {
          sender: { domainId: filter.domainId },
        }),
      },
      include: { sender: true, receiver: true, via: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const conn = await this.prisma.connection.findUnique({
      where: { id },
      include: { sender: true, receiver: true, via: true },
    });
    if (!conn) throw new NotFoundException(`Connection ${id} not found`);
    return conn;
  }

  /**
   * Create a connection. Enforces:
   *  - sender/receiver/via must all exist and live in the same domain
   *  - uniqueness on the (sender, receiver, via) triple (DB-level too)
   */
  async create(input: ConnectionCreate) {
    const endpointIds = [
      input.senderId,
      input.receiverId,
      ...(input.viaId ? [input.viaId] : []),
    ];
    const endpoints = await this.prisma.modelObject.findMany({
      where: { id: { in: endpointIds } },
      select: { id: true, domainId: true },
    });
    if (endpoints.length !== endpointIds.length) {
      throw new BadRequestException('one or more endpoints do not exist');
    }
    const domains = new Set(endpoints.map((e) => e.domainId));
    if (domains.size > 1) {
      throw new BadRequestException(
        'sender, receiver, and via must all belong to the same domain',
      );
    }

    try {
      return await this.prisma.connection.create({
        data: {
          senderId: input.senderId,
          receiverId: input.receiverId,
          viaId: input.viaId ?? null,
          direction: input.direction,
          status: input.status,
          lineShape: input.lineShape,
          ...(input.description !== undefined && { description: input.description }),
        },
        include: { sender: true, receiver: true, via: true },
      });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'a connection with this (sender, receiver, via) already exists',
        );
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateConnectionInput) {
    await this.get(id);
    return this.prisma.connection.update({
      where: { id },
      data: {
        ...(input.direction !== undefined && { direction: input.direction }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.lineShape !== undefined && { lineShape: input.lineShape }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.viaId !== undefined && { viaId: input.viaId }),
      },
      include: { sender: true, receiver: true, via: true },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.connection.delete({ where: { id } });
  }

  /**
   * Project all concrete connections in a Domain up to a given C4 level.
   * This is the read side of "implied/lower connections" from PRD §4.1 and
   * is used by the canvas to render dashed edges on L1/L2 diagrams.
   */
  async resolveImplied(domainId: string, level: C4Level) {
    const [objects, concrete] = await Promise.all([
      this.prisma.modelObject.findMany({
        where: { domainId },
        select: { id: true, type: true, parentId: true },
      }),
      this.prisma.connection.findMany({
        where: { sender: { domainId } },
        select: { id: true, senderId: true, receiverId: true, viaId: true },
      }),
    ]);

    const map = new Map<string, ModelObjectNode>();
    for (const o of objects) {
      map.set(o.id, {
        id: o.id,
        type: o.type as ObjectType,
        parentId: o.parentId,
      });
    }
    const connections: ConcreteConnection[] = concrete.map((c) => ({
      id: c.id,
      senderId: c.senderId,
      receiverId: c.receiverId,
      viaId: c.viaId,
    }));

    return resolveImpliedConnections(level, map, connections);
  }
}
