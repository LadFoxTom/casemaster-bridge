# Architecture

## High-level shape

```
+------------------ BROWSER ------------------+
|                                             |
|  @casemaster/admin SPA                      |
|   ├ Shell (Sidebar / Topbar / Cmd-K)        |
|   ├ DataTable (TanStack Table + Virtual)    |
|   ├ BoForm (react-hook-form + zod)          |
|   ├ DashboardComposer (react-grid-layout)   |
|   ├ Copilot (BYO LLM key)                   |
|   └ useLive() (SSE → query invalidation)    |
+----------------+----------------------------+
                 │ JSON over fetch (versioned: /api/v1)
                 ▼
+--------------------------------------------+
|  ANY DataProvider implementation           |
|                                            |
|  Shape 1  cms-vercel + @casemaster/api-vercel
|  Shape 2  cms-vercel JSON sidecar  + .NET runtime serving classic HTML
|  Shape 3  CaseMaster.Web.exe + @casemaster/api-dotnet plugin
+----------------+---------------------------+
                 ▼
            Postgres (shared schema)
```

The SPA is one artefact. The contract is one zod source-of-truth. Auth
always reuses the `cms_session` cookie + table — no JWT.

## Package map

| Package | Purpose |
|---|---|
| `@casemaster/api-spec` | zod wire schemas + path constants. Source of truth. |
| `@casemaster/api-vercel` | JSON adapter + DataProvider interface. Demo + cms-vercel-backed providers. |
| `@casemaster/admin` | React SPA: shell, DataTable, BoForm, Cmd-K, Dashboard, Copilot. |
| `create-cms-admin` | `npm create cms-admin@latest <name>` scaffold. |
| `examples/wms-vercel` | Runnable WMS demo (no-install via `node server.mjs`). |

## Request lifecycle

1. Browser hits `/admin/wms/inventory`.
2. SPA fetches `/api/v1/schema` (cached 30 min) → BO + page descriptors.
3. SPA renders `<DataTable bo="wms/inventory" />`.
4. Table fetches `/api/v1/bo/wms/inventory/list?...` via TanStack Query.
5. User clicks a row → SPA calls `/api/v1/bo/wms/inventory/get?id=42`.
6. User edits a field → optimistic mutation: TanStack Query patches every
   cached list query for that BO before the network round-trip.
7. Server responds; on success the toast confirms; on error the cache
   rolls back and the toast carries the message.
8. Provider broadcasts the change; SSE subscribers (`useLive`) receive it
   and invalidate the affected query keys.

## Page actions

`/api/v1/page/:path/:fn` runs the `.cms` page function on the server.
The function publishes results via `set('//act_*', value)`; the adapter
collects every `act_*` global into the JSON `outputs`.

```
SPA  POST /api/v1/page/wms/inbound/receive  { asn:1, qty_5:2 }
   ↓
adapter ← runs page/wms/inbound:receive on the runtime
   ↓
{ ok: true, outputs: { act_rcpt_id: 13, act_lines_received: 1, act_msg: '…' } }
```

This is how the WMS receive flow runs without rewriting `postReceive`.

## Live updates

`/api/v1/stream/:bo` is an SSE endpoint. The DataProvider exposes an
optional `events: BoEventBroadcaster`; each `saveBo` / `deleteBo` call
publishes a `{ kind, bo, id }` event. The SPA's `useLive(bo)` hook
invalidates the BO's query keys on each event.

The cms-vercel-backed provider (Phase 5 work item) maps this to Postgres
`LISTEN/NOTIFY` so writes from any source — cms-vercel HTML pages, batch
jobs, or other admins — propagate to every connected SPA.

## Authentication

Cookies, no JWT. The SPA calls `/api/v1/session/me` on boot, which
returns the current user, their permissions, and a CSRF token. Every
state-changing request carries `X-CSRF-Token: …` from that token.
