# FlappApp

A source-of-truth driven **C4 architecture modeling & diagramming** application.

Unlike conventional diagramming tools, FlappApp treats the model — objects
(Actors, Systems, Apps, Stores, Components) and the connections between them —
as the canonical data. Diagrams are *views* over that model. Rename an object
once, it updates everywhere.

See **[PLAN.md](./PLAN.md)** for the full implementation roadmap, phase list,
data model, and tech decisions.

## Status

**Phase 0 — scaffolding.** Monorepo, shared C4 types, NestJS API with a health
endpoint, Vite React web shell, Prisma schema, Docker Compose, CI workflow.
Phase 1 (full model CRUD + migrations) comes next.

## Repository layout

```
apps/
  web/             Vite + React + Tailwind SPA
  api/             NestJS + Prisma REST API
packages/
  shared/          C4 types, zod schemas, implied-connection resolver
docker-compose.yml Postgres + Meilisearch for local dev
PLAN.md            Full phased implementation plan
```

## Quick start

```bash
# prerequisites: Node 20, pnpm 9, Docker

pnpm install
docker compose up -d postgres meilisearch
cp apps/api/.env.example apps/api/.env
pnpm --filter @flappapp/api exec prisma generate
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/health

## Scripts

```bash
pnpm dev          # run web + api in parallel
pnpm build        # build all packages
pnpm typecheck    # TS across the workspace
pnpm test         # vitest across the workspace
pnpm lint         # lint across the workspace
```

## License

See [LICENSE](./LICENSE).
