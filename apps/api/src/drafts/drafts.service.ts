import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type DomainPayload,
  DraftCreate,
  DraftStatus,
  DraftUpdate,
  diffPayloads,
} from '@flappapp/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { SnapshotsService } from '../snapshots/snapshots.service.js';

/**
 * Phase 6 — Copy-on-write drafts.
 *
 * When the user creates a draft, we capture the current live model as a
 * `DomainPayload` and store it as the draft's `payload`. The web UI can
 * later edit the payload JSON. When the user is happy, they promote the
 * draft which:
 *   1. Creates a new Snapshot of the *current* live state (safety net).
 *   2. Deletes all live ModelObjects + Connections for the domain.
 *   3. Re-creates them from the draft payload.
 *   4. Marks the draft as PROMOTED.
 *
 * Discarding a draft sets its status to DISCARDED — the JSON is kept
 * for audit trails but otherwise ignored.
 */
@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: SnapshotsService,
  ) {}

  async list(domainId: string) {
    return this.prisma.draft.findMany({
      where: { domainId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        domainId: true,
        name: true,
        status: true,
        basedOnSnapshotId: true,
        createdAt: true,
        updatedAt: true,
        promotedAt: true,
      },
    });
  }

  async get(id: string) {
    const draft = await this.prisma.draft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException(`Draft ${id} not found`);
    return draft;
  }

  /**
   * Create a draft by snapshotting the current live model and copying it
   * as the draft's editable payload. If a snapshot already exists, we
   * record `basedOnSnapshotId` so the diff viewer can show changes
   * relative to that point-in-time.
   */
  async create(domainId: string, input: DraftCreate) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true },
    });
    if (!domain) throw new NotFoundException(`Domain ${domainId} not found`);

    const payload = await this.snapshots.captureLive(domainId);

    // Record the latest snapshot as baseline, if one exists.
    const latestSnap = await this.prisma.snapshot.findFirst({
      where: { domainId },
      orderBy: { version: 'desc' },
      select: { id: true },
    });

    return this.prisma.draft.create({
      data: {
        domainId,
        name: input.name,
        basedOnSnapshotId: latestSnap?.id ?? null,
        payload: payload as object,
      },
    });
  }

  async update(id: string, input: DraftUpdate) {
    const existing = await this.get(id);
    if (existing.status !== DraftStatus.OPEN) {
      throw new BadRequestException(`Draft ${id} is ${existing.status}, cannot edit`);
    }
    return this.prisma.draft.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.payload !== undefined && { payload: input.payload as object }),
      },
    });
  }

  /**
   * Preview what changes promoting this draft would make, compared to the
   * current live model.
   */
  async previewPromote(id: string) {
    const draft = await this.get(id);
    if (draft.status !== DraftStatus.OPEN) {
      throw new BadRequestException(`Draft ${id} is ${draft.status}`);
    }
    const live = await this.snapshots.captureLive(draft.domainId);
    return diffPayloads(live, draft.payload as unknown as DomainPayload);
  }

  /**
   * Promote a draft to live. This is the "apply changes" action.
   *
   * Transaction:
   *   1. Auto-snapshot the current live state.
   *   2. Delete all live connections (FK cascade from objects would delete
   *      them anyway, but explicit is safer).
   *   3. Delete all live model objects.
   *   4. Re-create objects from draft payload, then connections.
   *   5. Mark draft as PROMOTED.
   */
  async promote(id: string) {
    const draft = await this.get(id);
    if (draft.status !== DraftStatus.OPEN) {
      throw new BadRequestException(`Draft ${id} is ${draft.status}, cannot promote`);
    }
    const domainId = draft.domainId;
    const payload = draft.payload as unknown as DomainPayload;

    // 1. Auto-snapshot before destructive changes.
    await this.snapshots.create(domainId, {
      name: `Auto-snapshot before promoting "${draft.name}"`,
    });

    // 2–4. Atomic swap inside a transaction.
    await this.prisma.$transaction(async (tx) => {
      // Delete live connections first (they FK into objects).
      const objIds = (
        await tx.modelObject.findMany({
          where: { domainId },
          select: { id: true },
        })
      ).map((o) => o.id);

      if (objIds.length > 0) {
        await tx.connection.deleteMany({
          where: {
            OR: [
              { senderId: { in: objIds } },
              { receiverId: { in: objIds } },
            ],
          },
        });
      }
      await tx.modelObject.deleteMany({ where: { domainId } });

      // Re-create objects.
      if (payload.objects.length > 0) {
        await tx.modelObject.createMany({
          data: payload.objects.map((o) => ({
            id: o.id,
            domainId,
            parentId: o.parentId,
            type: o.type,
            name: o.name,
            internal: o.internal,
            status: o.status,
            displayDescription: o.displayDescription,
            techChoiceId: o.techChoiceId,
          })),
        });
      }

      // Re-create connections.
      if (payload.connections.length > 0) {
        await tx.connection.createMany({
          data: payload.connections.map((c) => ({
            id: c.id,
            senderId: c.senderId,
            receiverId: c.receiverId,
            viaId: c.viaId,
            direction: c.direction,
            status: c.status,
            lineShape: c.lineShape,
            description: c.description,
          })),
        });
      }

      // Mark draft promoted.
      await tx.draft.update({
        where: { id },
        data: { status: DraftStatus.PROMOTED, promotedAt: new Date() },
      });
    });

    return this.get(id);
  }

  async discard(id: string) {
    const draft = await this.get(id);
    if (draft.status !== DraftStatus.OPEN) {
      throw new BadRequestException(`Draft ${id} is ${draft.status}, cannot discard`);
    }
    return this.prisma.draft.update({
      where: { id },
      data: { status: DraftStatus.DISCARDED },
    });
  }
}
