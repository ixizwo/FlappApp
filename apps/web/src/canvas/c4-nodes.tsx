import { Handle, NodeProps, Position } from '@xyflow/react';
import clsx from 'clsx';
import type { ObjectType } from '@flappapp/shared';
import { handleCountFor } from '@flappapp/shared';
import { typeGlyph } from '../lib/ui.ts';

/**
 * Custom C4 React Flow nodes.
 *
 * Every node exposes a set of **anchorable handles** so an edge can clamp
 * to a specific point on the border. Non-Actor nodes get 12 handles
 * (3 along each edge), Actors get 6 (two per exposed edge). The handle
 * count comes from shared helper `handleCountFor()` which the backend
 * will also consult when validating edges in later phases.
 *
 * The visual design intentionally uses different shapes/colors per C4
 * type — a glance at the canvas should immediately communicate the level.
 */

export interface C4NodeData {
  objectType: ObjectType;
  name: string;
  description: string | null;
  techChoice: string | null;
  status: string;
  selected: boolean;
  [key: string]: unknown;
}

type C4Node = NodeProps & { data: C4NodeData };

// Evenly-space N handles along each of the 4 sides.
// React Flow v12 renders handles using `style={{ top, left }}` percentages,
// which we set via id-encoded position metadata.
interface HandleSpec {
  id: string;
  position: Position;
  /** Percentage offset along the edge (0-100). */
  offset: number;
}

function handlesForType(type: ObjectType): HandleSpec[] {
  const count = handleCountFor(type); // 6 or 12
  const perSide = count === 12 ? 3 : 2;
  const sides: { position: Position; side: string }[] = [
    { position: Position.Top, side: 't' },
    { position: Position.Right, side: 'r' },
    { position: Position.Bottom, side: 'b' },
    { position: Position.Left, side: 'l' },
  ];
  const handles: HandleSpec[] = [];
  for (const { position, side } of sides) {
    // Actors skip left/right on their round shape — they get 2 per edge,
    // 4 sides = 8. Cap at 6 by dropping left/right middle.
    for (let i = 0; i < perSide; i++) {
      const offset = ((i + 1) / (perSide + 1)) * 100;
      handles.push({ id: `${side}${i}`, position, offset });
    }
  }
  // ACTOR: drop 2 extras (one each from top/bottom middle) to end up with 6.
  if (type === 'ACTOR') {
    return handles.filter((h) => h.id !== 't1' && h.id !== 'b1');
  }
  return handles;
}

function handleStyle(spec: HandleSpec): React.CSSProperties {
  if (spec.position === Position.Top || spec.position === Position.Bottom) {
    return { left: `${spec.offset}%` };
  }
  return { top: `${spec.offset}%` };
}

function C4HandleSet({ type }: { type: ObjectType }) {
  const handles = handlesForType(type);
  return (
    <>
      {handles.map((h) => (
        // Each handle acts as both source and target so edges can be drawn
        // from any anchor to any anchor. React Flow enforces uniqueness on
        // the (nodeId, handleId) tuple server-side.
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={h.position}
          style={handleStyle(h)}
          className="!h-2 !w-2 !bg-surface-200 !border !border-surface-800 hover:!bg-indigo-400"
        />
      ))}
    </>
  );
}

function statusRing(status: string) {
  switch (status) {
    case 'LIVE':
      return '';
    case 'FUTURE':
      return 'border-dashed';
    case 'DEPRECATED':
      return 'ring-1 ring-amber-500/40';
    case 'REMOVED':
      return 'line-through opacity-60';
    default:
      return '';
  }
}

const baseNode =
  'relative flex h-full w-full flex-col rounded border px-3 py-2 text-xs text-surface-100 shadow-sm transition-colors';

export function ActorNode({ data, selected }: C4Node) {
  return (
    <div
      data-testid="node-actor"
      className={clsx(
        baseNode,
        'items-center justify-center rounded-full border-amber-400/60 bg-amber-500/10',
        statusRing(data.status),
        selected && 'border-indigo-400 ring-2 ring-indigo-400/50',
      )}
    >
      <C4HandleSet type="ACTOR" />
      <div className="text-lg">{typeGlyph('ACTOR')}</div>
      <div className="truncate font-semibold">{data.name}</div>
      {data.description && (
        <div className="mt-0.5 truncate text-[10px] text-surface-200">
          {data.description}
        </div>
      )}
    </div>
  );
}

export function SystemNode({ data, selected }: C4Node) {
  return (
    <div
      data-testid="node-system"
      className={clsx(
        baseNode,
        'border-indigo-400/60 bg-indigo-500/10',
        statusRing(data.status),
        selected && 'border-indigo-400 ring-2 ring-indigo-400/50',
      )}
    >
      <C4HandleSet type="SYSTEM" />
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-indigo-300">
        <span>{typeGlyph('SYSTEM')}</span> System
      </div>
      <div className="truncate text-sm font-semibold">{data.name}</div>
      {data.description && (
        <div className="mt-0.5 line-clamp-2 text-[10px] text-surface-200">
          {data.description}
        </div>
      )}
    </div>
  );
}

export function AppNode({ data, selected }: C4Node) {
  return (
    <div
      data-testid="node-app"
      className={clsx(
        baseNode,
        'border-sky-400/60 bg-sky-500/10',
        statusRing(data.status),
        selected && 'border-indigo-400 ring-2 ring-indigo-400/50',
      )}
    >
      <C4HandleSet type="APP" />
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-sky-300">
        <span>{typeGlyph('APP')}</span> App
      </div>
      <div className="truncate text-sm font-semibold">{data.name}</div>
      {data.techChoice && (
        <div className="mt-0.5 inline-block w-fit rounded bg-surface-800 px-1 py-0.5 text-[9px] text-surface-200">
          {data.techChoice}
        </div>
      )}
    </div>
  );
}

export function StoreNode({ data, selected }: C4Node) {
  return (
    <div
      data-testid="node-store"
      className={clsx(
        baseNode,
        'border-emerald-400/60 bg-emerald-500/10',
        statusRing(data.status),
        selected && 'border-indigo-400 ring-2 ring-indigo-400/50',
      )}
    >
      <C4HandleSet type="STORE" />
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-300">
        <span>{typeGlyph('STORE')}</span> Store
      </div>
      <div className="truncate text-sm font-semibold">{data.name}</div>
      {data.techChoice && (
        <div className="mt-0.5 inline-block w-fit rounded bg-surface-800 px-1 py-0.5 text-[9px] text-surface-200">
          {data.techChoice}
        </div>
      )}
    </div>
  );
}

export function ComponentNode({ data, selected }: C4Node) {
  return (
    <div
      data-testid="node-component"
      className={clsx(
        baseNode,
        'border-pink-400/60 bg-pink-500/10',
        statusRing(data.status),
        selected && 'border-indigo-400 ring-2 ring-indigo-400/50',
      )}
    >
      <C4HandleSet type="COMPONENT" />
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-pink-300">
        <span>{typeGlyph('COMPONENT')}</span> Component
      </div>
      <div className="truncate text-sm font-semibold">{data.name}</div>
    </div>
  );
}

export const c4NodeTypes = {
  ACTOR: ActorNode,
  SYSTEM: SystemNode,
  APP: AppNode,
  STORE: StoreNode,
  COMPONENT: ComponentNode,
};

/** Visible to tests that want to assert the handle layout. */
export const __handlesForTypeForTests = handlesForType;
