# my-cms-admin

A fresh `cms-admin` project. Run `node server.mjs` for the no-install demo,
or `npm install && npx vercel dev` for the real cms-vercel + Postgres path.

## Layout

```
.
├── app/             your .cms files (BOs + pages)
├── api/
│   ├── index.ts     classic cms-vercel handler
│   └── v1/index.ts  cms-admin JSON adapter
├── public/admin/    pre-built SPA (or build your own with @casemaster/admin)
└── server.mjs       no-deps demo server
```

## Where to look first

- `app/bo/example.cms` — declare a BO; the SPA picks it up via `/api/v1/schema`.
- `app/page/example.cms` — a classic HTML page; it shares data with the SPA.
- `api/v1/index.ts`     — pluggable provider (demo seed by default).
