import { z } from 'zod';
import {
  ConnectionDirection,
  LineShape,
  ObjectStatus,
  ObjectType,
  allowedParentTypes,
  isValidParentChild,
} from './c4.js';

const cuid = z.string().min(1);

export const ObjectTypeSchema = z.nativeEnum(ObjectType);
export const ObjectStatusSchema = z.nativeEnum(ObjectStatus);
export const ConnectionDirectionSchema = z.nativeEnum(ConnectionDirection);
export const LineShapeSchema = z.nativeEnum(LineShape);

/** Max length for the compact "display" description per PRD §4.1. */
export const DISPLAY_DESCRIPTION_MAX = 120;

export const ModelObjectCreateSchema = z
  .object({
    domainId: cuid,
    parentId: cuid.nullable(),
    type: ObjectTypeSchema,
    name: z.string().min(1).max(200),
    internal: z.boolean().default(true),
    status: ObjectStatusSchema.default(ObjectStatus.LIVE),
    displayDescription: z.string().max(DISPLAY_DESCRIPTION_MAX).optional(),
    detailedDescriptionMd: z.string().optional(),
    techChoiceId: cuid.nullable().optional(),
    ownerTeamId: cuid.nullable().optional(),
    tagIds: z.array(cuid).default([]),
    links: z
      .array(z.object({ label: z.string(), url: z.string().url() }))
      .default([]),
    metadata: z.record(z.unknown()).default({}),
  })
  .superRefine((val, ctx) => {
    // We can't check parentType here (no DB), but we CAN assert that
    // objects which forbid parents don't provide one, and vice versa.
    const allowed = allowedParentTypes(val.type);
    if (allowed.length === 0 && val.parentId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentId'],
        message: `${val.type} cannot have a parent`,
      });
    }
    if (allowed.length > 0 && val.parentId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentId'],
        message: `${val.type} requires a parent of type: ${allowed.join(' | ')}`,
      });
    }
  });

export type ModelObjectCreate = z.infer<typeof ModelObjectCreateSchema>;

export const ModelObjectUpdateSchema = ModelObjectCreateSchema.innerType()
  .partial()
  .omit({ domainId: true, type: true, parentId: true });
export type ModelObjectUpdate = z.infer<typeof ModelObjectUpdateSchema>;

export const ConnectionCreateSchema = z
  .object({
    senderId: cuid,
    receiverId: cuid,
    viaId: cuid.nullable().optional(),
    direction: ConnectionDirectionSchema.default(ConnectionDirection.OUTGOING),
    status: ObjectStatusSchema.default(ObjectStatus.LIVE),
    lineShape: LineShapeSchema.default(LineShape.CURVED),
    description: z.string().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.senderId === val.receiverId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receiverId'],
        message: 'sender and receiver must differ',
      });
    }
  });
export type ConnectionCreate = z.infer<typeof ConnectionCreateSchema>;

/** Runtime-checked version of the C4 parent/child rule — handy for API services. */
export function assertValidParent(
  childType: ObjectType,
  parentType: ObjectType | null,
): void {
  if (!isValidParentChild(childType, parentType)) {
    throw new Error(
      `Invalid C4 parent/child: ${parentType ?? 'null'} -> ${childType}`,
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// Diagrams (Phase 3)
// ──────────────────────────────────────────────────────────────────────

export const C4LevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const DiagramCreateSchema = z.object({
  domainId: cuid,
  name: z.string().min(1).max(200),
  level: C4LevelSchema,
  scopeObjectId: cuid.nullable().optional(),
  pinned: z.boolean().default(false),
});
export type DiagramCreate = z.infer<typeof DiagramCreateSchema>;

export const DiagramUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  pinned: z.boolean().optional(),
});
export type DiagramUpdate = z.infer<typeof DiagramUpdateSchema>;

export const DiagramNodeCreateSchema = z.object({
  modelObjectId: cuid,
  x: z.number(),
  y: z.number(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  groupId: cuid.nullable().optional(),
});
export type DiagramNodeCreate = z.infer<typeof DiagramNodeCreateSchema>;

export const DiagramNodeUpdateSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  groupId: cuid.nullable().optional(),
});
export type DiagramNodeUpdate = z.infer<typeof DiagramNodeUpdateSchema>;

export const DiagramEdgeCreateSchema = z.object({
  connectionId: cuid,
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  waypoints: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .optional(),
});
export type DiagramEdgeCreate = z.infer<typeof DiagramEdgeCreateSchema>;

export const DiagramEdgeUpdateSchema = z.object({
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  waypoints: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .optional(),
});
export type DiagramEdgeUpdate = z.infer<typeof DiagramEdgeUpdateSchema>;

// ──────────────────────────────────────────────────────────────────────
// Phase 4 — Connection edit + drill-down overrides
// ──────────────────────────────────────────────────────────────────────

export const ConnectionUpdateSchema = z.object({
  direction: ConnectionDirectionSchema.optional(),
  status: ObjectStatusSchema.optional(),
  lineShape: LineShapeSchema.optional(),
  description: z.string().max(500).nullable().optional(),
  viaId: cuid.nullable().optional(),
});
export type ConnectionUpdate = z.infer<typeof ConnectionUpdateSchema>;

/**
 * Per-source-diagram override for where a drill-down click lands. Stored in
 * the `DiagramZoomOverride` table; the default (null target) means "use the
 * first diagram scoped to the clicked object".
 */
export const DiagramZoomOverrideUpsertSchema = z.object({
  modelObjectId: cuid,
  targetDiagramId: cuid,
});
export type DiagramZoomOverrideUpsert = z.infer<
  typeof DiagramZoomOverrideUpsertSchema
>;
