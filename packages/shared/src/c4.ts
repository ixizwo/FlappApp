/**
 * C4 model primitives shared by web, api, and mcp-server.
 *
 * Hierarchy (Simon Brown's C4 model):
 *   L1 Context:    Actor, System
 *   L2 Container:  App, Store         (children of System)
 *   L3 Component:  Component          (children of App or Store)
 *
 * L4 (Code) is intentionally excluded from manual diagramming per the PRD —
 * objects link to reality via external metadata instead.
 */

export const ObjectType = {
  ACTOR: 'ACTOR',
  SYSTEM: 'SYSTEM',
  APP: 'APP',
  STORE: 'STORE',
  COMPONENT: 'COMPONENT',
} as const;
export type ObjectType = (typeof ObjectType)[keyof typeof ObjectType];

export const ObjectStatus = {
  LIVE: 'LIVE',
  FUTURE: 'FUTURE',
  DEPRECATED: 'DEPRECATED',
  REMOVED: 'REMOVED',
} as const;
export type ObjectStatus = (typeof ObjectStatus)[keyof typeof ObjectStatus];

export const ConnectionDirection = {
  OUTGOING: 'OUTGOING',
  BIDIRECTIONAL: 'BIDIRECTIONAL',
  NONE: 'NONE',
} as const;
export type ConnectionDirection =
  (typeof ConnectionDirection)[keyof typeof ConnectionDirection];

export const LineShape = {
  CURVED: 'CURVED',
  STRAIGHT: 'STRAIGHT',
  SQUARE: 'SQUARE',
} as const;
export type LineShape = (typeof LineShape)[keyof typeof LineShape];

export type C4Level = 1 | 2 | 3;

/** Map an object type to its C4 level. */
export function levelOf(type: ObjectType): C4Level {
  switch (type) {
    case ObjectType.ACTOR:
    case ObjectType.SYSTEM:
      return 1;
    case ObjectType.APP:
    case ObjectType.STORE:
      return 2;
    case ObjectType.COMPONENT:
      return 3;
  }
}

/**
 * Which object types are allowed as a parent of the given type?
 * - Actor / System have no parent (they live directly under a Domain).
 * - App / Store must be children of a System.
 * - Component must be a child of an App or a Store.
 */
export function allowedParentTypes(type: ObjectType): readonly ObjectType[] {
  switch (type) {
    case ObjectType.ACTOR:
    case ObjectType.SYSTEM:
      return [];
    case ObjectType.APP:
    case ObjectType.STORE:
      return [ObjectType.SYSTEM];
    case ObjectType.COMPONENT:
      return [ObjectType.APP, ObjectType.STORE];
  }
}

/** Validate that a (childType, parentType?) pair is legal under the C4 hierarchy. */
export function isValidParentChild(
  childType: ObjectType,
  parentType: ObjectType | null,
): boolean {
  const allowed = allowedParentTypes(childType);
  if (allowed.length === 0) return parentType === null;
  return parentType !== null && allowed.includes(parentType);
}

/** How many connection handles a node of this type exposes on the canvas. */
export function handleCountFor(type: ObjectType): 6 | 12 {
  return type === ObjectType.ACTOR ? 6 : 12;
}
