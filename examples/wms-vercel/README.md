# wms-vercel — the real Casemaster-WMS, on Vercel

This is the **complete 164-BO Casemaster-WMS** wired into the bridge SPA and
served by `cms-vercel` from a single Vercel function. The same `.cms` source
renders two ways:

- **Classic Bootstrap-4 HTML** at `/page/wms/*` via the cms-vercel runtime.
- **The Casemaster Bridge SPA** at `/admin/*` consuming `/api/v1/*` JSON.

Both read the same Postgres. Both share the same `cms_session` cookie.

## What's in `app/`

The full Casemaster-WMS source: 164 BOs, 180 pages, 13 helper scripts.
The bridge's `script/_cmsAdmin.cms` helper is installed too so SPA writes
route through `bo.persist` (audit-friendly) instead of direct SQL.

## Deploying to Vercel — one-time setup

You need a Postgres database (Neon recommended; free tier is plenty).

### 1. Provision Neon

1. Go to <https://neon.tech> → New Project → pick a region.
2. Copy the connection string. Looks like:
   `postgres://user:password@ep-xxxx.neon.tech/neondb?sslmode=require`

### 2. Load the WMS schema + sample data

```bash
psql "<your Neon connection string>" -f sql/wms_schema.sql
# optional — sample rows for demo purposes
python sql/seed_demo.py "<connection string>"
```

The schema file is ~2700 lines and creates all 164 tables, indexes, and
foreign keys in one transaction. Safe to re-run (everything is `IF NOT
EXISTS`).

### 3. Add `DATABASE_URL` to Vercel

In your Vercel project → Settings → Environment Variables:

```
DATABASE_URL = postgres://user:password@ep-xxxx.neon.tech/neondb?sslmode=require
```

Set for Production + Preview environments. Redeploy.

That's it. The SPA's sidebar now shows the full 164-BO WMS, fed from your
Neon database in real time.

## What happens before `DATABASE_URL` is set

The deployment still builds. `/api/v1/schema` still works (sidebar
populates with all 164 BOs from the `.cms` declarations). Data endpoints
return a clear "DATABASE_URL not configured" JSON error — the SPA renders
this as an empty-state in the data tables, which is your signal to set the
env var.

## Local development

```bash
npm install
$env:DATABASE_URL = '<connection string>'
npx vercel dev   # http://localhost:3000
```

`npm install` runs the `postinstall` hook that clones cms-vercel from
GitHub and vendors it into `node_modules/cms-vercel`. First install takes
~60s; subsequent ones are cached.

## Layout

```
examples/wms-vercel/
├── api/
│   ├── index.ts             cms-vercel handler for /page/* and /maintenance/*
│   └── v1/index.ts          /api/v1/* JSON adapter — schema from .cms, data from Postgres
├── app/                     the WMS source (164 BOs, 180 pages, 13 scripts + helpers)
│   ├── bo/wms/*.cms
│   ├── page/wms/*.cms
│   ├── script/{_cmsAdmin,…}.cms
│   ├── configuration.cms
│   ├── environment.cms
│   └── incDevelopment.cms
├── sql/
│   ├── wms_schema.sql       2700-line Postgres schema
│   ├── seed_demo.py         sample row generator (Python)
│   └── seed_sequence.py     sequence resetter
├── _runtime/api-vercel.mjs  vendored SSE writer (no DB needed)
├── public/                  static landing + the SPA bundle (read at /admin/)
├── bin/install-runtime.mjs  postinstall: vendors cms-vercel from GitHub
├── vercel.json              rewrites + includeFiles
└── package.json
```

## Tearing it back to the demo seed (no DB)

If you want a fast no-DB preview again instead of the real WMS,
`server.mjs` and the `seed/wms-seed.js` file are still in the repo
(unused by the current Vercel build). You'd revert `api/v1/index.ts` to
use `createDemoProvider(wmsSeed())` and remove the `app/` contents.

We recommend going forward with the real WMS — the SPA looks identical
either way, and the demo's polish was never about which data layer it
talks to.
