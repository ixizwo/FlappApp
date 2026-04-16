import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFlowPlayback } from './flow-playback.ts';
import type { Flow } from '../lib/api.ts';

/**
 * The Phase 5 flow playback state machine drives the dim-non-highlighted
 * effect and the Back/Next controls in the canvas toolbar. We pin it here
 * so the canvas integration can assume the hook behaves predictably.
 */

function makeFlow(steps: { nodes: string[]; edges: string[] }[]): Flow {
  return {
    id: 'f1',
    diagramId: 'd1',
    name: 'Test flow',
    description: null,
    createdAt: '',
    updatedAt: '',
    steps: steps.map((s, i) => ({
      id: `step-${i}`,
      flowId: 'f1',
      order: i,
      title: `Step ${i + 1}`,
      description: null,
      nodeHighlights: s.nodes.map((diagramNodeId) => ({ diagramNodeId })),
      edgeHighlights: s.edges.map((connectionId) => ({ connectionId })),
    })),
  };
}

describe('useFlowPlayback', () => {
  it('is inactive with no flow started', () => {
    const { result } = renderHook(() => useFlowPlayback());
    expect(result.current.active).toBe(false);
    expect(result.current.step).toBeNull();
  });

  it('activates and surfaces the first step on start()', () => {
    const { result } = renderHook(() => useFlowPlayback());
    const flow = makeFlow([
      { nodes: ['n1'], edges: ['c1'] },
      { nodes: ['n2'], edges: ['c2'] },
    ]);
    act(() => result.current.start(flow));
    expect(result.current.active).toBe(true);
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.isActiveNode('n1')).toBe(true);
    expect(result.current.isActiveNode('n2')).toBe(false);
    expect(result.current.isActiveEdge('c1')).toBe(true);
  });

  it('advances with next() and clamps at the end', () => {
    const { result } = renderHook(() => useFlowPlayback());
    const flow = makeFlow([
      { nodes: ['a'], edges: [] },
      { nodes: ['b'], edges: [] },
    ]);
    act(() => result.current.start(flow));
    expect(result.current.canNext).toBe(true);
    act(() => result.current.next());
    expect(result.current.stepIndex).toBe(1);
    expect(result.current.isActiveNode('b')).toBe(true);
    expect(result.current.canNext).toBe(false);
    // Next beyond the end is a no-op.
    act(() => result.current.next());
    expect(result.current.stepIndex).toBe(1);
  });

  it('steps back and clamps at zero', () => {
    const { result } = renderHook(() => useFlowPlayback());
    const flow = makeFlow([
      { nodes: ['a'], edges: [] },
      { nodes: ['b'], edges: [] },
    ]);
    act(() => result.current.start(flow));
    act(() => result.current.next());
    expect(result.current.canBack).toBe(true);
    act(() => result.current.back());
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.canBack).toBe(false);
    act(() => result.current.back());
    expect(result.current.stepIndex).toBe(0);
  });

  it('stop() resets the machine', () => {
    const { result } = renderHook(() => useFlowPlayback());
    const flow = makeFlow([{ nodes: ['a'], edges: [] }]);
    act(() => result.current.start(flow));
    act(() => result.current.stop());
    expect(result.current.active).toBe(false);
    expect(result.current.flow).toBeNull();
  });
});
