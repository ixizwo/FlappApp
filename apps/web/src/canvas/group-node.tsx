import { NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import type { GroupKind } from '@flappapp/shared';

/**
 * Phase 5 — React Flow parent node used to render Groups.
 *
 * React Flow v12 supports parent-child node relationships via the
 * `parentId` + `extent: 'parent'` props on the child. We model a Group
 * as a real Node with `type: 'group'` and `data.kind` so children can be
 * dragged inside its bounds while the group auto-resizes to fit.
 *
 * The visual styling uses a distinct dashed outline per kind so VPC vs
 * REGION vs ENV vs LOGICAL are immediately readable.
 */

export interface GroupNodeData {
  name: string;
  kind: GroupKind;
  [key: string]: unknown;
}

type GroupProps = NodeProps & { data: GroupNodeData };

function kindPalette(kind: GroupKind): { border: string; label: string; bg: string } {
  switch (kind) {
    case 'VPC':
      return {
        border: 'border-cyan-400/50',
        label: 'text-cyan-300',
        bg: 'bg-cyan-500/5',
      };
    case 'REGION':
      return {
        border: 'border-purple-400/50',
        label: 'text-purple-300',
        bg: 'bg-purple-500/5',
      };
    case 'ENV':
      return {
        border: 'border-amber-400/50',
        label: 'text-amber-300',
        bg: 'bg-amber-500/5',
      };
    case 'LOGICAL':
    default:
      return {
        border: 'border-surface-400/40',
        label: 'text-surface-200',
        bg: 'bg-surface-500/5',
      };
  }
}

export function GroupNode({ data, selected }: GroupProps) {
  const p = kindPalette(data.kind);
  return (
    <div
      data-testid={`group-${data.kind.toLowerCase()}`}
      className={clsx(
        'h-full w-full rounded-lg border-2 border-dashed',
        p.border,
        p.bg,
        selected && 'ring-2 ring-indigo-400/40',
      )}
    >
      <div
        className={clsx(
          'inline-block translate-y-[-50%] rounded bg-surface-950 px-2 py-0.5 ml-3 font-mono text-[10px] uppercase tracking-wider',
          p.label,
        )}
      >
        {data.kind} · {data.name}
      </div>
    </div>
  );
}

export const groupNodeType = {
  group: GroupNode,
};

export const __kindPaletteForTests = kindPalette;
