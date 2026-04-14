import { useParams } from 'react-router-dom';

/**
 * Diagrams section — Phase 2 placeholder.
 *
 * The real interactive canvas (React Flow v12 with 12-handle nodes, auto
 * edge routing, groups, flow playback) lands in Phase 3. For now we
 * acknowledge the route and describe what will live here so the Left
 * Nav doesn't 404.
 */
export function DiagramsView() {
  const { domainId = '' } = useParams<{ domainId: string }>();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-surface-800 bg-surface-900/40 px-4 py-3">
        <h1 className="text-lg font-semibold">Diagrams</h1>
        <p className="text-xs text-surface-200">Domain {domainId}</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded border border-dashed border-surface-800 bg-surface-900/40 p-6 text-center">
          <div className="mb-2 text-4xl">📐</div>
          <h2 className="text-sm font-semibold text-surface-100">Canvas coming soon</h2>
          <p className="mt-2 text-xs text-surface-200">
            In Phase 3 this page becomes a React Flow canvas with auto-routed
            edges, 12 handles per node, group containers, and flow playback.
            Until then, explore the model via the Model Objects, Connections,
            and Dependencies tabs.
          </p>
        </div>
      </div>
    </div>
  );
}
