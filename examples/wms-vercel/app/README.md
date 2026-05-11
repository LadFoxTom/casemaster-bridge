# Casemaster-WMS

A standalone Casemaster 2.0 application implementing the back-office side of
the Warehouse Management System specified in `..\WMS_specification.md`.

The Android `.apk` companion is intentionally out of scope for this build;
server-side mobile-fleet tables (`device`, `idempotency_record`,
`stuck_transaction`, etc.) are present in the schema and exposed as BOs/pages
so any future Android client can plug straight in.

## Layout

```
casemaster-runtime\
├── runtime\                       .NET runtime (CaseMaster.Web.exe + DLLs).
│   └── script\web\router\page.cms patched to bypass auth on /page/wms* and /
├── bo\wms\                        164 generated BO files (one per table)
├── page\
│   ├── index.cms                  /  → /page/wms
│   ├── wms.cms                    Dashboard (hero, KPI tiles, navigation)
│   └── wms\                       164 generated list pages (one per table)
├── sql\
│   ├── wms_schema.sql             Full DDL applied to Neon
│   ├── codegen_bos.py             Re-runs to regenerate bo\wms\*.cms
│   ├── codegen_pages.py           Re-runs to regenerate page\wms\*.cms
│   └── seed_demo.py               Seeds demo tenant + items + locations + 1 PO/SO
├── log\                           Runtime writes log + trace files here
├── configuration.cms              App name, version, security flags
├── environment.cms                returns environment.Development
└── incDevelopment.cms             Neon Postgres connection string
```

## Run

PowerShell, headless, detached:

```powershell
# from this folder, or anywhere
& "$PSScriptRoot\..\start_wms.ps1"
```

…or just double-click `..\start_wms.bat`. The console window stays open while
the server runs; close it (or Ctrl+C) to stop. Server listens on
`http://localhost:5051`.

Open in a browser:

| URL | What |
|---|---|
| `http://localhost:5051/`                              | Redirects to the WMS dashboard |
| `http://localhost:5051/page/wms`                      | Dashboard — KPIs + grouped navigation |
| `http://localhost:5051/page/wms/item`                 | Items / SKUs |
| `http://localhost:5051/page/wms/location`             | Bin locations |
| `http://localhost:5051/page/wms/inventory`            | Stock on hand |
| `http://localhost:5051/page/wms/sales_order`          | Sales orders |
| `http://localhost:5051/page/wms/asn`                  | ASNs |
| `http://localhost:5051/page/wms/receipt`              | Receipts |
| `http://localhost:5051/page/wms/license_plate`        | LPNs |
| `http://localhost:5051/page/wms/<any of 164 tables>`  | List view over the matching BO |

Stop:

```powershell
Get-NetTCPConnection -LocalPort 5051 -State Listen |
    Select-Object -First 1 |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Re-applying the schema or regenerating BOs / pages

```bash
# from anywhere, requires psycopg (Python 3): pip install psycopg
python sql\codegen_bos.py     # rewrites bo\wms\*.cms from sql\wms_schema.sql
python sql\codegen_pages.py   # rewrites page\wms\*.cms from sql\wms_schema.sql
python sql\seed_demo.py       # seeds 1 tenant + warehouse + 12 items + 1 PO/ASN/SO
```

Schema application:

```powershell
$env:PGCONN = 'postgresql://neondb_owner:...@ep-odd-pine-...neon.tech/neondb?sslmode=require&channel_binding=require'
python -c "import os, psycopg; conn=psycopg.connect(os.environ['PGCONN']); conn.cursor().execute(open('sql/wms_schema.sql').read()); conn.commit()"
```

## Casemaster idioms learned during this build

- `dataType.Timestamp` (NOT `DateTime`) for `TIMESTAMPTZ` columns.
- `dataType.JSON` for `JSONB`.
- `pagingMode` valid values: `None`, `Basic`, `Lookahead`, `Full` (NOT `Standard`).
- Bundled `Npgsql.dll` is 6.x: `Channel Binding=Require` must be **dropped** from
  the Neon URL; `Trust Server Certificate=true` must be **added** for
  `SslMode=Require` to work without a CA bundle.
- Auth bypass for `/page/<prefix>*` routes lives in
  `runtime\script\web\router\page.cms`'s `authenticate()` function.
- `bo.count('wms/<table>', 'where=...')` and `iterator.ofEntity` over
  `wms/<table>` are the standard read paths.

## What's not done

- Mobile/Android `.apk` (skipped per build scope).
- Workflow action pages (multi-step "create receipt → putaway → pack → ship"
  forms). Schema and BOs are in place; lists/details are wired.
- Real auth — the `wms*` route prefix bypasses session auth in
  `runtime\script\web\router\page.cms`. Bootstrapping the Casemaster admin
  schema in Neon (user / login / session / audit / userAccessByIP / …) and
  dropping the bypass is a separate task.
- Partitioning for `audit_log`, `kpi_snapshot`, `message_log`,
  `webhook_delivery` — columns and indexes preserved, `PARTITION BY RANGE`
  clauses dropped. Retro-fit when row counts justify it.
