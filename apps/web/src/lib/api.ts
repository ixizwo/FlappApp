/**
 * Typed API client.
 *
 * One concern, one file. No hand-maintained request/response interfaces —
 * the payload shapes come from @flappapp/shared so the web app and the
 * NestJS service always agree at compile time. Every call goes through
 * `apiFetch`, which gives us one place to add auth headers, error
 * normalization, and telemetry later.
 */
import type {
  C4Level,
  ConnectionDirection,
  LineShape,
  ObjectStatus,
  ObjectType,
} from '@flappapp/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Base URL — Vite dev server proxies /api → http://localhost:3000. */
const API_BASE = '/api';

async function apiFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const { query, ...rest } = init;
  const qs = query
    ? '?' +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const res = await fetch(`${API_BASE}${path}${qs}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(rest.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new ApiError(res.status, `HTTP ${res.status} ${res.statusText}`, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ─────────────────────────────────────────────────────────────
// Domain types — mirror server DTOs via shared package where possible
// ─────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface Landscape {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
}

export interface Domain {
  id: string;
  landscapeId: string;
  name: string;
  description: string | null;
}

export interface TechChoice {
  id: string;
  name: string;
  category: string;
  icon: string;
}

export interface Tag {
  id: string;
  domainId: string;
  name: string;
  color: string;
}

export interface ModelObject {
  id: string;
  domainId: string;
  parentId: string | null;
  type: ObjectType;
  name: string;
  internal: boolean;
  status: ObjectStatus;
  displayDescription: string | null;
  detailedDescriptionMd: string | null;
  techChoiceId: string | null;
  techChoice: TechChoice | null;
  tagLinks: { tag: Tag }[];
  createdAt: string;
  updatedAt: string;
}

export interface Connection {
  id: string;
  senderId: string;
  receiverId: string;
  viaId: string | null;
  direction: ConnectionDirection;
  status: ObjectStatus;
  lineShape: LineShape;
  description: string | null;
  sender: ModelObject;
  receiver: ModelObject;
  via: ModelObject | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImpliedConnection {
  senderId: string;
  receiverId: string;
  sourceConnectionIds: string[];
  selfLoop: boolean;
}

export interface DeletionImpact {
  objectIds: string[];
  connectionIds: string[];
}

// ─────────────────────────────────────────────────────────────
// Endpoint wrappers
// ─────────────────────────────────────────────────────────────

export const api = {
  organizations: {
    list: () => apiFetch<Organization[]>('/organizations'),
    get: (id: string) => apiFetch<Organization>(`/organizations/${id}`),
  },

  landscapes: {
    list: (organizationId?: string) =>
      apiFetch<Landscape[]>('/landscapes', { query: { organizationId } }),
  },

  domains: {
    list: (landscapeId?: string) =>
      apiFetch<Domain[]>('/domains', { query: { landscapeId } }),
    get: (id: string) => apiFetch<Domain>(`/domains/${id}`),
  },

  modelObjects: {
    list: (filter: {
      domainId: string;
      type?: ObjectType;
      status?: ObjectStatus;
      parentId?: string | null;
      techChoiceId?: string;
      hasDescription?: boolean;
      search?: string;
    }) =>
      apiFetch<ModelObject[]>('/model-objects', {
        query: {
          domainId: filter.domainId,
          type: filter.type,
          status: filter.status,
          parentId:
            filter.parentId === null
              ? 'null'
              : filter.parentId === undefined
                ? undefined
                : filter.parentId,
          techChoiceId: filter.techChoiceId,
          hasDescription: filter.hasDescription,
          search: filter.search,
        },
      }),
    get: (id: string) => apiFetch<ModelObject>(`/model-objects/${id}`),
    deletionImpact: (id: string) =>
      apiFetch<DeletionImpact>(`/model-objects/${id}/deletion-impact`),
  },

  connections: {
    list: (filter: {
      domainId?: string;
      senderId?: string;
      receiverId?: string;
      viaId?: string;
      status?: ObjectStatus;
    }) =>
      apiFetch<Connection[]>('/connections', {
        query: {
          domainId: filter.domainId,
          senderId: filter.senderId,
          receiverId: filter.receiverId,
          viaId: filter.viaId,
          status: filter.status,
        },
      }),
    implied: (domainId: string, level: C4Level) =>
      apiFetch<ImpliedConnection[]>('/connections/implied', {
        query: { domainId, level },
      }),
  },

  techChoices: {
    list: (category?: string) =>
      apiFetch<TechChoice[]>('/tech-choices', { query: { category } }),
  },

  tags: {
    list: (domainId: string) => apiFetch<Tag[]>('/tags', { query: { domainId } }),
  },
};
