# Implementation Plan: C4 Architecture Modeling & Diagramming App

> Source-of-truth driven, model-based architecture documentation tool — built around the C4 model. This document is the living implementation plan for the project described in the PRD.

## 1. Guiding Principles

- **Source-of-Truth First.** The model (objects + connections) exists independently of any diagram. Diagrams are *views* over the model. Edit once, propagate everywhere.
- **Vertical Slices.** Each phase ships an end-to-end demoable increment.
- **Strict C4 Hierarchy.** Enforced in DB constraints, service layer, and types — never trust the client.
- **Performance from Day One.** Canvas virtualization, list virtualization, server-side filtering/pagination from Phase 2 onward.

## 2. Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Shared types between web/api |
| Frontend | React 18 + TypeScript + Vite | Fast SPA dev loop |
| Canvas | React Flow (XYFlow) v12 | Custom nodes/edges, virtualization, parent-child grouping |
| State | Zustand + Immer; TanStack Query | Deterministic client + server cache |
| Real-time (Phase 7) | Yjs + y-websocket | CRDT for diagram editing & presence |
| Styling | Tailwind CSS + Radix UI | Accessible primitives |
| Backend | NestJS (Node 20) + Prisma | Modules map cleanly to PRD domains |
| Database | PostgreSQL 16 (JSONB, recursive CTEs) | Strict relational + flexible metadata |
| Search | Meilisearch (Phase 2+) | Fast object autocomplete |
| Auth | Auth.js (OIDC/email); SAML in Phase 9 | |
| Testing | Vitest, Playwright, Storybook | |
| Infra | Docker Compose dev; GH Actions CI | |

## 3. Data Model (Prisma, condensed)

```
Organization 1─* Landscape 1─* Domain 1─* ModelObject

ModelObject (self-referential parent_id)
  type:   ACTOR | SYSTEM | APP | STORE | COMPONENT
  level:  1 | 2 | 3                 (derived & validated)
  internal: bool
  status: LIVE | FUTURE | DEPRECATED | REMOVED
  displayDescription (≤120) | detailedDescriptionMd
  techChoiceId?, ownerTeamId?, tags[], links[], metadata(JSONB)
  unique(parent_id, name)            -- "unique within scope"

Connection
  senderId, receiverId   (ModelObject)
  direction              (OUTGOING | BIDIRECTIONAL | NONE)
  viaId?                 (intermediary ModelObject e.g. Kafka topic)
  status, lineShape, description

Diagram
  domainId, level, scopeObjectId?
  name, pinned, viewCount, updatedAt

DiagramNode  -- placement of a ModelObject on a Diagram
  diagramId, modelObjectId, x, y, w, h, groupId?

DiagramEdge  -- placement of a Connection on a Diagram
  diagramId, connectionId, waypoints, sourceHandle, targetHandle

Group        diagramId, parentGroupId?, kind, autosize
Flow         diagramId, name; FlowStep[] (order, highlighted nodes/edges)
TechChoice   id, name, icon, category   (seeded catalog)
Tag          domainId, name, color
Team / Membership / RoleAssignment       -- RBAC
Snapshot     domainId, payload (JSONB)   -- Phase 6
AuditLog     actor, action, diff, at
ShareLink    diagramId, token, expiresAt, scopes
```

Invariants enforced in DB + service layer:

- `ModelObject.parent` must be of the correct C4 level (e.g. `APP.parent == SYSTEM`).
- `Connection` uniqueness: `(sender, receiver, via)`.
- `Diagram.scopeObject.level == diagram.level - 1`.

## 4. Phased Delivery

### Phase 0 — Repo scaffold & CI ✅ (this commit)
- pnpm + Turborepo workspaces
- `apps/web` (Vite React TS), `apps/api` (NestJS + Prisma), `packages/shared`
- Tailwind + Radix on web; Prisma schema stub + health endpoint on api
- `packages/shared`: C4 enums, zod schemas, implied-connection resolver (pure TS, unit tested)
- Docker Compose: postgres + meilisearch
- GitHub Actions: install → typecheck → lint → unit → build

### Phase 1 — Core Model & REST API ✅ (this commit)
- Full Prisma schema + idempotent seed with a realistic C4 landscape
- NestJS modules: organizations, landscapes, domains, model-objects, connections, tech-choices, tags
- Zod validation pipe shared with the web app via `@flappapp/shared`
- C4 parent/child rules enforced at the service layer (covered by unit tests)
- Implied-connection endpoint `GET /connections/implied?domainId=&level=` wired through the shared resolver
- Deletion-impact preview (`GET /model-objects/:id/deletion-impact`) for "Delete from Model" warnings
- Auth.js / OIDC deferred to Phase 8 (RBAC + SSO land together)

### Phase 2 — Model Management UI (no canvas yet)
- App shell: workspace switcher, top bar, right-side context panel
- **Model Objects View** — virtualized hierarchical tree, bulk edit, duplicate, filters
- **Connections List** — server-paginated table, full filters
- **Diagrams Section** — list with sort/pin/group; create dialog
- **Dependencies View** — incoming/outgoing/lower deps for any object
- Command palette (`Cmd+K`)

### Phase 3 — Diagram Canvas MVP
- React Flow custom nodes per C4 type with **12 anchorable handles** (6 for Actors)
- Drag from Model Panel → `DiagramNode` only
- Double-click canvas → quick-create object (model + node atomic)
- Drag edge into empty space → spawn-object prompt
- Right panel edits sync globally (TanStack Query invalidation)
- Delete: **Remove from Diagram** vs **Delete from Model** (with impact warning)
- Shortcuts: `Shift+S/A/C/R/D`, `Cmd+D`, undo/redo via Immer patches
- Autosave + dirty state

### Phase 4 — Connections, Routing, Drill-down
- Direction, status, line shape (curved/straight/square)
- **Via** intermediary objects render as two segments
- **Implied connections** projected to higher levels (dashed, click-through)
- **Drill-down (`+🔍`)**: navigate into the child diagram of an object
- **Custom zoom landing**: per-source-diagram override table
- 2k-node fixture perf smoke test

### Phase 5 — Groups, Flows, Tags, Tech Choices
- **Groups**: nestable React Flow parent nodes, auto-resize from children, kinds (VPC/Region/Env/Logical), unassigned manual overlays
- **Flows**: step editor, Back/Next playback, dim non-highlighted
- **Tags**: per-domain CRUD, multi-assign, bottom tag bar focus mode
- **Tech Choices**: seeded catalog, icon picker, tooltip chips

→ **End of MVP.** Internally usable by a single team.

### Phase 6 — Versioning & Snapshots
- `Snapshot` table (compressed JSON dump per Domain)
- Top-left version dropdown: Live | Drafts | past snapshots
- Copy-on-write drafts via `draftId` columns
- Diff viewer

### Phase 7 — Real-time Collaboration
- Per-diagram Yjs document; `awareness` for cursors/selection
- y-websocket server with auth middleware
- Backend persists CRDT updates to Postgres on debounce
- Presence avatars, follow-mode
- Model edits stay REST (avoid forking the global model into CRDT)

### Phase 8 — RBAC, Sharing, SSO, Audit
- Roles: Admin / Editor / Viewer scoped at Org/Landscape/Domain
- Domain team ownership
- **Share links**: signed JWT, public viewer with Flows + Tags, optional expiry
- **iFrame embed** with X-Frame-Options allowlist
- **SAML SSO** via `@node-saml/passport-saml`
- **Audit log** + admin viewer

### Phase 9 — Integrations & Inaccuracy Score
- OpenAPI docs via `@nestjs/swagger`; per-user API tokens
- `POST /api/v1/sync` declarative manifest endpoint (idempotent upserts by `externalId`)
- `packages/mcp-server` exposing tools `list_objects`, `upsert_object`, `create_connection`, `get_diagram`
- **Inaccuracy Score**: nightly job comparing last-sync timestamp & diff counts → 0–100 per Domain

### Phase 10 — Polish, Performance, Launch
- Memoized custom nodes, RAF-throttled minimap, off-screen culling
- Empty states, onboarding tour, shortcut cheat sheet
- Sentry, error boundaries
- Playwright E2E: drop → edit → cross-diagram sync; flow playback; share link viewer
- Accessibility pass (Radix, keyboard nav, ARIA live region)

## 5. Directory Layout

```
/
├── apps/
│   ├── web/                Vite React SPA
│   └── api/                NestJS + Prisma
├── packages/
│   ├── shared/             C4 types, zod schemas, implied-conn resolver
│   ├── ui/                 Radix+Tailwind components (Phase 2)
│   └── mcp-server/         Phase 9
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── .github/workflows/ci.yml
```

## 6. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Implied-connection correctness | Property-based tests (fast-check) over random hierarchies |
| Global-sync vs CRDT split | Model edits REST-only; CRDT only for diagram layout/flows |
| 12 handles on React Flow nodes | Custom node with absolutely-positioned handles |
| Scope creep | Each phase must ship green CI before the next starts |
