# Running cms-admin alongside CaseMaster.Web.exe

This is the recommended deployment shape for organisations that already
run the official .NET runtime in production and aren't ready to replace
it. The .NET runtime keeps doing what it does well; cms-vercel
contributes only the JSON layer.

## Architecture

```
                    +---------------------+
Browser  ───►       |   Static SPA host   |
                    |  (Vercel / IIS / S3)|
                    +---------+-----------+
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
        +----------------+         +-------------------+
        | CaseMaster.Web |         | cms-vercel JSON   |
        |    .exe        |         | sidecar           |
        | (classic HTML) |         | (api-vercel only) |
        +-------+--------+         +---------+---------+
                │                            │
                └────────────┬───────────────┘
                             ▼
                       Postgres (shared)
```

## Setup

### 1. Mount the same `.cms` source

cms-vercel needs to parse the same `.cms` tree the .NET runtime is
serving. Either:

- **Same Windows host**: point cms-vercel at the .NET runtime's app
  directory directly (`CMS_APP_DIR=C:\path\to\casemaster-runtime`).
- **Different host**: git-clone the same source repo onto the sidecar
  box; mount it via NFS; or sync with a periodic `rsync`.

### 2. Share the database

Both runtimes connect to the same Postgres. cms-vercel reads
`DATABASE_URL` from env. Sessions are stored in the `cms_session` table
which both runtimes use, so a user logged-in via classic HTML carries
through to the SPA seamlessly.

### 3. Deploy cms-vercel as JSON-only

```bash
# In the sidecar repo:
npm install @casemaster/api-vercel cms-vercel
# api/v1/[...route].ts
import { createJsonHandler } from '@casemaster/api-vercel';
export default createJsonHandler({ appDir: process.env.CMS_APP_DIR });
```

You don't need to mount `/page/*`. The classic HTML is served by
`CaseMaster.Web.exe`. Set `CMS_HTML_DISABLED=1` if you want to hard-fail
unsolicited HTML requests on the sidecar.

### 4. Build and host the SPA

```bash
cd packages/admin
npm install && npm run build
# Output goes to packages/admin/dist/
# Copy it to your CDN / IIS / S3 / Vercel static host.
```

The SPA's API client points at `/api/v1/*` by default. If the SPA is
hosted on a different origin from the JSON sidecar, set:

```ts
window.CMS_API_BASE = 'https://sidecar.example.com';
```

before the SPA boots, OR bake it into the build with
`VITE_API_BASE=https://sidecar.example.com npm run build`.

### 5. Cookie / CORS

Same-origin is simplest; if you split origins, set `Access-Control-
Allow-Credentials: true` on the sidecar and the matching ACAO header.
The cookie must be `SameSite=None; Secure` to cross origins.

## Tradeoffs

| Concern | Mitigation |
|---|---|
| Two services to monitor | Health endpoints on both. The sidecar is stateless — restart freely. |
| Schema drift between runtimes | Both parse the same `.cms`; CI test loads the schema from each and diffs. |
| Auth divergence | Strict reuse of `cms_session` table. Don't introduce a JWT layer. |

## When to NOT use this shape

If you can't host an extra service at all, the `@casemaster/api-dotnet`
plugin path (Phase 7 / `packages/api-dotnet`) implements the same
contract inside `CaseMaster.Web.exe`. That's strictly more work; pick
this sidecar shape first.
