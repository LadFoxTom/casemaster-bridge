# `@casemaster/api-dotnet`

A C# implementation of the **same `/api/v1/*` JSON contract** as
`@casemaster/api-vercel`, packaged as a plugin that loads inside
`CaseMaster.Web.exe`. For sites on locked-down Windows-only
infrastructure that can't host a cms-vercel sidecar (deployment Shape 3
in the roadmap).

> Status: **scaffold only**. The interface, controllers, and registration
> point are all in place; the BO ops (list/get/save/delete) need to call
> the .NET runtime's internals (Casemaster.dll). Estimated 2 months of
> focused C# work to finish, per Roadmap §0.

## Why a separate package

The SPA in `packages/admin` doesn't change at all. Only the JSON
producer differs. Same routes, same shapes, same tests — Phase 1's
contract-conformance suite must pass against this adapter byte-for-byte
identical to api-vercel.

## Architecture

```
+-----------------------------+
| CaseMaster.Web.exe          |
|   ASP.NET Core pipeline     |
|   ┌──────────────────────┐  |
|   │ /page/...   (HTML)   │  |
|   ├──────────────────────┤  |
|   │ /api/v1/... (JSON)   │  |   ← this package's middleware
|   └──────────────────────┘  |
|         │                   |
|   +-----▼------+            |
|   | IDataProv  |            |
|   +-----+------+            |
|         │                   |
|   +-----▼------+            |
|   | Casemaster |            |
|   |    .dll    |            |
|   +-----+------+            |
+---------┴-------------------+
          ▼
       Postgres
```

## Source layout

```
src/
├── Casemaster.Admin.Api.csproj
├── Program.cs                          assembly entry; reads env, wires DI
├── Startup.cs                          AddCmsAdmin() / UseCmsAdmin()
├── Controllers/
│   ├── SchemaController.cs             /schema
│   ├── BoController.cs                 /bo/{bo}/list|get|save|delete
│   ├── PageActionController.cs         /page/{path}/{fn}
│   ├── SessionController.cs            /session/me|login|logout
│   ├── PreferencesController.cs        /preferences/{scope}
│   └── StreamController.cs             /stream/{bo}  (SSE)
└── DataProvider/
    ├── IDataProvider.cs                contract — same surface as TS
    └── CaseMasterDataProvider.cs       reflection-based bridge to Casemaster.dll
```

## Wiring into CaseMaster.Web.exe

`Casemaster.Admin.Api` registers itself as an ASP.NET Core middleware
loaded by the runtime's plugin loader. In `CaseMaster.Process.exe.config`,
add:

```xml
<plugins>
  <add assembly="Casemaster.Admin.Api"
       configure="Casemaster.Admin.Api.Startup,Casemaster.Admin.Api"
       basePath="/api/v1" />
</plugins>
```

After registration, the runtime serves classic HTML at `/page/*` and
the JSON contract at `/api/v1/*` from a single process — no sidecar.

## Conformance tests

Drop your built `Casemaster.Admin.Api.dll` into `tests/conformance/dotnet/`
and run:

```bash
npm test -- --conformance dotnet
```

The same contract test suite that exercises api-vercel runs against the
.NET adapter via a process spawn + HTTP. Both must pass.
