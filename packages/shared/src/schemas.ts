import { z } from 'zod';
import {
  ConnectionDirection,
  GroupKind,
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
export const GroupKindSchema = z.nativeEnum(GroupKind);

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

// ──────────────────────────────────────────────────────────────────────
// Phase 5 — Groups, Flows, Tags, Tech Choices
// ──────────────────────────────────────────────────────────────────────

/**
 * Groups are visual containers on a diagram. They may nest (one group can
 * live inside another) and are sized either manually or via the autosize
 * flag that shrinks the group to fit its current child nodes.
 */
export const GroupCreateSchema = z.object({
  name: z.string().min(1).max(200),
  kind: GroupKindSchema.default(GroupKind.LOGICAL),
  parentGroupId: cuid.nullable().optional(),
  autosize: z.boolean().default(true),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
});
export type GroupCreate = z.infer<typeof GroupCreateSchema>;

export const GroupUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: GroupKindSchema.optional(),
  parentGroupId: cuid.nullable().optional(),
  autosize: z.boolean().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
});
export type GroupUpdate = z.infer<typeof GroupUpdateSchema>;

/** Assign / unassign a DiagramNode to a group. `groupId = null` clears it. */
export const GroupMembershipSchema = z.object({
  diagramNodeId: cuid,
  groupId: cuid.nullable(),
});
export type GroupMembership = z.infer<typeof GroupMembershipSchema>;

/**
 * Flows tell a story on top of a diagram. Each FlowStep highlights a subset
 * of diagram nodes and connections; the client dims everything else during
 * playback.
 */
export const FlowCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
});
export type FlowCreate = z.infer<typeof FlowCreateSchema>;

export const FlowUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
});
export type FlowUpdate = z.infer<typeof FlowUpdateSchema>;

export const FlowStepCreateSchema = z.object({
  order: z.number().int().min(0),
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  diagramNodeIds: z.array(cuid).default([]),
  connectionIds: z.array(cuid).default([]),
});
export type FlowStepCreate = z.infer<typeof FlowStepCreateSchema>;

export const FlowStepUpdateSchema = z.object({
  order: z.number().int().min(0).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  diagramNodeIds: z.array(cuid).optional(),
  connectionIds: z.array(cuid).optional(),
});
export type FlowStepUpdate = z.infer<typeof FlowStepUpdateSchema>;

/** Tags — per-domain colour-coded labels, many-to-many with ModelObject. */
export const TagUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a 6-digit hex')
    .optional(),
});
export type TagUpdate = z.infer<typeof TagUpdateSchema>;

/** Multi-assign (for the tag bar focus mode). */
export const TagAssignmentSchema = z.object({
  modelObjectIds: z.array(cuid).min(1),
  tagId: cuid,
  assign: z.boolean(),
});
export type TagAssignment = z.infer<typeof TagAssignmentSchema>;

/** Tech choices — write-side (admin catalog edits). */
export const TechChoiceCreateSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  icon: z.string().min(1).max(50),
});
export type TechChoiceCreate = z.infer<typeof TechChoiceCreateSchema>;

export const TechChoiceUpdateSchema = TechChoiceCreateSchema.partial();
export type TechChoiceUpdate = z.infer<typeof TechChoiceUpdateSchema>;
