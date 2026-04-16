import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type DomainPayload,
  type SnapshotCreate,
  diffPayloads,
} from '@flappapp/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Phase 6 — Snapshots.
 *
 * A snapshot is an immutable JSON dump of a Domain's model state at a
 * point in time. Creating a snapshot reads the live model, serialises it
 * into a `DomainPayload`, bumps the version counter for the domain, and
 * stores the result.
 *
 * Snapshots are used for:
 *   1. Version dropdown (Live vs past snapshots)
 *   2. Diff viewer (compare any two snapshots, or a snapshot against live)
 *   3. Draft baselines (a draft records which snapshot it branched from)
 */
@Injectable()
export class SnapshotsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(domainId: string) {
    return this.prisma.snapshot.findMany({
      where: { domainId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        domainId: true,
        name: true,
        description: true,
        version: true,
        createdAt: true,
      },
    });
  }

  async get(id: string) {
    const snap = await this.prisma.snapshot.findUnique({ where: { id } });
    if (!snap) throw new NotFoundException(`Snapshot ${id} not found`);
    return snap;
  }

  /**
   * Capture the current live model for a domain as a new snapshot.
   */
  async create(domainId: string, input: SnapshotCreate) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true },
    });
    if (!domain) throw new NotFoundException(`Domain ${domainId} not found`);

    const payload = await this.captureLive(domainId);

    // Auto-increment version within this domain.
    const latest = await this.prisma.snapshot.findFirst({
      where: { domainId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.snapshot.create({
      data: {
        domainId,
        name: input.name,
        description: input.description ?? null,
        version,
        payload: payload as object,
      },
    });
  }

  /**
   * Diff two snapshots (both must belong to the same domain).
   */
  async diff(beforeId: string, afterId: string) {
    const [before, after] = await Promise.all([
      this.get(beforeId),
      this.get(afterId),
    ]);
    return diffPayloads(
      before.payload as unknown as DomainPayload,
      after.payload as unknown as DomainPayload,
    );
  }

  /**
   * Diff a snapshot against the current live model.
   */
  async diffAgainstLive(snapshotId: string) {
    const snap = await this.get(snapshotId);
    const live = await this.captureLive(snap.domainId);
    return diffPayloads(
      snap.payload as unknown as DomainPayload,
      live,
    );
  }

  /**
   * Read the live model from the DB and shape it into a DomainPayload.
   */
  async captureLive(domainId: string): Promise<DomainPayload> {
    const [objects, connections, diagrams] = await Promise.all([
      this.prisma.modelObject.findMany({
        where: { domainId },
        select: {
          id: true,
          parentId: true,
          type: true,
          name: true,
          internal: true,
          status: true,
          displayDescription: true,
          techChoiceId: true,
          tagLinks: { select: { tagId: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.connection.findMany({
        where: { sender: { domainId } },
        select: {
          id: true,
          senderId: true,
          receiverId: true,
          viaId: true,
          direction: true,
          status: true,
          lineShape: true,
          description: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.diagram.findMany({
        where: { domainId },
        select: {
          id: true,
          name: true,
          level: true,
          scopeObjectId: true,
          pinned: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      objects: objects.map((o) => ({
        id: o.id,
        parentId: o.parentId,
        type: o.type,
        name: o.name,
        internal: o.internal,
        status: o.status,
        displayDescription: o.displayDescription,
        techChoiceId: o.techChoiceId,
        tagIds: o.tagLinks.map((tl) => tl.tagId),
      })),
      connections: connections.map((c) => ({
        id: c.id,
        senderId: c.senderId,
        receiverId: c.receiverId,
        viaId: c.viaId,
        direction: c.direction,
        status: c.status,
        lineShape: c.lineShape,
        description: c.description,
      })),
      diagrams: diagrams.map((d) => ({
        id: d.id,
        name: d.name,
        level: d.level,
        scopeObjectId: d.scopeObjectId,
        pinned: d.pinned,
      })),
    };
  }
}
