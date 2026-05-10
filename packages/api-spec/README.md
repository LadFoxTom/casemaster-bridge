# `@casemaster/api-spec`

The wire-format zod schemas + canonical paths for the `cms-admin`
`/api/v1` contract.

## Why this exists

Two backends and one frontend all need to agree on JSON shapes. Rather
than reproduce the contract three times in three languages, **everyone
imports from this package**:

- `@casemaster/api-vercel` — server-side validation
- `@casemaster/admin`      — client-side types
- (future) `@casemaster/api-dotnet` — generates C# from this via
  zod-to-json-schema → NSwag

Mismatches surface as TypeScript errors at build time, not at 3am.

## Files

- `src/schemas.ts` — every wire shape
- `src/paths.ts`   — every URL pattern (server router + client constants)

## Versioning

Semantic-versioned. Backwards-compatible additions: minor bump.
Breaking changes: major bump and a new `/api/v2` path constant.

## Generating the OpenAPI doc

```bash
npx zod-to-openapi-cli src/schemas.ts > openapi.yaml
```

Ship `openapi.yaml` for partners that want to consume the contract from
outside the JS ecosystem.
