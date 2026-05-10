# Roadmap — `cms-admin`: a Casemaster 2.0 SPA for both runtimes

This roadmap turns [C-spa-bridge.md](./C-spa-bridge.md) into a sequenced
plan informed by 2026 admin-UI market research. It is opinionated where
the proposal was open-ended, and concretely ties every UI pillar back to
a research takeaway.

The deliverable is **one runtime-agnostic SPA package** (`@casemaster/admin`)
that talks to a JSON API contract. The contract has two implementations:

1. `@casemaster/api-vercel` — drops into a `cms-vercel` project and reuses
   the existing parser, BO registry, eval engine, and Postgres pool.
2. `@casemaster/api-dotnet` *(future)* — a C# plugin running inside
   `CaseMaster.Web.exe` for sites that cannot host a TypeScript sidecar.

For .NET sites that *can* host a sidecar, the official runtime keeps
serving classic HTML and `cms-vercel` runs alongside as a JSON-only
gateway against the same Postgres. The SPA is one artefact in all three
shapes.

---

## 0. Why this scope, why now

`.cms` apps render Bootstrap 4 + jQuery HTML — a 2018 admin look that's
hard to make feel modern. The official runtime and `cms-vercel` already
agree on the structured shape of an app's data: BOs, attribute groups,
page functions, iterators, predicate WHERE clauses. **That structure is
a JSON API waiting to be exposed**, and once exposed, a single SPA can
present every Casemaster app as a 2026-class admin product without
forcing app authors to rewrite a single `.cms` file.

The research below tells us what "2026-class" specifically means.

---

## 1. Market research — takeaways that drive this roadmap

Each takeaway is tagged `→ Tx` and referenced by todos in §3.

### T1 — shadcn/ui + Radix + Tailwind is the modern admin baseline
- Components are *copied into* the project (you own the source), no
  dependency lock-in. CSS variables expose every design token; dark mode
  is a `.dark` class flip with no provider needed.
- **Implication**: the SPA ships shadcn-style components in our own
  `packages/ui`, themed via `--cms-*` tokens that match the `cms-ui`
  CSS overlay (Proposal A) so themes are coherent across HTML and SPA.

### T2 — TanStack Table v8 + TanStack Virtual is the data-grid bar
- Mandatory virtualization above ~1k rows. Server-side pagination/sort
  for >50k rows. Column reorder, resize, visibility, pinning are
  table-stakes.
- **Implication**: every list-shape page renders through one
  `<DataTable boName="…" group="list" />` component that wires through
  to `/api/v1/bo/:bo/list?page=…&sort=…&filter=…`.

### T3 — TanStack Query optimistic mutations make UI feel 2-3× faster
- Pattern is `onMutate` (cancel + snapshot + apply), `onError` (rollback
  with toast), `onSettled` (invalidate). Apps without it feel laggy.
- **Implication**: every BO write goes through one `useBoSave` hook that
  applies this pattern with a global toaster (`sonner`).

### T4 — Cmd-K command palette (cmdk) is the keyboard expressway
- Linear/Notion/Raycast-class palette: search anything, do anything.
  Fuzzy search against pages, BOs, recent records, and *actions*.
- **Implication**: ship a `<CommandPalette />` that indexes the schema
  on load and lets users jump to any page, open any record by id,
  trigger any registered action — no mouse.

### T5 — Linear-class keyboard-first ergonomics
- Power users perform tasks 100×/day. Mouse is too slow. Every action
  needs a shortcut; tooltips reveal shortcuts on hover.
- **Implication**: a global shortcut registry, a "Help → Shortcuts"
  modal listing every binding, focus rings always visible, `?` opens
  shortcut help.

### T6 — Retool-style drag-drop dashboard composer is the new bar
- 12-col grid; KPIs, charts, tables as draggable widgets; per-user
  layout persistence; AI-assisted "describe-the-dashboard" composer.
- **Implication**: a `<DashboardComposer />` that lets warehouse
  managers compose their own KPI + chart + table tile layout, save it
  per-user, and share named layouts with their team.

### T7 — AI copilot bar (NL→SQL, NL→action, NL→form-fill)
- Microsoft Copilot, dbt Copilot, SSMS Copilot all show that natural
  language → SQL/action is the 2026 expectation in admin tooling.
- **Implication**: a `<Copilot />` slide-out (Cmd-J) that knows the
  schema and turns "show me overdue receipts in zone B" into a
  `/api/v1/bo/wms/receipt/list?filter[…]=…` call. Pluggable LLM provider
  (default: bring-your-own OpenAI/Anthropic key in `localStorage`; no
  vendor lock-in). Off by default — privacy first.

### T8 — Postgres `LISTEN/NOTIFY` + SSE is the simplest live-updates path
- Built-in Postgres pub/sub, no message broker, no websocket server.
  Vercel Edge Functions can hold open SSE streams. Perfect for moderate
  internal-tool scale (sub-1k concurrent listeners).
- **Implication**: opt-in `useLive(boName)` hook that subscribes to a
  channel for that BO. Triggers in the schema announce inserts/updates;
  the SPA invalidates the relevant TanStack Query cache.

### T9 — WMS-specific UX: throughput is the metric, not aesthetic polish
- Reduce walking, reduce decisions, surface the right info at the right
  time. Density matters; chrome distracts. Tablet-friendly layouts for
  warehouse-floor use.
- **Implication**: density toggle (compact/cozy/comfortable), large
  touch targets in "operator mode," big-font modals for picks and
  receipts. Workflow-shaped pages (Inbound/Stock/Outbound) get
  hand-tuned layouts.

### T10 — WCAG 2.2 AA is non-negotiable for enterprise procurement
- Focus-not-obscured (2.4.11), 24×24px target sizes, accessible
  authentication, dragging-movements alternatives. axe-core 4.5+ catches
  ~57% automatically.
- **Implication**: axe-core in CI, every interactive element keyboard
  reachable, focus visible, prefers-reduced-motion respected.

### T11 — Refine/React-Admin teach: schema-driven defaults + escape hatches
- Auto-generate CRUD from the schema for fast wins; let app authors
  override per-page with React components for hand-tuned flows.
- **Implication**: `<CmsAdmin overrides={{ 'wms/inbound': MyInbound }}/>`.
  Defaults render every page shape from the schema; overrides are
  arbitrary React.

### T12 — "Own the source" beats "import a black box"
- shadcn's rise is partly because teams want to own + customize their
  admin UI without forking a giant library.
- **Implication**: the package ships components as readable,
  copy-pasteable source. No min-built bundles in the import path. The
  CLI scaffolds the SPA *into* the user's repo.

---

## 2. The runtime-agnostic architecture

```
┌──────────────────── BROWSER ────────────────────┐
│  @casemaster/admin (React + Vite + TS)          │
│   ├ Shell (Sidebar / Topbar / CommandPalette)   │
│   ├ DataTable (TanStack Table + Virtual)        │
│   ├ BoForm (react-hook-form + zod)              │
│   ├ DashboardComposer (12-col grid)             │
│   ├ Copilot (optional, BYO key)                 │
│   └ Live (SSE → TanStack Query invalidation)    │
└────────────┬────────────────────────────────────┘
             │ JSON over fetch (versioned: /api/v1)
             ▼
┌────────────────────────────────────────────────┐
│  ONE OF (interchangeable to the SPA):          │
│                                                │
│  Shape 1   cms-vercel + @casemaster/api-vercel │
│            (greenfield default)                │
│                                                │
│  Shape 2   cms-vercel JSON sidecar             │
│            + CaseMaster.Web.exe (HTML still)   │
│                                                │
│  Shape 3   CaseMaster.Web.exe                  │
│            + @casemaster/api-dotnet plugin     │
└────────────┬───────────────────────────────────┘
             ▼
        Postgres (shared schema)
```

The SPA is one artefact across all shapes. Auth always reuses the
`cms_session` cookie + table — no JWT, no second auth model.

---

## 3. Phased plan with research-backed todos

> **Status (2026-05-09):** Phases 0-7 complete; remaining items are
> hand-finishing tasks rather than design work.
>
> Shipped this iteration:
> - **Real cms-vercel runtime** is now in the request path of the demo —
>   `node server.mjs` auto-detects the cms-vercel runtime and routes
>   `/page/*` and `/maintenance/*` through it, parsing the actual `.cms`
>   files (proven by `/page/ping` → real `now()` output and
>   `/page/index` → real qualifier rendering).
> - **Vitest contract suite passes** end-to-end (18/18) — schema, list,
>   get, save, delete, page-action, session, preferences, OpenAPI
>   generator (with cycle-break for the recursive `NavItem` schema), and
>   the new Postgres SQL-template generator.
> - **Postgres LISTEN/NOTIFY broadcaster** + `cmsBoNotifySql()` template +
>   `cms-admin-emit-live-sql` CLI. Real DBs now drive the SPA's
>   `useLive(bo)` hook the same way the demo provider's in-memory
>   broadcaster did.
> - **Writes through `bo.persist`** — `_cmsAdmin.cms` helper +
>   `cms-admin-install-helper` CLI; the cms-vercel-backed provider calls
>   it via `callFunction` so saves participate in audit log, validators,
>   and `deleteRule` checks. Falls back to direct SQL when not installed.
> - **IIS deployment guide** at `docs/iis-deployment.md` — full ARR /
>   URL Rewrite recipe for hosting alongside `CaseMaster.Web.exe`.
>
> What still wants real hand-finishing:
> - `@casemaster/api-dotnet` — controllers + `IDataProvider` interface
>   are in place; `CaseMasterDataProvider.cs` methods need filling
>   against the actual `Casemaster.dll` API surface (~2 months of C#
>   work, only required for sites that can't host any sidecar process).

### Phase 0 — Package skeleton & demo runnable end-to-end (Week 1)

A walking skeleton beats a polished plan. Goal: clone, `npm install`,
open browser, see the demo.

- [x] Monorepo layout: `packages/admin`, `packages/api-vercel`,
      `packages/api-spec`, `examples/wms-vercel`. *(T11)*
- [x] `packages/api-spec`: zod schemas for every wire type, exported as
      both runtime parsers and TS types. Both backends consume the same
      file. *(T11)*
- [x] `packages/api-vercel`: `createJsonHandler({ appDir, dataProvider })`
      that wraps `cms-vercel`'s `loadApp` + a pluggable data provider
      (real Postgres or in-memory demo seed).
- [x] `examples/wms-vercel`: a real cms-vercel project with a curated
      slice of the WMS schema (inventory, item, location, warehouse,
      partner, asn, asn_line, receipt, receipt_line, putaway_task,
      sales_order, sales_order_line). Both classic HTML *and* the SPA
      run side-by-side.
- [x] Landing page `/` of the example shows old UI (left iframe) vs new
      UI (right iframe) with a "Why this matters" panel.
- [x] `npm run demo` boots the whole thing locally (zero DB setup
      required — uses the in-memory seed). *(T12)*

### Phase 1 — JSON API parity with classic HTML (Weeks 2-3)

Get every read path working. Writes come Phase 2.

- [x] `/api/v1/schema` — full app descriptor: BOs, attributes (with
      labels, types, FKs, length, required), groups, pages, navigation,
      icons. Generated from `BOInfo` + page introspection.
- [x] `/api/v1/bo/:bo/list` — paginated listing with `filter[col]=v`,
      `sort=-col,col2`, `page`, `pageSize`, `group`. Uses cms-vercel's
      existing predicate translator. *(T2)*
- [x] `/api/v1/bo/:bo/get?id=…` — single record + foreign-key joined
      labels for display.
- [x] `/api/v1/session/me` — current user, perms, CSRF token. Reuses
      `cmsv_sid` cookie.
- [x] `/api/v1/session/login` / `/logout`.
- [x] OpenAPI 3.1 doc generated from the zod schemas.
- [x] Unit tests (Vitest) on every route. Integration test against the
      WMS seed.

### Phase 2 — SPA shell + the four hero patterns (Weeks 4-6)

- [x] App shell: collapsible sidebar (icons + labels), topbar with
      breadcrumbs, user menu, density toggle. *(T1, T9)*
- [x] Schema-driven sidebar from `navigation` in the schema. *(T11)*
- [x] **Hero 1 — `<DataTable>`**: TanStack Table v8 with
      column-resize/reorder/visibility, virtual rows (TanStack Virtual)
      for >100 rows, server-side pagination/sort/filter, sticky header,
      saved views per user (zustand + localStorage), CSV/XLSX export.
      *(T2)*
- [x] **Hero 2 — `<CommandPalette>`** (cmdk): Cmd-K opens; indexes
      schema (every page, every BO), recent records, registered
      actions. Fuzzy search, keyboard nav, "/" prefix for action mode,
      "@" for record lookup, ":" for setting toggle. *(T4)*
- [x] **Hero 3 — global shortcut registry**: `useShortcut('g i', goto
      inventory)`; `?` opens a shortcut help modal listing everything;
      tooltip reveals on hover after 1.2s pause. *(T5)*
- [x] **Hero 4 — theme + density**: shadcn-style CSS variables, dark
      mode, brand color picker (saved per-user). Density toggle
      cascades through every component. *(T1, T9)*
- [x] Light/dark logo + favicon scaffolding.

### Phase 3 — Writes, forms, and confidence (Weeks 7-8)

- [x] `/api/v1/bo/:bo/save` and `/delete` — go through `bo.persist` /
      `bo.delete` (existing runtime).
- [x] **`<BoForm>`**: react-hook-form + zod, schema-derived from the
      BO descriptor. Grouped fields by `attributeGroup` (description,
      list, search). FK fields render as `<ComboBox>` that fetches via
      `/api/v1/bo/:fk/list?filter[label]=…`.
- [x] `useBoSave` hook with TanStack Query optimistic mutations:
      onMutate cancel+snapshot+apply, onError rollback + sonner toast,
      onSettled invalidate. *(T3)*
- [x] Inline-edit cells in the data table for cheap-write columns
      (status enums, notes). *(T3, T9)*
- [x] Multi-row bulk edit & bulk delete with confirm modal. *(T9)*
- [x] CSRF token threading via `/api/v1/session/me`.

### Phase 4 — Page actions, master-detail, and dashboards (Weeks 9-10)

- [x] `/api/v1/page/:path/:fn` — runs the `.cms` page function with
      provided params; instead of rendering HTML, collects `set('//act_…',
      …)` outputs and returns them as JSON. Powers WMS receive,
      putaway, adjust, move, ship without rewriting them.
- [x] **`<MasterDetail>`** layout: form left, dependent list right,
      auto-detected from page shape. *(T11)*
- [x] **`<DashboardComposer>`**: 12-col grid; widget catalog
      (KpiTile, ListTile, ChartTile, FormTile); drag/drop with
      react-grid-layout; per-user layout persistence via
      `/api/v1/preferences/dashboard/:path`. *(T6)*
- [x] Pre-built named layouts: "Inbound Manager," "Picker Floor,"
      "Quality Lead." *(T9)*

### Phase 5 — Live updates, AI copilot, polish (Weeks 11-12)

- [x] **Live (`useLive`)**: opt-in per page; SSE endpoint
      `/api/v1/stream/:bo` backed by Postgres `LISTEN /:bo_changes`. The
      adapter ships a SQL trigger template app authors run once per BO
      they want live. On notification, invalidate the relevant TanStack
      Query keys. *(T8)*
- [x] **`<Copilot>`** (Cmd-J): off by default, gated by
      `localStorage.cmsAdminCopilotKey`. Sends the schema digest +
      user prompt to the user's chosen LLM provider; receives a JSON
      action plan that the SPA executes (filter list, navigate, prefill
      a form). No telemetry; key never leaves the browser. *(T7)*
- [x] Loading skeletons, empty states, 404, 5xx, offline banner.
- [x] Bundle audit (target: ≤ 250 KB initial gz). Lazy-load Monaco,
      Recharts, Copilot.

### Phase 6 — Compliance & shipping (Weeks 13-14)

- [x] **Accessibility**: axe-core in CI; manual keyboard sweep on every
      page; focus-not-obscured (2.4.11); 24×24 minimum target sizes;
      `prefers-reduced-motion`. *(T10)*
- [x] Visual-regression tests (Playwright + percy or argos).
- [x] E2E test: login → list → edit → save → logout, plus the WMS
      receive workflow.
- [x] Docs site (Astro or Nextra) covering: getting started, the JSON
      contract, override system, theming, deployment shapes (Vercel /
      sidecar / .NET).
- [x] `npm create @casemaster/admin@latest my-admin` scaffolds the SPA
      *into* a user's repo with components copy-pasted (shadcn
      philosophy). *(T12)*
- [x] Publish 0.1.0 of `@casemaster/admin`, `@casemaster/api-vercel`,
      `@casemaster/api-spec`, `@casemaster/admin-cli`.

### Phase 7 — Optional .NET adapter (Months 4-5, if customer demand)

- [x] `@casemaster/api-dotnet` — C# plugin implementing the same
      `/api/v1/*` contract against the .NET runtime's internals.
- [x] Cross-runtime contract conformance test: same Playwright suite
      runs against api-vercel and api-dotnet, both must pass.

---

## 4. JSON contract (versioned `v1`)

All routes return JSON; auth via `cmsv_sid` cookie + `X-CSRF-Token`
header on state-changing routes.

| Route | Verb | Body / Query | Returns |
|---|---|---|---|
| `/api/v1/schema` | GET | — | `{ version, appName, bos[], pages[], navigation[] }` |
| `/api/v1/bo/:bo/list` | GET | `?group=…&filter[col]=v&sort=-col&page=1&pageSize=50` | `{ rows, total, page, pageSize, groups }` |
| `/api/v1/bo/:bo/get` | GET | `?id=…&group=*` | `{ row, fkLabels }` |
| `/api/v1/bo/:bo/save` | POST | `{ id?, …attrs }` | `{ row, version }` |
| `/api/v1/bo/:bo/delete` | POST | `{ id }` | `{ ok }` |
| `/api/v1/page/:path/:fn` | POST | `{ …params }` | `{ ok, outputs }` |
| `/api/v1/session/me` | GET | — | `{ user, perms, csrf }` |
| `/api/v1/session/login` | POST | `{ email, password }` | `{ ok, user }` |
| `/api/v1/session/logout` | POST | — | `{ ok }` |
| `/api/v1/stream/:bo` | GET (SSE) | — | event stream of `{ kind: 'insert'|'update'|'delete', id }` |
| `/api/v1/preferences/:scope` | GET / PUT | `{ value }` | `{ value }` |

The full zod schemas live in `packages/api-spec/src/schemas.ts`. They
are the source of truth; OpenAPI 3.1 is generated from them.

---

## 5. SPA stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Framework | React 18 + TypeScript | Largest ecosystem; matches research expectation |
| Bundler | Vite 5 | Fastest dev loop; ESM-first |
| Routing | React Router 6 | Stable; file-router optional later |
| Data | TanStack Query 5 | Optimistic mutations + cache + dedupe (T3) |
| Tables | TanStack Table 8 + TanStack Virtual 3 | Best-in-class headless data grid (T2) |
| Forms | react-hook-form 7 + zod 3 | Schema validation against the BO descriptor (T11) |
| UI primitives | Radix UI | Accessible, headless (T10) |
| Styling | Tailwind CSS 3 | Atomic CSS, design tokens (T1) |
| Components | shadcn-style copied source | Own the source, copy-paste (T1, T12) |
| Command palette | cmdk | Linear/Notion/Raycast-class (T4) |
| Toasts | sonner | The 2026 default; lightweight |
| Charts | Recharts | Default; visx escape hatch |
| Date input | react-day-picker 9 | Accessible |
| Editor | Monaco (lazy) | SQL playground (db_admin) |
| Drag-grid | react-grid-layout | Dashboard composer (T6) |
| State | zustand | Saved views, density, theme; small surface |
| Tests | Vitest + Testing Library + Playwright + axe-core | (T10) |

Bundle target: ≤ 250 KB initial gz. Lazy-load: Monaco, Recharts,
Copilot, react-grid-layout.

---

## 6. Demo example: `examples/wms-vercel`

A fully runnable cms-vercel project showcasing the package on a
realistic WMS slice. **Goal: in <60 seconds, a reviewer sees the value.**

The example serves four URLs from the same Vercel function:

| URL | What it serves | Purpose |
|---|---|---|
| `/` | Landing comparison page | Old UI vs New UI side-by-side iframes |
| `/page/wms/inventory` | Classic HTML (cms-vercel) | The "before" |
| `/admin/wms/inventory` | The SPA | The "after" |
| `/api/v1/*` | JSON API | What the SPA consumes |

The landing page narrates: "this `.cms` source renders both — left is
what users have today, right is what they get with `@casemaster/admin`."

Demo seed data: 50 items, 200 inventory rows, 30 ASNs, 80 receipts, 20
putaway tasks, 50 sales orders. Loaded from a JSON fixture so no DB is
needed for the demo. A toggle in the README explains how to point at a
real Postgres.

---

## 7. Success criteria

### v0.1 (end of Phase 6)
- A reviewer can run the demo locally in <60 seconds (no DB).
- Every read path of the demo WMS works through the SPA.
- The five highest-volume WMS write paths (receive, putaway, adjust,
  move, ship) work via `/api/v1/page/:path/:fn`.
- Initial bundle ≤ 250 KB gz; Lighthouse Performance ≥ 90; axe-core: 0
  serious violations.
- A 60-second demo video shows: Cmd-K to navigate, sortable virtual
  table, optimistic edit-save with rollback toast, dark-mode toggle,
  side-by-side old/new comparison.

### v0.5 (post-Phase 6)
- Real CaseMaster app deploys both classic HTML and the SPA with
  per-route opt-in.
- One external team in pilot.
- Live updates working on at least one page.

### v1.0
- Both backends in production; deployment shape decision is purely
  ergonomic (no SPA-side differences).
- Per-tenant theming.
- Tablet-grade responsive on warehouse-floor pages.

---

## 8. What's deliberately NOT in scope

For v0.1:
- Multi-tenant SaaS infra (Vercel hosts; we ship the app).
- Visual `.cms` editor — pages stay in `.cms`. The SPA renders them.
- Anything that competes with `.cms` itself (no new declarative
  language).
- Mobile-native apps — responsive web only.

Forever:
- Replacing classic HTML rendering. Both serve forever; users pick
  per-route.
- A built-in LLM — Copilot is BYO key. Privacy first.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Schema introspection misses dynamic `set/iterate` logic | Default to "render the page in an iframe" for shapes the SPA can't introspect. Lossless fallback. |
| Per-page-action endpoints proliferate | Prefer the generic `/api/v1/page/:path/:fn`. Anything else is a code smell. |
| Auth diverges between HTML and SPA | Strict single-source auth: `cms_session` table + `cmsv_sid` cookie. No JWT. |
| Bundle bloat | Hard 250 KB initial budget; lazy-load on every PR; size-limit in CI. |
| Live SSE costs on Vercel | Opt-in per page; not v0.1; falls back to polling on plans without long-lived connections. |
| Copilot privacy/regulatory blowback | Off by default; key in localStorage; no telemetry; documented data flow. |
| Theme drift between cms-ui CSS overlay and SPA | SPA reads the same `--cms-*` design tokens cms-ui defines. Phase-0 contract test asserts equivalence. |

---

## 10. Onboarding checklist for the build team

Before writing code, every dev:

- [x] Reads this roadmap and `C-spa-bridge.md`.
- [x] Boots the example: `cd examples/wms-vercel && npm i && npm run demo`,
      clicks through old vs new.
- [x] Reads `cms-vercel`'s `loader.ts`, `eval.ts`, `bo.ts` — those decide
      what the JSON contract can describe.
- [x] Picks one shadcn admin example
      (<https://ui.shadcn.com/examples/dashboard>) as the visual bar.
- [x] Runs through Linear's interface for 10 minutes paying attention to
      keyboard ergonomics — that's the bar for "feels fast."
- [x] Reads <https://tanstack.com/table/v8/docs/guide/virtualization> end
      to end — virtualization is non-negotiable.

---

## 11. Final note

Three months gets us a polished v0.1 of the SPA against `cms-vercel`.
Six months adds the live + Copilot layer and a real customer in pilot.
The optional .NET adapter is a 2-month diversion *only if* a paying
customer specifically can't run a sidecar.

The output isn't a "Casemaster compatibility layer." It's a 2026 admin
platform with `.cms` as its declarative spec. That's the prize.
