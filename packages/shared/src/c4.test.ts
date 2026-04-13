import { describe, expect, it } from 'vitest';
import {
  ObjectType,
  allowedParentTypes,
  handleCountFor,
  isValidParentChild,
  levelOf,
} from './c4.js';

describe('levelOf', () => {
  it('maps every object type to a level', () => {
    expect(levelOf(ObjectType.ACTOR)).toBe(1);
    expect(levelOf(ObjectType.SYSTEM)).toBe(1);
    expect(levelOf(ObjectType.APP)).toBe(2);
    expect(levelOf(ObjectType.STORE)).toBe(2);
    expect(levelOf(ObjectType.COMPONENT)).toBe(3);
  });
});

describe('isValidParentChild', () => {
  it('rejects a parent for level-1 objects', () => {
    expect(isValidParentChild(ObjectType.ACTOR, null)).toBe(true);
    expect(isValidParentChild(ObjectType.ACTOR, ObjectType.SYSTEM)).toBe(false);
    expect(isValidParentChild(ObjectType.SYSTEM, null)).toBe(true);
    expect(isValidParentChild(ObjectType.SYSTEM, ObjectType.SYSTEM)).toBe(false);
  });

  it('requires System as parent for App/Store', () => {
    expect(isValidParentChild(ObjectType.APP, ObjectType.SYSTEM)).toBe(true);
    expect(isValidParentChild(ObjectType.STORE, ObjectType.SYSTEM)).toBe(true);
    expect(isValidParentChild(ObjectType.APP, null)).toBe(false);
    expect(isValidParentChild(ObjectType.APP, ObjectType.APP)).toBe(false);
  });

  it('requires App or Store as parent for Component', () => {
    expect(isValidParentChild(ObjectType.COMPONENT, ObjectType.APP)).toBe(true);
    expect(isValidParentChild(ObjectType.COMPONENT, ObjectType.STORE)).toBe(true);
    expect(isValidParentChild(ObjectType.COMPONENT, ObjectType.SYSTEM)).toBe(false);
    expect(isValidParentChild(ObjectType.COMPONENT, null)).toBe(false);
  });
});

describe('allowedParentTypes', () => {
  it('returns an empty list for level-1 objects', () => {
    expect(allowedParentTypes(ObjectType.ACTOR)).toEqual([]);
    expect(allowedParentTypes(ObjectType.SYSTEM)).toEqual([]);
  });
});

describe('handleCountFor', () => {
  it('gives actors 6 handles and every other type 12', () => {
    expect(handleCountFor(ObjectType.ACTOR)).toBe(6);
    expect(handleCountFor(ObjectType.SYSTEM)).toBe(12);
    expect(handleCountFor(ObjectType.APP)).toBe(12);
    expect(handleCountFor(ObjectType.STORE)).toBe(12);
    expect(handleCountFor(ObjectType.COMPONENT)).toBe(12);
  });
});
