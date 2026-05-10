# Getting started

Three paths from zero to running, in order of speed.

## Path A — review the demo (60 seconds)

```bash
git clone <this repo>
cd casemaster-cms-admin/examples/wms-vercel
node server.mjs   # → http://localhost:3000
```

Pure Node, no installs. You'll see:
- `/` — Old vs New comparison page (side-by-side iframes).
- `/admin/` — the SPA, dark mode, Cmd-K, virtualized tables.
- `/api/v1/schema` — the JSON contract.
- `/page/wms/inventory` — classic Bootstrap-4 render of the same data.

## Path B — scaffold a fresh project

```bash
npm create cms-admin@latest my-admin
cd my-admin
node server.mjs
```

You now own a `app/` directory of `.cms` files, an api/v1 adapter, and
a server.mjs that runs without a database. Edit `app/bo/example.cms`
and the SPA picks the change up on refresh.

## Path C — production deployment

```bash
cd my-admin
npm install
export DATABASE_URL=postgres://user:pw@host/db
npx vercel dev
# or  vercel --prod  to ship
```

Now the cms-vercel runtime parses your `.cms` files, the api-vercel
adapter goes through the same parser/eval/BO layer, and writes hit your
Postgres.

## .NET sidecar variant

For sites running `CaseMaster.Web.exe`:

1. Keep `CaseMaster.Web.exe` serving classic HTML — no changes.
2. Run cms-vercel + api-vercel as a sidecar against the same Postgres,
   pointing at the same `app/` folder.
3. Host the SPA's static `dist/` anywhere (IIS, S3, Vercel, Netlify).
4. Browser → static SPA → `/api/v1/*` (sidecar URL) → Postgres.
5. Both runtimes share the `cms_session` table so login flows transparently.

See `docs/dotnet-sidecar.md` for step-by-step.
