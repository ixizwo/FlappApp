import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  ReactFlowState,
  useStore,
} from '@xyflow/react';
import clsx from 'clsx';
import {
  ConnectionDirection,
  LineShape,
  ObjectStatus,
} from '@flappapp/shared';

/**
 * Payload the canvas attaches to every Edge.data slot. Everything the C4
 * edge component needs to render lives here so it can stay a pure function
 * of React Flow's props — no round-trip to the API during paint.
 */
export interface C4EdgeData extends Record<string, unknown> {
  connectionId: string;
  direction: ConnectionDirection;
  status: ObjectStatus;
  lineShape: LineShape;
  description: string | null;
  /** Diagram-node id of the `via` intermediary object, when present on the diagram. */
  viaNodeId: string | null;
  /** Name of the via object, displayed as a badge when the via isn't placed. */
  viaName: string | null;
  /**
   * Dashed/click-through implied connections behave differently — they
   * are read-only projections, not real DiagramEdges, so we suppress
   * editing affordances for them.
   */
  implied: boolean;
  /** How many concrete connections rolled up into this implied edge. */
  impliedCount?: number;
  /** Phase 5: dim the edge during flow playback when it isn't in the active step. */
  dimmed?: boolean;
}

type Pt = { x: number; y: number };

/** Compute an edge path for the given line shape. */
function pathFor(
  shape: LineShape,
  source: Pt & { position: EdgeProps['sourcePosition'] },
  target: Pt & { position: EdgeProps['targetPosition'] },
): [string, number, number] {
  if (shape === LineShape.STRAIGHT) {
    const [path, labelX, labelY] = getStraightPath({
      sourceX: source.x,
      sourceY: source.y,
      targetX: target.x,
      targetY: target.y,
    });
    return [path, labelX, labelY];
  }
  if (shape === LineShape.SQUARE) {
    const [path, labelX, labelY] = getSmoothStepPath({
      sourceX: source.x,
      sourceY: source.y,
      targetX: target.x,
      targetY: target.y,
      sourcePosition: source.position,
      targetPosition: target.position,
      borderRadius: 0,
    });
    return [path, labelX, labelY];
  }
  // CURVED (default)
  const [path, labelX, labelY] = getBezierPath({
    sourceX: source.x,
    sourceY: source.y,
    targetX: target.x,
    targetY: target.y,
    sourcePosition: source.position,
    targetPosition: target.position,
  });
  return [path, labelX, labelY];
}

function strokeFor(status: ObjectStatus, implied: boolean): {
  color: string;
  dashArray: string | undefined;
  opacity: number;
} {
  if (implied) {
    return { color: '#818cf8', dashArray: '6 4', opacity: 0.55 };
  }
  switch (status) {
    case ObjectStatus.DEPRECATED:
      return { color: '#f59e0b', dashArray: '4 2', opacity: 0.8 };
    case ObjectStatus.FUTURE:
      return { color: '#38bdf8', dashArray: '2 3', opacity: 0.9 };
    case ObjectStatus.REMOVED:
      return { color: '#64748b', dashArray: '1 4', opacity: 0.4 };
    case ObjectStatus.LIVE:
    default:
      return { color: '#c7d2fe', dashArray: undefined, opacity: 1 };
  }
}

function markersFor(
  direction: ConnectionDirection,
  implied: boolean,
): { start: string | undefined; end: string | undefined } {
  // React Flow ships two default marker ids: we use MarkerType.ArrowClosed
  // via the `markerEnd` prop on <BaseEdge>. Both ends use the same id when
  // bidirectional. Implied edges get a smaller marker.
  const id = implied ? 'c4-arrow-implied' : 'c4-arrow';
  if (direction === ConnectionDirection.NONE) return { start: undefined, end: undefined };
  if (direction === ConnectionDirection.BIDIRECTIONAL) {
    return { start: `url(#${id})`, end: `url(#${id})` };
  }
  return { start: undefined, end: `url(#${id})` };
}

/**
 * Shared SVG <defs> block — rendered once by DiagramCanvasView so every
 * C4Edge instance can reference the arrow markers by id.
 */
export function C4EdgeDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
      <defs>
        <marker
          id="c4-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="#c7d2fe" />
        </marker>
        <marker
          id="c4-arrow-implied"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="#818cf8" opacity="0.7" />
        </marker>
      </defs>
    </svg>
  );
}

// React Flow v12 nodes from the store — we look up the via node's centre
// without re-rendering when unrelated nodes move.
interface StoreNodeCoord {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function viaSelector(viaNodeId: string | null) {
  return (s: ReactFlowState): StoreNodeCoord | null => {
    if (!viaNodeId) return null;
    const n = s.nodeLookup.get(viaNodeId);
    if (!n) return null;
    return {
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      w: n.measured?.width ?? n.width ?? 180,
      h: n.measured?.height ?? n.height ?? 100,
    };
  };
}

export function C4Edge(props: EdgeProps) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    id,
  } = props;
  const d = (data ?? {
    direction: ConnectionDirection.OUTGOING,
    status: ObjectStatus.LIVE,
    lineShape: LineShape.CURVED,
    description: null,
    viaNodeId: null,
    viaName: null,
    implied: false,
    connectionId: '',
  }) as C4EdgeData;

  const viaCoord = useStore(viaSelector(d.viaNodeId));

  const stroke = strokeFor(d.status, d.implied);
  const markers = markersFor(d.direction, d.implied);

  // When the via object is on the diagram we render two segments meeting
  // at its centre. This makes via-routing visually explicit — PRD §4.1.
  const segments: [string, number, number][] = [];
  if (viaCoord) {
    const viaCenter = {
      x: viaCoord.x + viaCoord.w / 2,
      y: viaCoord.y + viaCoord.h / 2,
      position: sourcePosition,
    };
    segments.push(
      pathFor(d.lineShape, { x: sourceX, y: sourceY, position: sourcePosition }, viaCenter),
      pathFor(d.lineShape, viaCenter, { x: targetX, y: targetY, position: targetPosition }),
    );
  } else {
    segments.push(
      pathFor(
        d.lineShape,
        { x: sourceX, y: sourceY, position: sourcePosition },
        { x: targetX, y: targetY, position: targetPosition },
      ),
    );
  }

  // The label sits at the midpoint of the first segment when there's no
  // via, or at the via node centre when there is one.
  const label = (() => {
    if (viaCoord) {
      return {
        x: viaCoord.x + viaCoord.w / 2,
        y: viaCoord.y + viaCoord.h / 2 - 20,
      };
    }
    const [, lx, ly] = segments[0]!;
    return { x: lx, y: ly };
  })();

  const baseStyle: React.CSSProperties = {
    stroke: stroke.color,
    strokeWidth: selected ? 2.5 : 1.6,
    opacity: d.dimmed ? Math.min(stroke.opacity, 0.15) : stroke.opacity,
    ...(stroke.dashArray ? { strokeDasharray: stroke.dashArray } : {}),
    cursor: d.implied ? 'pointer' : 'default',
  };

  return (
    <>
      {segments.map(([path], i) => {
        const isLast = i === segments.length - 1;
        const isFirst = i === 0;
        const startMarker = isFirst ? markers.start : undefined;
        const endMarker = isLast ? markers.end : undefined;
        return (
          <BaseEdge
            key={`${id}-${i}`}
            id={i === 0 ? id : `${id}-seg${i}`}
            path={path}
            style={baseStyle}
            {...(startMarker ? { markerStart: startMarker } : {})}
            {...(endMarker ? { markerEnd: endMarker } : {})}
          />
        );
      })}
      {(d.description || d.implied || (viaCoord && d.viaName)) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)`,
              pointerEvents: 'all',
            }}
            className={clsx(
              'rounded border px-1.5 py-0.5 text-[10px] font-medium shadow-sm',
              d.implied
                ? 'border-indigo-500/60 bg-indigo-950/80 text-indigo-200'
                : 'border-surface-800 bg-surface-900/90 text-surface-100',
            )}
          >
            {d.implied ? (
              <span>
                implied{d.impliedCount && d.impliedCount > 1 ? ` · ${d.impliedCount}` : ''}
              </span>
            ) : d.description ? (
              d.description
            ) : (
              <span>via {d.viaName}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const c4EdgeTypes = {
  c4: C4Edge,
};

/** Visible to tests. */
export const __strokeForTests = strokeFor;
export const __markersForTests = markersFor;
