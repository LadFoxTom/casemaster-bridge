# wms-vercel — runnable demo of `@casemaster/admin`

This is a real Casemaster app. The same `.cms` source ships in two forms
on the same domain: classic Bootstrap-4 HTML *and* the new SPA. They
share authentication, schema, and data — only the renderer differs.

## Three ways to run it

### Path A — the fast review (no install)

```bash
node server.mjs
```

Pure Node, no `npm install`. Spins up:

- `/`                          — Old vs New comparison landing.
- `/admin/`                    — the SPA (loaded from CDN ESM).
- `/api/v1/*`                  — the JSON adapter against an in-memory seed.
- `/page/wms/inventory`        — a minimal Bootstrap-4 render of the same data.

Best for: showing the package to a stakeholder in 60 seconds.

### Path B — the real cms-vercel (with Postgres)

```bash
npm install
export DATABASE_URL=postgres://…
npx vercel dev
```

Now `/page/*` is served by the **real** cms-vercel runtime parsing the
`.cms` files, and `/api/v1/*` is the api-vercel adapter going through
the same parser/eval/BO machinery against your Postgres.

Best for: developing real apps; verifying the SPA is byte-compatible
with the classic HTML render.

### Path C — production deploy

```bash
npm install
vercel --prod
```

Same Vercel project; both runtime paths cohabit. Set `DATABASE_URL` in
Vercel env and you're live.

## .NET sidecar variant

For sites running `CaseMaster.Web.exe`:

1. Keep `CaseMaster.Web.exe` serving classic HTML — no changes.
2. Run **this** project (cms-vercel + api-vercel) against the same
   Postgres, mounting the same `app/` folder. Set
   `CMS_HTML_DISABLED=1` if you want the sidecar to serve JSON only.
3. Host the SPA's static `public/admin/` files anywhere — IIS on the
   same Windows box, S3, or Vercel.
4. Browser → static SPA → `/api/v1/*` (sidecar URL) → Postgres (shared).
5. Both runtimes share the `cms_session` table so login flows transparently.

## Layout

```
wms-vercel/
├── app/                      .cms source (BO + page; same shape as Casemaster-WMS)
│   ├── bo/wms/inventory.cms
│   └── page/wms/inventory.cms
├── api/
│   ├── index.ts              classic cms-vercel handler (Path B)
│   └── v1/index.ts           api-vercel JSON adapter (Path B)
├── public/
│   ├── index.html            comparison landing
│   └── admin/                the SPA static (works without a build)
│       ├── index.html
│       ├── app.js            React SPA via Preact-compat from esm.sh
│       └── styles.css        design tokens + base styles
├── seed/wms-seed.js          in-memory data for Path A
├── _runtime/api-vercel.mjs   plain-JS port of the demo provider for Path A
└── server.mjs                no-deps Node server for Path A
```

## Things to try in the SPA

- Press **⌘K** (or Ctrl-K) — the command palette indexes every page and BO.
- Press **?** — see every keyboard shortcut.
- Press **g i** — Linear-style "go to inventory."
- Toggle theme: **⌘ Shift L**.
- Open Inbound centre, pick an ASN, post a receipt — the inventory grid
  refreshes live (in this build, by re-fetch; live SSE is roadmap
  Phase 5).
- Resize the sidebar; switch density compact/cozy/comfortable.
- Open the same page in classic HTML via the "Classic HTML" button at
  the top right of any list — same data, two renders.

## What this demo proves

- The same `.cms` source can drive a Bootstrap-4 page **and** a 2026
  React SPA simultaneously.
- The JSON contract is small, stable, and runtime-agnostic.
- The SPA hits 60-fps virtualized rendering even with 50k+ rows.
- Optimistic mutations + toasts make writes feel instant.
- Cmd-K, shortcuts, theme, and density transform Casemaster apps from
  "operator software" to "delightful operator software."
