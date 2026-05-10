# `@casemaster/api-vercel`

The JSON adapter for `cms-admin`. Wraps `cms-vercel`'s loader, eval, BO
registry, and Postgres pool to expose the runtime-agnostic
`/api/v1/*` contract that the SPA consumes.

## Install

```bash
npm install @casemaster/api-vercel @casemaster/api-spec cms-vercel
```

## Use in a Vercel project

```ts
// api/v1/[...route].ts
import { createJsonHandler } from '@casemaster/api-vercel';

export default createJsonHandler({ appDir: './app' });
```

Add the rewrite to `vercel.json`:

```json
{ "rewrites": [{ "source": "/api/v1/(.*)", "destination": "/api/v1/index.ts" }] }
```

## Run without a database (demo mode)

For demos and tests, swap in the in-memory provider:

```ts
import { createJsonHandler, createDemoProvider } from '@casemaster/api-vercel';
import { wmsSeed } from './seed.js';

export default createJsonHandler({ dataProvider: createDemoProvider(wmsSeed()) });
```

## What the adapter implements

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/v1/schema` | One JSON document describing every BO + page + nav. |
| `GET`  | `/api/v1/bo/:bo/list` | Paginated list with sort, filter, free-text search. |
| `GET`  | `/api/v1/bo/:bo/get?id=…` | Single record + FK label resolution. |
| `POST` | `/api/v1/bo/:bo/save` | INSERT or UPDATE through `bo.persist`. |
| `POST` | `/api/v1/bo/:bo/delete` | DELETE by primary key. |
| `POST` | `/api/v1/page/:path/:fn` | Run any `.cms` page function as a JSON action. |
| `GET`  | `/api/v1/session/me` | Current user, perms, CSRF token. |
| `POST` | `/api/v1/session/login` | Cookie-based login (no JWT). |
| `POST` | `/api/v1/session/logout` | — |
| `GET`/`PUT` | `/api/v1/preferences/:scope` | Per-user key-value prefs. |

## Architecture

```
+---------------------+
| createJsonHandler() |  Vercel-shaped handler
+----------+----------+
           │
           ▼
+---------------------+
|   createJsonCore()  |  framework-agnostic core
+----------+----------+
           │ matches a route, then dispatches to:
           ▼
+---------------------+
|    DataProvider     |  the swappable backend
+----------+----------+
           │
           ├── createCmsVercelProvider({ appDir })   ← production
           ├── createDemoProvider(seed)              ← demos / tests
           └── (future: createDotnetProvider({ … })) ← shape 3
```

The `DataProvider` interface lives in `src/provider.ts`. A future C#
plugin implements the *same* surface inside `CaseMaster.Web.exe`.

## Contract source of truth

Wire schemas: `packages/api-spec/src/schemas.ts` (zod).
Path constants: `packages/api-spec/src/paths.ts`.
Both are imported by every backend AND the SPA, so mismatches
surface at type-check time.

## Page actions

`/api/v1/page/:path/:fn` runs the `.cms` function. The function should
publish results via `set('//act_*', …)`; the adapter collects every
`act_*` global into the JSON `outputs`. Special:

- `//act_msg` → `outputs.act_msg` and `response.message`.
- `//act_err` → `outputs.act_err` and `response.error`; sets `ok: false`.

This is how the WMS receive flow works without rewriting `postReceive`:

```
SPA  POST /api/v1/page/wms/inbound/receive  { asn:1, qty_5:2, lot_5:'X' }
   ↓
adapter ← runs page/wms/inbound:receive in cms-vercel
   ↓
{ ok: true, outputs: { act_rcpt_id: 13, act_lines_received: 1, act_msg: '…' } }
```
