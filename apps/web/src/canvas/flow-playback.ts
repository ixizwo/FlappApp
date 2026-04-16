import { useMemo, useState } from 'react';
import type { Flow, FlowStep } from '../lib/api.ts';

/**
 * Phase 5 — Flow playback state machine.
 *
 * Given a Flow and a current step index, returns the sets of diagram node
 * and connection ids that should be highlighted, plus Back/Next handlers.
 * The canvas consumes `isActiveNode` / `isActiveEdge` to dim everything
 * else during playback. Returns `active: false` when no flow is playing.
 */
export interface FlowPlayback {
  active: boolean;
  flow: Flow | null;
  stepIndex: number;
  step: FlowStep | null;
  totalSteps: number;
  canBack: boolean;
  canNext: boolean;
  start: (flow: Flow) => void;
  stop: () => void;
  next: () => void;
  back: () => void;
  goTo: (i: number) => void;
  isActiveNode: (diagramNodeId: string) => boolean;
  isActiveEdge: (connectionId: string) => boolean;
}

export function useFlowPlayback(): FlowPlayback {
  const [flow, setFlow] = useState<Flow | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const step = useMemo<FlowStep | null>(() => {
    if (!flow) return null;
    return flow.steps[stepIndex] ?? null;
  }, [flow, stepIndex]);

  const activeNodes = useMemo(() => {
    const set = new Set<string>();
    if (step) {
      for (const h of step.nodeHighlights) set.add(h.diagramNodeId);
    }
    return set;
  }, [step]);

  const activeEdges = useMemo(() => {
    const set = new Set<string>();
    if (step) {
      for (const h of step.edgeHighlights) set.add(h.connectionId);
    }
    return set;
  }, [step]);

  const totalSteps = flow?.steps.length ?? 0;

  return {
    active: !!flow && totalSteps > 0,
    flow,
    step,
    stepIndex,
    totalSteps,
    canBack: !!flow && stepIndex > 0,
    canNext: !!flow && stepIndex < totalSteps - 1,
    start: (f: Flow) => {
      setFlow(f);
      setStepIndex(0);
    },
    stop: () => {
      setFlow(null);
      setStepIndex(0);
    },
    next: () => setStepIndex((i) => Math.min(i + 1, totalSteps - 1)),
    back: () => setStepIndex((i) => Math.max(i - 1, 0)),
    goTo: (i: number) =>
      setStepIndex(Math.max(0, Math.min(i, totalSteps - 1))),
    isActiveNode: (id) => activeNodes.has(id),
    isActiveEdge: (id) => activeEdges.has(id),
  };
}
