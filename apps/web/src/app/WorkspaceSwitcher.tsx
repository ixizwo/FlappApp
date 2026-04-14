import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useWorkspaceStore } from '../lib/workspace-store.ts';

/**
 * Three chained dropdowns: Org → Landscape → Domain. Picking a Domain
 * auto-navigates to its Model Objects view so the active selection is
 * always reflected in the URL (which in turn keeps the Left Nav correct).
 *
 * We rely on TanStack Query's caching — switching back to a previous
 * Org/Landscape returns immediately without hitting the network again.
 */
export function WorkspaceSwitcher() {
  const store = useWorkspaceStore();
  const navigate = useNavigate();

  const orgs = useQuery({
    queryKey: ['organizations'],
    queryFn: api.organizations.list,
  });

  const landscapes = useQuery({
    queryKey: ['landscapes', store.organizationId],
    queryFn: () => api.landscapes.list(store.organizationId ?? undefined),
    enabled: !!store.organizationId,
  });

  const domains = useQuery({
    queryKey: ['domains', store.landscapeId],
    queryFn: () => api.domains.list(store.landscapeId ?? undefined),
    enabled: !!store.landscapeId,
  });

  // Auto-select the first Organization once data lands, so a fresh user
  // doesn't stare at an empty dropdown.
  useEffect(() => {
    if (!store.organizationId && orgs.data && orgs.data.length > 0) {
      store.setOrganization(orgs.data[0]!.id);
    }
  }, [orgs.data, store]);

  useEffect(() => {
    if (
      store.organizationId &&
      !store.landscapeId &&
      landscapes.data &&
      landscapes.data.length > 0
    ) {
      store.setLandscape(landscapes.data[0]!.id);
    }
  }, [landscapes.data, store]);

  useEffect(() => {
    if (store.landscapeId && !store.domainId && domains.data && domains.data.length > 0) {
      const first = domains.data[0]!;
      store.setDomain(first.id);
      navigate(`/domains/${first.id}/objects`, { replace: true });
    }
  }, [domains.data, store, navigate]);

  return (
    <div className="flex items-center gap-2 text-xs">
      <Select
        value={store.organizationId ?? ''}
        onChange={(v) => store.setOrganization(v || null)}
        placeholder={orgs.isLoading ? 'Loading…' : 'Organization'}
        options={orgs.data ?? []}
      />
      <span className="text-surface-200">/</span>
      <Select
        value={store.landscapeId ?? ''}
        onChange={(v) => store.setLandscape(v || null)}
        placeholder="Landscape"
        options={landscapes.data ?? []}
        disabled={!store.organizationId}
      />
      <span className="text-surface-200">/</span>
      <Select
        value={store.domainId ?? ''}
        onChange={(v) => {
          store.setDomain(v || null);
          if (v) navigate(`/domains/${v}/objects`);
        }}
        placeholder="Domain"
        options={domains.data ?? []}
        disabled={!store.landscapeId}
      />
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { id: string; name: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={placeholder}
      className="rounded border border-surface-800 bg-surface-950 px-2 py-1 text-xs text-surface-100 disabled:opacity-40"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
