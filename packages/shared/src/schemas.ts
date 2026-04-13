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
