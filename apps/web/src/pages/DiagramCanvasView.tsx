import {
  addEdge as rfAddEdge,
  Background,
  BackgroundVariant,
  Connection as RfConnection,
  ConnectionLineType,
  Controls,
  Edge,
  EdgeTypes,
  MiniMap,
  Node,
  NodeChange,
  NodeTypes,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ConnectionDirection,
  LineShape,
  ObjectStatus,
  ObjectType,
  levelOf,
} from '@flappapp/shared';
import {
  api,
  type Connection as ApiConnection,
  type Diagram,
  type DiagramNode as ApiDiagramNode,
  type Flow,
  type Group,
  type ModelObject,
  type Tag,
} from '../lib/api.ts';
import {
  C4EdgeDefs,
  c4EdgeTypes,
  type C4EdgeData,
} from '../canvas/c4-edge.tsx';
import { c4NodeTypes } from '../canvas/c4-nodes.tsx';
import { groupNodeType } from '../canvas/group-node.tsx';
import { useAutosave } from '../canvas/use-autosave.ts';
import { useFlowPlayback } from '../canvas/flow-playback.ts';
import { typeGlyph, typeTextClass } from '../lib/ui.ts';

/**
 * The Phase 3 interactive canvas.
 *
 * Wraps React Flow with a C4-aware node palette on the left, a properties
 * panel on the right, and a debounced autosave that persists position
 * changes back to the API. Dragging an object from the palette onto the
 * canvas calls POST /diagrams/:id/nodes; connecting two handles calls
 * POST /connections + POST /diagrams/:id/edges atomically (well — as
 * two requests; an MVP shortcut).
 */
export function DiagramCanvasView() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

const DIAGRAM_DND_MIME = 'application/x-flappapp-model-object';

function CanvasInner() {
  const { domainId = '', diagramId = '' } = useParams<{
    domainId: string;
    diagramId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { screenToFlowPosition } = useReactFlow();

  const diagramQuery = useQuery({
    queryKey: ['diagram', diagramId],
    queryFn: () => api.diagrams.get(diagramId),
    enabled: !!diagramId,
  });

  const objectsQuery = useQuery({
    queryKey: ['model-objects', domainId],
    queryFn: () => api.modelObjects.list({ domainId }),
    enabled: !!domainId,
  });

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showImplied, setShowImplied] = useState(true);

  // Implied connections for this domain at the current diagram level.
  // Phase 4: dashed, click-through, rendered below the concrete edges.
  const impliedQuery = useQuery({
    queryKey: ['implied-connections', domainId, diagramQuery.data?.level],
    queryFn: () =>
      api.connections.implied(domainId, diagramQuery.data!.level),
    enabled: !!domainId && !!diagramQuery.data,
  });

  // Phase 5 — groups, flows, and tags for this diagram/domain.
  const groupsQuery = useQuery({
    queryKey: ['groups', diagramId],
    queryFn: () => api.groups.list(diagramId),
    enabled: !!diagramId,
  });
  const flowsQuery = useQuery({
    queryKey: ['flows', diagramId],
    queryFn: () => api.flows.list(diagramId),
    enabled: !!diagramId,
  });
  const tagsQuery = useQuery({
    queryKey: ['tags', domainId],
    queryFn: () => api.tags.list(domainId),
    enabled: !!domainId,
  });

  // Phase 5 — flow playback + tag bar focus.
  const playback = useFlowPlayback();
  const [focusTagId, setFocusTagId] = useState<string | null>(null);

  // Hydrate RF state whenever fresh diagram data, groups, or implied projections
  // come back. Group nodes are RF "parent" nodes whose children are the
  // DiagramNodes assigned to them — React Flow uses `parentId` on child
  // nodes plus a large zIndex-less node with `type: 'group'` to render the
  // visual container.
  useEffect(() => {
    if (!diagramQuery.data) return;
    const data = diagramQuery.data;
    const nodeByObjectId = new Map<string, string>();
    for (const n of data.nodes) nodeByObjectId.set(n.modelObjectId, n.id);

    // Phase 5: render groups as React Flow parent nodes positioned *before*
    // their children so the z-order is correct.
    const groupNodes: Node[] = (groupsQuery.data ?? []).map(
      (g: Group): Node => ({
        id: `group-${g.id}`,
        type: 'group',
        position: { x: g.x, y: g.y },
        style: { width: g.w, height: g.h },
        data: { name: g.name, kind: g.kind },
        ...(g.parentGroupId
          ? { parentId: `group-${g.parentGroupId}`, extent: 'parent' as const }
          : {}),
      }),
    );

    setNodes([...groupNodes, ...data.nodes.map(apiNodeToRfNode)]);

    const concrete = data.edges
      .map((e) => apiEdgeToRfEdge(e, nodeByObjectId))
      .filter((e): e is Edge => e !== null);

    // Concrete connections already on the diagram — used to dedupe so the
    // implied layer never double-draws an already-drawn edge.
    const concretePairs = new Set(
      data.edges.map(
        (e) => `${e.connection.senderId}→${e.connection.receiverId}`,
      ),
    );

    const implied: Edge[] = [];
    if (showImplied && impliedQuery.data) {
      for (const ic of impliedQuery.data) {
        if (ic.selfLoop) continue;
        const key = `${ic.senderId}→${ic.receiverId}`;
        if (concretePairs.has(key)) continue;
        const source = nodeByObjectId.get(ic.senderId);
        const target = nodeByObjectId.get(ic.receiverId);
        if (!source || !target) continue;
        implied.push({
          id: `implied-${ic.senderId}-${ic.receiverId}`,
          source,
          target,
          type: 'c4',
          selectable: true,
          data: {
            connectionId: ic.sourceConnectionIds[0] ?? '',
            direction: ConnectionDirection.OUTGOING,
            status: ObjectStatus.LIVE,
            lineShape: LineShape.CURVED,
            description: null,
            viaNodeId: null,
            viaName: null,
            implied: true,
            impliedCount: ic.sourceConnectionIds.length,
          } satisfies C4EdgeData,
        });
      }
    }

    setEdges([...implied, ...concrete]);
  }, [diagramQuery.data, groupsQuery.data, impliedQuery.data, showImplied]);

  // Debounced autosave for node position changes.
  const positionSave = useAutosave<{ x: number; y: number }>(async (batch) => {
    await Promise.all(
      Array.from(batch.entries()).map(([nodeId, pos]) =>
        api.diagrams.updateNode(nodeId, pos),
      ),
    );
    // No refetch — server state is already in sync with our optimistic nodes.
  }, 500);

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns));
      for (const c of changes) {
        if (c.type === 'position' && c.position && !c.dragging) {
          // Flush the *final* position — skip intermediate drag ticks.
          positionSave.mark(c.id, { x: c.position.x, y: c.position.y });
        }
      }
    },
    [positionSave],
  );

  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    setEdges((es) => applyEdgeChanges(changes, es));
  }, []);

  // Create a connection (model + diagram edge) when two handles are wired up.
  const connectMutation = useMutation({
    mutationFn: async (payload: {
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
    }) => {
      const conn = await api.connections.create({
        senderId: payload.source,
        receiverId: payload.target,
        direction: ConnectionDirection.OUTGOING,
      });
      const edge = await api.diagrams.addEdge(diagramId, {
        connectionId: conn.id,
        ...(payload.sourceHandle && { sourceHandle: payload.sourceHandle }),
        ...(payload.targetHandle && { targetHandle: payload.targetHandle }),
      });
      return { conn, edge };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['diagram', diagramId] });
      void queryClient.invalidateQueries({ queryKey: ['connections', domainId] });
    },
  });

  const onConnect: OnConnect = useCallback(
    (params: RfConnection) => {
      if (!params.source || !params.target) return;
      if (params.source === params.target) return;
      // params.source / params.target are DiagramNode ids — we need to
      // map them back to ModelObject ids for the Connection payload.
      const data = diagramQuery.data;
      if (!data) return;
      const sourceObj = data.nodes.find((n) => n.id === params.source);
      const targetObj = data.nodes.find((n) => n.id === params.target);
      if (!sourceObj || !targetObj) return;

      // Optimistically render the edge with a placeholder c4 payload —
      // the real one comes in via refetch right after the mutation.
      setEdges((es) =>
        rfAddEdge(
          {
            ...params,
            type: 'c4',
            animated: false,
            data: {
              connectionId: '',
              direction: ConnectionDirection.OUTGOING,
              status: ObjectStatus.LIVE,
              lineShape: LineShape.CURVED,
              description: null,
              viaNodeId: null,
              viaName: null,
              implied: false,
            } satisfies C4EdgeData,
          },
          es,
        ),
      );
      connectMutation.mutate({
        source: sourceObj.modelObjectId,
        target: targetObj.modelObjectId,
        ...(params.sourceHandle && { sourceHandle: params.sourceHandle }),
        ...(params.targetHandle && { targetHandle: params.targetHandle }),
      });
    },
    [connectMutation, diagramQuery.data],
  );

  // ── Drag-drop from palette ────────────────────────────────────────

  const addNodeMutation = useMutation({
    mutationFn: (input: { modelObjectId: string; x: number; y: number }) =>
      api.diagrams.addNode(diagramId, input),
    onSuccess: (created) => {
      setNodes((ns) => [...ns, apiNodeToRfNode(created)]);
      void queryClient.invalidateQueries({ queryKey: ['diagram', diagramId] });
    },
  });

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const objectId = event.dataTransfer.getData(DIAGRAM_DND_MIME);
      if (!objectId) return;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNodeMutation.mutate({ modelObjectId: objectId, x: position.x, y: position.y });
    },
    [addNodeMutation, screenToFlowPosition],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // ── Node deletion ─────────────────────────────────────────────────

  const removeNodeMutation = useMutation({
    mutationFn: (nodeId: string) => api.diagrams.removeNode(nodeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['diagram', diagramId] });
    },
  });

  const deleteObjectMutation = useMutation({
    mutationFn: (objectId: string) => api.modelObjects.remove(objectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['diagram', diagramId] });
      void queryClient.invalidateQueries({ queryKey: ['model-objects', domainId] });
      void queryClient.invalidateQueries({ queryKey: ['connections', domainId] });
    },
  });

  // ── Edge (Connection) edit/delete ────────────────────────────────

  const updateConnectionMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      patch: {
        direction?: ConnectionDirection;
        status?: ObjectStatus;
        lineShape?: LineShape;
        description?: string | null;
      };
    }) => api.connections.update(payload.id, payload.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['diagram', diagramId] });
      void queryClient.invalidateQueries({ queryKey: ['connections', domainId] });
      void queryClient.invalidateQueries({
        queryKey: ['implied-connections', domainId],
      });
    },
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: (connectionId: string) => api.connections.remove(connectionId),
    onSuccess: () => {
      setSelectedEdgeId(null);
      void queryClient.invalidateQueries({ queryKey: ['diagram', diagramId] });
      void queryClient.invalidateQueries({ queryKey: ['connections', domainId] });
      void queryClient.invalidateQueries({
        queryKey: ['implied-connections', domainId],
      });
    },
  });

  // ── Drill-down into the child diagram (+🔍) ──────────────────────

  const drilldown = useCallback(
    async (modelObjectId: string) => {
      const resolved = await api.diagrams.drilldown(diagramId, modelObjectId);
      if (resolved) {
        navigate(`/domains/${domainId}/diagrams/${resolved.diagramId}`);
        return;
      }
      const ok = window.confirm(
        'No child diagram exists for this object yet. Open the diagrams list to create one?',
      );
      if (ok) navigate(`/domains/${domainId}/diagrams`);
    },
    [diagramId, domainId, navigate],
  );

  // ── Quick-create via keyboard (PRD §5 shortcuts) ─────────────────

  const quickCreateMutation = useMutation({
    mutationFn: async (input: {
      type: ObjectType;
      name: string;
      x: number;
      y: number;
    }) => {
      const diagram = diagramQuery.data;
      if (!diagram) throw new Error('diagram not loaded');
      // SYSTEM and ACTOR are top-level; APP/STORE/COMPONENT need a
      // scope object that the MVP's L2/L3 canvases will one day carry.
      // For now we restrict quick-create to top-level types on L1.
      const obj = await api.modelObjects.create({
        domainId,
        parentId: null,
        type: input.type,
        name: input.name,
      });
      const node = await api.diagrams.addNode(diagramId, {
        modelObjectId: obj.id,
        x: input.x,
        y: input.y,
      });
      return node;
    },
    onSuccess: (node) => {
      setNodes((ns) => [...ns, apiNodeToRfNode(node)]);
      void queryClient.invalidateQueries({ queryKey: ['diagram', diagramId] });
      void queryClient.invalidateQueries({ queryKey: ['model-objects', domainId] });
    },
  });

  // Keyboard: Delete removes selected node; Shift+S/A/C/R/D quick-create.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'))
        return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault();
        removeNodeMutation.mutate(selectedNodeId);
        setNodes((ns) => ns.filter((n) => n.id !== selectedNodeId));
        setSelectedNodeId(null);
        return;
      }

      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Only top-level types (ACTOR, SYSTEM) quick-create from the
        // keyboard in Phase 3 — child types need a parent picker which
        // lands in Phase 5 with the scoped L2/L3 canvases.
        const map: Record<string, ObjectType | undefined> = {
          S: ObjectType.SYSTEM,
          A: ObjectType.ACTOR,
        };
        const type = map[e.key.toUpperCase()];
        const diagram = diagramQuery.data;
        if (!type || !diagram) return;
        if (levelOf(type) > diagram.level) return;
        e.preventDefault();
        const name = window.prompt(`New ${type} name`)?.trim();
        if (!name) return;
        quickCreateMutation.mutate({ type, name, x: 120, y: 120 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [removeNodeMutation, selectedNodeId, quickCreateMutation, diagramQuery.data]);

  const selectedNode = useMemo(
    () =>
      selectedNodeId
        ? diagramQuery.data?.nodes.find((n) => n.id === selectedNodeId)
        : undefined,
    [diagramQuery.data, selectedNodeId],
  );

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId || !diagramQuery.data) return undefined;
    // Implied edges aren't editable — we still surface their source
    // connection list in the panel so users can drill into it.
    if (selectedEdgeId.startsWith('implied-')) {
      const [, senderId, receiverId] = selectedEdgeId.split('-');
      const implied = impliedQuery.data?.find(
        (i) => i.senderId === senderId && i.receiverId === receiverId,
      );
      if (!implied) return undefined;
      return { kind: 'implied' as const, implied };
    }
    const edge = diagramQuery.data.edges.find((e) => e.id === selectedEdgeId);
    if (!edge) return undefined;
    return { kind: 'concrete' as const, edge };
  }, [diagramQuery.data, impliedQuery.data, selectedEdgeId]);

  const diagram = diagramQuery.data;
  const objects = objectsQuery.data ?? [];
  const existingObjectIds = useMemo(
    () => new Set((diagram?.nodes ?? []).map((n) => n.modelObjectId)),
    [diagram],
  );
  const paletteObjects = useMemo(() => {
    if (!diagram) return [] as ModelObject[];
    return objects
      .filter((o) => levelOf(o.type) <= diagram.level)
      .filter((o) => !existingObjectIds.has(o.id));
  }, [objects, diagram, existingObjectIds]);

  // Build a lookup: objectId → Set<tagId>, used for tag-bar focus filtering.
  const objectTagIndex = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const obj of objectsQuery.data ?? []) {
      const tags = new Set<string>();
      for (const tl of obj.tagLinks ?? []) tags.add(tl.tag.id);
      m.set(obj.id, tags);
    }
    return m;
  }, [objectsQuery.data]);

  // Inject per-node callbacks (drill-down), Phase 5 dimming (flow playback
  // + tag-bar focus), and tech-choice chips into RF node data.
  const nodesWithActions = useMemo(
    () =>
      nodes.map((n) => {
        // Group nodes don't need callbacks or dimming — skip.
        if (n.type === 'group') return n;
        const apiNode = diagramQuery.data?.nodes.find((dn) => dn.id === n.id);
        const objId = apiNode?.modelObjectId;
        const dimmed =
          playback.active && objId
            ? !playback.isActiveNode(n.id)
            : false;
        const tagFiltered =
          focusTagId && objId
            ? !(objectTagIndex.get(objId)?.has(focusTagId) ?? false)
            : false;
        return {
          ...n,
          data: {
            ...(n.data as Record<string, unknown>),
            dimmed,
            tagFiltered,
            onDrilldown: apiNode
              ? () => drilldown(apiNode.modelObjectId)
              : undefined,
          },
        };
      }),
    [nodes, diagramQuery.data, drilldown, playback, focusTagId, objectTagIndex],
  );

  // Phase 5: dim edges during flow playback.
  const edgesWithDim = useMemo(
    () =>
      edges.map((e) => {
        if (!playback.active) return e;
        const d = e.data as C4EdgeData | undefined;
        const connectionId = d?.connectionId ?? '';
        const isDim = !playback.isActiveEdge(connectionId);
        return { ...e, data: { ...d, dimmed: isDim } };
      }),
    [edges, playback],
  );

  // Merge the C4 node types with the group node type.
  const allNodeTypes = useMemo(
    () => ({ ...c4NodeTypes, ...groupNodeType }) as unknown as NodeTypes,
    [],
  );

  return (
    <div className="flex h-full min-h-0">
      <Palette
        objects={paletteObjects}
        diagramLevel={diagram?.level ?? 1}
      />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* ── Top toolbar ─────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-surface-800 bg-surface-900/40 px-4 py-2">
          <Link
            to={`/domains/${domainId}/diagrams`}
            className="text-xs text-surface-200 hover:underline"
          >
            ← All diagrams
          </Link>
          <h1 className="text-sm font-semibold">
            {diagram ? diagram.name : 'Loading…'}
          </h1>
          {diagram && (
            <span className="font-mono text-[10px] text-surface-200">
              L{diagram.level} · {nodes.length} nodes · {edges.length} edges
            </span>
          )}
          <label className="ml-auto flex cursor-pointer items-center gap-1 text-[10px] text-surface-200">
            <input
              type="checkbox"
              checked={showImplied}
              onChange={(e) => setShowImplied(e.target.checked)}
              className="h-3 w-3 accent-indigo-400"
            />
            <span>Show implied</span>
          </label>
          {/* Phase 5: flow playback dropdown */}
          {flowsQuery.data && flowsQuery.data.length > 0 && !playback.active && (
            <select
              onChange={(e) => {
                const f = flowsQuery.data?.find(
                  (fl: Flow) => fl.id === e.target.value,
                );
                if (f) playback.start(f);
              }}
              defaultValue=""
              className="rounded border border-surface-800 bg-surface-950 px-1 py-0.5 text-[10px] text-surface-100"
            >
              <option value="" disabled>
                Play flow…
              </option>
              {flowsQuery.data.map((f: Flow) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <span className="text-[10px] text-surface-200">
            {positionSave.isDirty() ? 'saving…' : 'saved'}
          </span>
        </div>

        {/* ── Phase 5: Flow playback bar (appears when a flow is active) */}
        {playback.active && playback.step && (
          <div className="flex shrink-0 items-center gap-2 border-b border-indigo-500/30 bg-indigo-950/40 px-4 py-1.5">
            <button
              type="button"
              disabled={!playback.canBack}
              onClick={playback.back}
              className="rounded border border-surface-800 px-2 py-0.5 text-[10px] text-surface-100 disabled:opacity-30"
            >
              Back
            </button>
            <span className="text-xs font-semibold text-indigo-200">
              {playback.step.title}
            </span>
            <span className="text-[10px] text-surface-200">
              Step {playback.stepIndex + 1} / {playback.totalSteps}
            </span>
            {playback.step.description && (
              <span className="text-[10px] text-surface-200">
                — {playback.step.description}
              </span>
            )}
            <button
              type="button"
              disabled={!playback.canNext}
              onClick={playback.next}
              className="rounded border border-surface-800 px-2 py-0.5 text-[10px] text-surface-100 disabled:opacity-30"
            >
              Next
            </button>
            <button
              type="button"
              onClick={playback.stop}
              className="ml-auto rounded border border-rose-800 px-2 py-0.5 text-[10px] text-rose-300"
            >
              Stop
            </button>
          </div>
        )}

        {/* ── Canvas ──────────────────────────────────────────────── */}
        <div
          className="flex-1"
          onDrop={onDrop}
          onDragOver={onDragOver}
          data-testid="canvas-drop"
        >
          <C4EdgeDefs />
          <ReactFlow
            nodes={nodesWithActions}
            edges={edgesWithDim}
            nodeTypes={allNodeTypes}
            edgeTypes={c4EdgeTypes as unknown as EdgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_e, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_e, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls />
            <MiniMap zoomable pannable className="!bg-surface-900" />
          </ReactFlow>
        </div>

        {/* ── Phase 5: Bottom tag bar — focus mode ────────────────── */}
        {(tagsQuery.data ?? []).length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 border-t border-surface-800 bg-surface-900/60 px-4 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-200">
              Tags
            </span>
            {(tagsQuery.data ?? []).map((tag: Tag & { _count?: { objects: number } }) => (
              <button
                key={tag.id}
                type="button"
                onClick={() =>
                  setFocusTagId((prev) => (prev === tag.id ? null : tag.id))
                }
                className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                  focusTagId === tag.id
                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200'
                    : 'border-surface-800 bg-surface-950 text-surface-200 hover:border-surface-600'
                }`}
                style={
                  focusTagId !== tag.id
                    ? { borderLeftColor: tag.color, borderLeftWidth: 3 }
                    : undefined
                }
              >
                {tag.name}
                {tag._count?.objects !== undefined && (
                  <span className="ml-1 text-surface-200/60">
                    {tag._count.objects}
                  </span>
                )}
              </button>
            ))}
            {focusTagId && (
              <button
                type="button"
                onClick={() => setFocusTagId(null)}
                className="ml-1 text-[10px] text-surface-200 underline"
              >
                clear
              </button>
            )}
          </div>
        )}
      </div>
      {selectedEdge ? (
        <EdgePropertiesPanel
          selection={selectedEdge}
          onDrillIntoImplied={(connectionId) => {
            // Jump to the Connections view filtered by the concrete link
            navigate(
              `/domains/${domainId}/connections?focus=${connectionId}`,
            );
          }}
          onUpdate={(patch) => {
            if (selectedEdge.kind !== 'concrete') return;
            updateConnectionMutation.mutate({
              id: selectedEdge.edge.connectionId,
              patch,
            });
          }}
          onRemoveFromDiagram={() => {
            if (selectedEdge.kind !== 'concrete') return;
            // Remove from diagram only — leaves the Connection in the model.
            void api.diagrams.removeEdge(selectedEdge.edge.id).then(() => {
              setSelectedEdgeId(null);
              void queryClient.invalidateQueries({
                queryKey: ['diagram', diagramId],
              });
            });
          }}
          onDeleteConnection={() => {
            if (selectedEdge.kind !== 'concrete') return;
            const ok = window.confirm(
              'Delete this connection from the model? It will disappear from every diagram.',
            );
            if (!ok) return;
            deleteConnectionMutation.mutate(selectedEdge.edge.connectionId);
          }}
        />
      ) : (
        <PropertiesPanel
          node={selectedNode}
          onDrilldown={() =>
            selectedNode && drilldown(selectedNode.modelObjectId)
          }
          onRemoveFromDiagram={() => {
            if (!selectedNodeId) return;
            removeNodeMutation.mutate(selectedNodeId);
            setNodes((ns) => ns.filter((n) => n.id !== selectedNodeId));
            setSelectedNodeId(null);
          }}
          onDeleteFromModel={async () => {
            if (!selectedNode) return;
            const impact = await api.modelObjects.deletionImpact(
              selectedNode.modelObjectId,
            );
            const ok = window.confirm(
              `Delete ${selectedNode.modelObject.name} from the model?\n\n` +
                `This will remove ${impact.objectIds.length} object(s) and ` +
                `${impact.connectionIds.length} connection(s) across every diagram.\n\n` +
                'This cannot be undone.',
            );
            if (!ok) return;
            deleteObjectMutation.mutate(selectedNode.modelObjectId);
            setSelectedNodeId(null);
            navigate(`/domains/${domainId}/diagrams/${diagramId}`);
          }}
        />
      )}
    </div>
  );
}

function apiNodeToRfNode(node: ApiDiagramNode): Node {
  const rf: Node = {
    id: node.id,
    type: node.modelObject.type,
    position: { x: node.x, y: node.y },
    data: {
      objectType: node.modelObject.type as ObjectType,
      name: node.modelObject.name,
      description: node.modelObject.displayDescription,
      techChoice: node.modelObject.techChoice?.name ?? null,
      techIcon: node.modelObject.techChoice?.icon ?? null,
      status: node.modelObject.status as ObjectStatus,
      selected: false,
    },
    style: {
      width: node.w,
      height: node.h,
    },
  };
  if (node.groupId) {
    rf.parentId = `group-${node.groupId}`;
    rf.extent = 'parent';
  }
  return rf;
}

function apiEdgeToRfEdge(
  edge: Diagram['edges'][number],
  nodeByObjectId: Map<string, string>,
): Edge | null {
  const source = nodeByObjectId.get(edge.connection.senderId);
  const target = nodeByObjectId.get(edge.connection.receiverId);
  if (!source || !target) return null;
  const viaNodeId = edge.connection.viaId
    ? nodeByObjectId.get(edge.connection.viaId) ?? null
    : null;
  const data: C4EdgeData = {
    connectionId: edge.connectionId,
    direction: edge.connection.direction,
    status: edge.connection.status,
    lineShape: edge.connection.lineShape,
    description: edge.connection.description,
    viaNodeId,
    viaName: edge.connection.via?.name ?? null,
    implied: false,
  };
  const rfEdge: Edge = {
    id: edge.id,
    source,
    target,
    type: 'c4',
    animated: edge.connection.status === ObjectStatus.FUTURE,
    data,
  };
  if (edge.sourceHandle) rfEdge.sourceHandle = edge.sourceHandle;
  if (edge.targetHandle) rfEdge.targetHandle = edge.targetHandle;
  return rfEdge;
}

function Palette({
  objects,
  diagramLevel,
}: {
  objects: ModelObject[];
  diagramLevel: number;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return objects;
    const q = search.toLowerCase();
    return objects.filter((o) => o.name.toLowerCase().includes(q));
  }, [objects, search]);

  const onDragStart = (event: DragEvent, objectId: string) => {
    event.dataTransfer.setData(DIAGRAM_DND_MIME, objectId);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-surface-800 bg-surface-900">
      <div className="border-b border-surface-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-200">
          Model Palette
        </h2>
        <p className="text-[10px] text-surface-200">
          Drag onto the canvas · L1–L{diagramLevel}
        </p>
      </div>
      <div className="border-b border-surface-800 p-2">
        <input
          type="search"
          placeholder="Filter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-100"
          aria-label="Filter palette"
        />
      </div>
      <ul className="flex-1 overflow-auto">
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-xs text-surface-200">
            Nothing left to add.
          </li>
        )}
        {filtered.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              draggable
              onDragStart={(e) => onDragStart(e, o.id)}
              className="flex w-full items-center gap-2 border-b border-surface-800/60 px-3 py-2 text-left text-xs hover:bg-surface-800"
            >
              <span className={typeTextClass(o.type)}>{typeGlyph(o.type)}</span>
              <span className="truncate text-surface-100">{o.name}</span>
              <span className="ml-auto font-mono text-[9px] text-surface-200">
                L{levelOf(o.type)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function PropertiesPanel({
  node,
  onDrilldown,
  onRemoveFromDiagram,
  onDeleteFromModel,
}: {
  node: ApiDiagramNode | undefined;
  onDrilldown: () => void;
  onRemoveFromDiagram: () => void;
  onDeleteFromModel: () => void;
}) {
  if (!node) {
    return (
      <aside className="w-64 shrink-0 border-l border-surface-800 bg-surface-900 p-4 text-xs text-surface-200">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-200">
          Properties
        </h2>
        <p className="mt-2">Select a node or edge to inspect.</p>
      </aside>
    );
  }
  const obj = node.modelObject;
  const canDrill = obj.type !== 'ACTOR' && obj.type !== 'COMPONENT';
  return (
    <aside className="w-64 shrink-0 border-l border-surface-800 bg-surface-900 p-4 text-xs">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-200">
        Properties
      </h2>
      <div className="mt-2 flex items-center gap-2">
        <span className={typeTextClass(obj.type)}>{typeGlyph(obj.type)}</span>
        <span className="text-sm font-semibold text-surface-100">{obj.name}</span>
      </div>
      <div className="mt-2 font-mono text-[10px] text-surface-200">
        {obj.type} · {obj.status}
      </div>
      {obj.displayDescription && (
        <p className="mt-2 text-surface-200">{obj.displayDescription}</p>
      )}
      {obj.techChoice && (
        <div className="mt-2 inline-block rounded bg-surface-800 px-1.5 py-0.5 text-[10px] text-surface-200">
          {obj.techChoice.name}
        </div>
      )}
      {canDrill && (
        <div className="mt-4 border-t border-surface-800 pt-3">
          <button
            type="button"
            onClick={onDrilldown}
            className="w-full rounded border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-left text-xs text-indigo-200 hover:border-indigo-400"
          >
            <span className="mr-1">+🔍</span>
            Drill into child diagram
            <div className="text-[10px] text-indigo-300/70">
              Navigate to the next C4 level for this object
            </div>
          </button>
        </div>
      )}
      <div className="mt-6 border-t border-surface-800 pt-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-surface-200">
          Remove
        </h3>
        <button
          type="button"
          onClick={onRemoveFromDiagram}
          className="mt-2 w-full rounded border border-surface-800 bg-surface-950 px-2 py-1 text-left text-xs text-surface-100 hover:border-indigo-400"
        >
          Remove from Diagram
          <div className="text-[10px] text-surface-200">
            Keeps the object in the model
          </div>
        </button>
        <button
          type="button"
          onClick={onDeleteFromModel}
          className="mt-2 w-full rounded border border-rose-900 bg-rose-950/40 px-2 py-1 text-left text-xs text-rose-300 hover:border-rose-400"
        >
          Delete from Model
          <div className="text-[10px] text-rose-400/80">
            Cascades across every diagram
          </div>
        </button>
      </div>
    </aside>
  );
}

type EdgeSelection =
  | { kind: 'concrete'; edge: Diagram['edges'][number] }
  | {
      kind: 'implied';
      implied: {
        senderId: string;
        receiverId: string;
        sourceConnectionIds: string[];
      };
    };

function EdgePropertiesPanel({
  selection,
  onUpdate,
  onRemoveFromDiagram,
  onDeleteConnection,
  onDrillIntoImplied,
}: {
  selection: EdgeSelection;
  onUpdate: (patch: {
    direction?: ConnectionDirection;
    status?: ObjectStatus;
    lineShape?: LineShape;
    description?: string | null;
  }) => void;
  onRemoveFromDiagram: () => void;
  onDeleteConnection: () => void;
  onDrillIntoImplied: (connectionId: string) => void;
}) {
  if (selection.kind === 'implied') {
    const { implied } = selection;
    return (
      <aside className="w-72 shrink-0 border-l border-surface-800 bg-surface-900 p-4 text-xs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
          Implied Connection
        </h2>
        <p className="mt-2 text-surface-200">
          This dashed edge isn't stored on the diagram — it's projected up
          from {implied.sourceConnectionIds.length} concrete connection
          {implied.sourceConnectionIds.length === 1 ? '' : 's'} at a lower
          C4 level.
        </p>
        <div className="mt-4 space-y-1">
          {implied.sourceConnectionIds.map((cid) => (
            <button
              key={cid}
              type="button"
              onClick={() => onDrillIntoImplied(cid)}
              className="block w-full truncate rounded border border-surface-800 bg-surface-950 px-2 py-1 text-left font-mono text-[10px] text-indigo-200 hover:border-indigo-400"
            >
              {cid.slice(0, 12)}…
            </button>
          ))}
        </div>
      </aside>
    );
  }

  const conn: ApiConnection = selection.edge.connection;
  return (
    <aside className="w-72 shrink-0 border-l border-surface-800 bg-surface-900 p-4 text-xs">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-200">
        Connection
      </h2>
      <div className="mt-2 text-surface-100">
        <span className="font-semibold">{conn.sender.name}</span>
        <span className="px-1 text-surface-200">→</span>
        <span className="font-semibold">{conn.receiver.name}</span>
      </div>
      {conn.via && (
        <div className="mt-1 text-[10px] text-surface-200">
          via <span className="text-surface-100">{conn.via.name}</span>
        </div>
      )}

      <div className="mt-4 space-y-3">
        <label className="block text-[10px] uppercase tracking-wider text-surface-200">
          Direction
          <select
            value={conn.direction}
            onChange={(e) =>
              onUpdate({ direction: e.target.value as ConnectionDirection })
            }
            className="mt-1 w-full rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-100"
          >
            <option value={ConnectionDirection.OUTGOING}>Outgoing →</option>
            <option value={ConnectionDirection.BIDIRECTIONAL}>
              Bidirectional ↔
            </option>
            <option value={ConnectionDirection.NONE}>None —</option>
          </select>
        </label>

        <label className="block text-[10px] uppercase tracking-wider text-surface-200">
          Status
          <select
            value={conn.status}
            onChange={(e) => onUpdate({ status: e.target.value as ObjectStatus })}
            className="mt-1 w-full rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-100"
          >
            <option value={ObjectStatus.LIVE}>Live</option>
            <option value={ObjectStatus.FUTURE}>Future</option>
            <option value={ObjectStatus.DEPRECATED}>Deprecated</option>
            <option value={ObjectStatus.REMOVED}>Removed</option>
          </select>
        </label>

        <label className="block text-[10px] uppercase tracking-wider text-surface-200">
          Line shape
          <select
            value={conn.lineShape}
            onChange={(e) => onUpdate({ lineShape: e.target.value as LineShape })}
            className="mt-1 w-full rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-100"
          >
            <option value={LineShape.CURVED}>Curved</option>
            <option value={LineShape.STRAIGHT}>Straight</option>
            <option value={LineShape.SQUARE}>Square</option>
          </select>
        </label>

        <label className="block text-[10px] uppercase tracking-wider text-surface-200">
          Description
          <input
            type="text"
            defaultValue={conn.description ?? ''}
            onBlur={(e) =>
              onUpdate({ description: e.target.value.trim() || null })
            }
            className="mt-1 w-full rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-100"
            placeholder="Label that appears on the edge"
          />
        </label>
      </div>

      <div className="mt-6 border-t border-surface-800 pt-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-surface-200">
          Remove
        </h3>
        <button
          type="button"
          onClick={onRemoveFromDiagram}
          className="mt-2 w-full rounded border border-surface-800 bg-surface-950 px-2 py-1 text-left text-xs text-surface-100 hover:border-indigo-400"
        >
          Remove from Diagram
        </button>
        <button
          type="button"
          onClick={onDeleteConnection}
          className="mt-2 w-full rounded border border-rose-900 bg-rose-950/40 px-2 py-1 text-left text-xs text-rose-300 hover:border-rose-400"
        >
          Delete Connection
          <div className="text-[10px] text-rose-400/80">
            Cascades across every diagram
          </div>
        </button>
      </div>
    </aside>
  );
}
