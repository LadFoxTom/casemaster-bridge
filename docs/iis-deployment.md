# Deploying cms-admin behind IIS, alongside CaseMaster.Web.exe

If your `CaseMaster.Web.exe` already runs in IIS, you can keep it there
and add the SPA + JSON sidecar without rebuilding any of your existing
app pools. This doc walks through the four pieces and how IIS fronts
them.

## Topology

```
                Browser (single hostname)
                      │
                      ▼
               +--------------+
               |   IIS site   |
               |  (port 443)  |
               +-+----+----+--+
                 │    │    │
   /page/*  ─────┘    │    │
   /maintenance/* ────┘    │   (proxied to existing AppPool)
                           │
   /api/v1/*  ─────────────┘   (proxied to Node sidecar via ARR)
   /admin/*   ─────────────┐
   / (landing)  ───────────┘   (served as static files by IIS)
```

Three URL bands, all on the same hostname:

| Path band | What handles it | How IIS routes |
|---|---|---|
| `/page/*`, `/maintenance/*` | `CaseMaster.Web.exe` in its existing AppPool | Stays as today — no rule needed if your `.exe` already serves these. |
| `/api/v1/*` | A small Node.js sidecar (`@casemaster/api-vercel`) | Application Request Routing (ARR) reverse-proxy to `http://127.0.0.1:5174`. |
| `/admin/*`, `/` (landing) | Plain static files (the SPA build) | A second virtual directory pointing at `packages/admin/dist`. |

## Prerequisites

- IIS 10+ with these features:
  - **URL Rewrite** module (`Microsoft.UrlRewrite`)
  - **Application Request Routing** (`ARR_3_0`) — enable proxy in `Server Proxy Settings`.
- Node 20+ on the same host (or any reachable host).
- The same Postgres your `.exe` is using (`DATABASE_URL`).

## Step 1 — Build the SPA once

On any machine with Node:

```powershell
cd casemaster-cms-admin
npm --workspace @casemaster/admin install
npm --workspace @casemaster/admin run build
# output: packages/admin/dist/
```

Copy `packages/admin/dist/` to the Windows host, e.g.
`C:\inetpub\cms-admin\spa\`.

## Step 2 — Run the JSON sidecar as a Windows service

The sidecar is the runtime piece — it parses your `.cms` files and
serves `/api/v1/*`. Keep it on the same Windows box as your `.exe` so
it can mount the same `app/` folder.

```powershell
# Either: deploy a Vercel project that runs the api/v1 handler.
# Or: run a tiny standalone server. Example using node --watch:

cd C:\inetpub\cms-admin\sidecar
copy ..\..\path\to\casemaster-cms-admin\examples\wms-vercel\* . /S
$env:DATABASE_URL = '<your DSN>'
$env:CMS_APP_DIR  = 'C:\path\to\your\casemaster-runtime'
$env:PORT         = 5174
node server.mjs
```

Promote it to a Windows service with [NSSM](https://nssm.cc/) so it
restarts on reboot:

```powershell
nssm install cms-admin-sidecar "C:\Program Files\nodejs\node.exe" "C:\inetpub\cms-admin\sidecar\server.mjs"
nssm set cms-admin-sidecar AppEnvironmentExtra DATABASE_URL=<dsn> CMS_APP_DIR=C:\path\to\your\casemaster-runtime PORT=5174
nssm start cms-admin-sidecar
```

Verify: `curl http://127.0.0.1:5174/api/v1/schema` should return JSON.

## Step 3 — IIS reverse-proxy `/api/v1/*` to the sidecar

In IIS Manager, on your CaseMaster site, add a `web.config` rule:

```xml
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- /api/v1/* → Node sidecar -->
        <rule name="cms-admin-api" stopProcessing="true">
          <match url="^api/v1/(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:5174/api/v1/{R:1}" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="https" />
            <set name="HTTP_X_FORWARDED_HOST"  value="{HTTP_HOST}" />
          </serverVariables>
        </rule>

        <!-- Static SPA at /admin/* — IIS serves files directly -->
        <!-- (no rewrite rule needed if /admin is a virtual directory) -->

        <!-- Optional: BrowserRouter fallback so deep links work -->
        <rule name="spa-fallback" stopProcessing="true">
          <match url="^admin/(?!.*\.).*" />
          <action type="Rewrite" url="/admin/index.html" />
        </rule>
      </rules>
    </rewrite>

    <!-- ARR needs an outbound proxy enabled; this confirms it. -->
    <proxy enabled="true" preserveHostHeader="true" reverseRewriteHostInResponseHeaders="false" />
  </system.webServer>
</configuration>
```

Add a virtual directory in IIS Manager:
- Site: your existing CaseMaster site.
- Alias: `admin`
- Physical path: `C:\inetpub\cms-admin\spa`

That's all. `/page/*` keeps hitting `CaseMaster.Web.exe`; `/api/v1/*`
reverse-proxies to the sidecar; `/admin/*` is static.

## Step 4 — SSE (live updates) through IIS

Server-Sent Events need IIS to NOT buffer the response. ARR honours
`Cache-Control: no-transform` correctly *if* you also disable the
response buffer for that rule. Add to the rewrite rule above:

```xml
<rule name="cms-admin-sse" stopProcessing="true">
  <match url="^api/v1/stream/(.*)" />
  <action type="Rewrite" url="http://127.0.0.1:5174/api/v1/stream/{R:1}" />
</rule>

<!-- and the proxy element: -->
<proxy enabled="true"
       preserveHostHeader="true"
       responseBufferLimit="0" />
```

`responseBufferLimit="0"` is the magic part — IIS won't sit on the
stream waiting for it to close.

## Step 5 — Cookie & SameSite

`CaseMaster.Web.exe` and the sidecar share the `cms_session` table, but
each issues its own `Set-Cookie`. Two safe options:

1. **Same hostname, same cookie name (recommended).** Both runtimes
   default to `cmsv_sid`. As long as both speak the same cookie format
   (cms-vercel reads/writes the standard CaseMaster session table),
   you're done. Verify by signing in via `/page/login` and confirming
   `/api/v1/session/me` returns `authenticated: true`.

2. **Different cookie names.** Run cms-vercel with
   `CMS_SESSION_COOKIE=cms_admin_sid` and have the SPA login flow hit
   `/api/v1/session/login` directly. Use this only if your `.exe`'s
   session table format isn't compatible.

`SameSite=Lax` is fine when everything is one origin. If you split
the SPA off to a different hostname, set `SameSite=None; Secure` and
add CORS headers on the sidecar.

## Step 6 — Health checks

Add an IIS `Health Monitor` against the sidecar:
```
GET http://127.0.0.1:5174/api/v1/schema
expected status: 200
expected substring: "appName"
```
If the sidecar dies, ARR will start returning 502s on `/api/v1/*`
without affecting `/page/*` — your existing CaseMaster app keeps
serving. That's the whole point of the sidecar shape.

## Step 7 — Live updates against shared Postgres

Once the sidecar is happy, install the `LISTEN/NOTIFY` triggers so
writes from `CaseMaster.Web.exe` propagate to the SPA in real time:

```powershell
npx cms-admin-emit-live-sql --app C:\path\to\your\casemaster-runtime | psql $env:DATABASE_URL
```

After that any INSERT/UPDATE/DELETE — whether issued by
`CaseMaster.Web.exe`, the sidecar, or a batch job — fires a
`pg_notify`, the sidecar's listener picks it up, and connected SPAs
invalidate the affected query keys via SSE.

## Step 8 — Optional: BO writes through bo.persist

By default the JSON adapter does direct SQL inserts/updates. If your
`.cms` BOs declare `auditable: auditing.Full` or have validators, run:

```powershell
npx cms-admin-install-helper --app C:\path\to\your\casemaster-runtime
```

It installs a tiny `script/_cmsAdmin.cms` that the adapter prefers
over direct SQL. Writes now go through `bo.persist` — same code path
classic HTML pages use.

## What you just deployed

- One IIS site, one hostname.
- `CaseMaster.Web.exe` for `/page/*` — unchanged.
- A Node.js JSON sidecar for `/api/v1/*` — proxied via ARR.
- A static SPA at `/admin/*` — served by IIS.
- One Postgres database, one `cms_session` table, one set of cookies.
- Live updates via `LISTEN/NOTIFY` propagating both ways.

Users sign in once via the classic login page, then can use either UI
seamlessly. Data they create on one side appears on the other. You can
cut pages over from classic to SPA one route at a time.
