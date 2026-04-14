import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useWorkspaceStore } from '../lib/workspace-store.ts';

/**
 * Default landing — lists the Domains in the active Landscape so the
 * user can pick a workspace without relying on the top-bar dropdowns.
 * If nothing is selected yet we guide them through picking an org first.
 */
export function HomeView() {
  const store = useWorkspaceStore();
  const navigate = useNavigate();

  const domains = useQuery({
    queryKey: ['domains', store.landscapeId],
    queryFn: () => api.domains.list(store.landscapeId ?? undefined),
    enabled: !!store.landscapeId,
  });

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Welcome to FlappApp</h1>
      <p className="mt-2 text-surface-200">
        Pick a Domain from the top bar to start exploring its model. Everything
        below the Domain is scoped to that workspace.
      </p>

      {store.landscapeId && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-surface-200">
            Domains in this landscape
          </h2>
          <ul className="mt-2 divide-y divide-surface-800 overflow-hidden rounded border border-surface-800">
            {(domains.data ?? []).map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => {
                    store.setDomain(d.id);
                    navigate(`/domains/${d.id}/objects`);
                  }}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-900"
                >
                  <div>
                    <div className="font-medium text-surface-100">{d.name}</div>
                    {d.description && (
                      <div className="text-xs text-surface-200">{d.description}</div>
                    )}
                  </div>
                  <span className="text-xs text-surface-200">Open →</span>
                </button>
              </li>
            ))}
            {domains.data && domains.data.length === 0 && (
              <li className="px-4 py-3 text-sm text-surface-200">
                No domains in this landscape yet.
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
