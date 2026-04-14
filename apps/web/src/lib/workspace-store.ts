import { create } from 'zustand';

/**
 * Workspace context store.
 *
 * The PRD puts Org → Landscape → Domain at the heart of navigation.
 * Every model view is scoped to a single Domain, so we keep the active
 * selection in a tiny zustand store that survives route changes and is
 * consumable from any deep-nested component without prop-drilling.
 *
 * We persist to localStorage manually (no zustand/persist middleware) to
 * keep the dependency footprint small and predictable.
 */

const STORAGE_KEY = 'flappapp.workspace.v1';

export interface WorkspaceState {
  organizationId: string | null;
  landscapeId: string | null;
  domainId: string | null;
  setOrganization: (id: string | null) => void;
  setLandscape: (id: string | null) => void;
  setDomain: (id: string | null) => void;
}

function load(): Pick<WorkspaceState, 'organizationId' | 'landscapeId' | 'domainId'> {
  if (typeof window === 'undefined') {
    return { organizationId: null, landscapeId: null, domainId: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('no value');
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    return {
      organizationId: parsed.organizationId ?? null,
      landscapeId: parsed.landscapeId ?? null,
      domainId: parsed.domainId ?? null,
    };
  } catch {
    return { organizationId: null, landscapeId: null, domainId: null };
  }
}

function persist(state: Pick<WorkspaceState, 'organizationId' | 'landscapeId' | 'domainId'>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  ...load(),
  setOrganization: (id) => {
    // Switching orgs invalidates nested selections so you don't carry a
    // stale landscape/domain pointer into an unrelated workspace.
    set({ organizationId: id, landscapeId: null, domainId: null });
    persist({ organizationId: id, landscapeId: null, domainId: null });
  },
  setLandscape: (id) => {
    const { organizationId } = get();
    set({ landscapeId: id, domainId: null });
    persist({ organizationId, landscapeId: id, domainId: null });
  },
  setDomain: (id) => {
    const { organizationId, landscapeId } = get();
    set({ domainId: id });
    persist({ organizationId, landscapeId, domainId: id });
  },
}));
