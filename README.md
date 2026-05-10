# `casemaster-bridge`

A monorepo that brings CaseMaster apps to a 2026-class admin product —
**without rewriting a single `.cms` file**. Implements
[`C-spa-bridge.md`](./C-spa-bridge.md), driven by the [`roadmap.md`](./roadmap.md).

```
casemaster-bridge/
├── packages/
│   ├── api-spec/            zod schemas + paths for the /api/v1 contract
│   ├── api-vercel/          JSON adapter — wraps cms-vercel + the demo provider
│   ├── admin/               the runtime-agnostic React SPA
│   ├── api-dotnet/          C# scaffold for an in-process .NET adapter (Phase 7)
│   └── create-cms-admin/    `npm create cms-admin@latest` scaffold tool
├── examples/
│   └── wms-vercel/          a runnable Casemaster-WMS demo
│       ├── app/             a small .cms slice (inventory + page action)
│       ├── api/v1/          Vercel function: cms-admin JSON adapter
│       ├── api/             Vercel function: classic cms-vercel HTML
│       ├── public/          static landing + pre-built SPA
│       └── server.mjs       no-deps Node server for the fast demo path
├── apps/
│   └── docs/                the docs site (itself a cms-vercel project)
├── docs/                    markdown architecture / IIS / sidecar guides
├── tests/                   Playwright E2E + axe accessibility checks
└── .github/workflows/ci.yml
```

## Run the demo in 30 seconds

```bash
cd examples/wms-vercel
node server.mjs
```

Open <http://localhost:3000>:

- **`/`** — Old vs New side-by-side comparison.
- **`/admin/`** — the SPA, schema-driven, full Cmd-K, dark/light, virtual tables.
- **`/page/wms/inventory`** — the same data through the classic Bootstrap 4 render.
- **`/api/v1/schema`** — the JSON contract the SPA consumes.

No `npm install`. No `DATABASE_URL`. No Vercel CLI. Pure Node.

## How the package works on both runtimes

| Runtime you have today | What this package adds | Result |
|---|---|---|
| **cms-vercel** (greenfield) | `@casemaster/api-vercel` mounted at `/api/v1/*` + the SPA at `/admin/*` | Both classic HTML and SPA from one Vercel function. |
| **`CaseMaster.Web.exe`** (.NET) | cms-vercel running as a JSON-only sidecar against the same Postgres + the SPA hosted as static assets | Existing .NET production untouched; SPA gets schema, data, and writes via the sidecar. |
| **.NET, locked-down infra** | A future `@casemaster/api-dotnet` C# plugin implementing the same contract | The SPA stays the same; only the JSON producer changes. |

The SPA is one artefact. The contract (`packages/api-spec/`) is the
single source of truth — every backend implements it.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — request lifecycle, package map, page-action flow.
- [`docs/getting-started.md`](docs/getting-started.md) — three on-ramps (no-install / fresh project / production).
- [`docs/dotnet-sidecar.md`](docs/dotnet-sidecar.md) — running cms-vercel as a JSON sidecar to `CaseMaster.Web.exe`.
- [`docs/iis-deployment.md`](docs/iis-deployment.md) — same as above but specifically behind IIS with ARR / URL Rewrite.

## What's next

Read [`roadmap.md`](./roadmap.md) for the phased plan. The market
research takeaways (T1-T12) drive every UI pillar; each pillar maps to
todos in §3 of the roadmap.

## Deploying

Two deployable Vercel projects live inside this monorepo:

| Vercel project | Set Root Directory to | Result |
|---|---|---|
| `casemaster-bridge-demo` | `examples/wms-vercel` | The runnable WMS example with classic HTML + SPA + JSON adapter |
| `casemaster-bridge-docs` | `apps/docs` | The documentation site (`apps/docs/`) — itself a cms-vercel project |

Both are independent Vercel projects pointing at the same GitHub repo.

## Related repos

- Classic runtime: [`CaseMaster.Web.exe`](https://docs.casemaster.io/) (Windows binary).
- TypeScript reimplementation: [`LadFoxTom/Casemaster-Vercel`](https://github.com/LadFoxTom/Casemaster-Vercel).
- This package's source is fully readable; reviewer-owned (shadcn philosophy).

## License

MIT — see [`LICENSE`](./LICENSE).
