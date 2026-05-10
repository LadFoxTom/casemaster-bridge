# `@casemaster/admin` — the runtime-agnostic Casemaster 2.0 SPA

A React SPA that turns any `.cms` app into a 2026-class admin product by
consuming the `/api/v1` JSON contract. Works against `@casemaster/api-vercel`
(cms-vercel adapter), a cms-vercel JSON sidecar, or a future `.NET` adapter
implementing the same contract.

## Two ways to use it

### 1. Self-contained, no-build (the demo)

Point a static webserver at `dist/` (or use the bundled
`examples/wms-vercel/public/admin/index.html` which embeds a fully
working SPA via ESM CDN imports — opens without `npm install`).

### 2. Vite production build (for real deployments)

```bash
npm install
npm run build
```

Outputs `dist/` ready to serve from any static host. Pair with
`@casemaster/api-vercel` deployed to the same domain at `/api/v1/*`.

## Architecture

```
+-----------+   GET /api/v1/schema   +-----------------------+
| App shell | ---------------------> |  any backend that     |
|  +Sidebar |   /bo/:bo/list / get   |  implements the       |
|  +Topbar  |   /bo/:bo/save         |  /api/v1 contract     |
|  +CmdK    |   /page/:path/:fn      |  (api-vercel today,   |
+-----------+                        |   api-dotnet later)   |
                                     +-----------------------+
```

## Hero features

- **Schema-driven** — every page renders from the BO descriptor + page
  shape; per-page React overrides escape hatch (`overrides=…`).
- **TanStack Table + Virtual** — virtualized data grid, sort, filter,
  pagination, column visibility, persisted views.
- **cmdk command palette** — Cmd-K to do anything; fuzzy search across
  pages, records, actions.
- **Optimistic mutations** — TanStack Query rollback pattern with
  sonner toasts.
- **Linear-class keyboard shortcuts** — global registry, `?` for help.
- **Dark mode + density toggle** — CSS variable tokens, dark/light/auto,
  compact/cozy/comfortable density.
- **Dashboard composer** — drag-drop KPI/chart/table tiles with
  per-user layouts.
- **Live updates** — opt-in SSE → invalidate TanStack Query cache.
- **AI Copilot** — Cmd-J slide-out with BYO LLM key, off by default.
- **WCAG 2.2 AA** — focus visible, target sizes, reduced motion.

## See also

- The runnable demo: `examples/wms-vercel`
- The contract: `packages/api-spec/src/schemas.ts`
- The roadmap: `roadmap.md` at the package root
