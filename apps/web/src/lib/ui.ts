import type { ObjectStatus, ObjectType } from '@flappapp/shared';

/** Short single-letter glyph used in tree rows before the name. */
export function typeGlyph(type: ObjectType): string {
  switch (type) {
    case 'ACTOR':
      return '👤';
    case 'SYSTEM':
      return '▦';
    case 'APP':
      return '▢';
    case 'STORE':
      return '⬢';
    case 'COMPONENT':
      return '◆';
    default:
      return '?';
  }
}

/** Tailwind text colour for an object type. */
export function typeTextClass(type: ObjectType): string {
  switch (type) {
    case 'ACTOR':
      return 'text-amber-300';
    case 'SYSTEM':
      return 'text-indigo-300';
    case 'APP':
      return 'text-sky-300';
    case 'STORE':
      return 'text-emerald-300';
    case 'COMPONENT':
      return 'text-pink-300';
  }
}

export function statusBadgeClass(status: ObjectStatus): string {
  switch (status) {
    case 'LIVE':
      return 'bg-emerald-500/15 text-emerald-300';
    case 'FUTURE':
      return 'bg-indigo-500/15 text-indigo-300';
    case 'DEPRECATED':
      return 'bg-amber-500/15 text-amber-300';
    case 'REMOVED':
      return 'bg-rose-500/15 text-rose-300';
  }
}
