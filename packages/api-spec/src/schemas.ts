/**
 * Wire-format zod schemas for the cms-admin JSON contract.
 *
 * One source of truth for both backends (Vercel adapter, future .NET
 * adapter) and the SPA. The OpenAPI 3.1 doc shipped with the package is
 * generated from these via `zod-to-openapi`.
 *
 * If you change anything here, bump the API minor version. Breaking
 * changes cut a new `/api/v2`.
 */

import { z } from 'zod';

// ============================================================================
// Primitive shapes
// ============================================================================

export const BoAttrSchema = z.object({
  name:       z.string(),
  label:      z.string().optional(),
  /** Casemaster-flavoured: long, decimal, string, boolean, timestamp, date. */
  type:       z.enum([
    'long', 'decimal', 'string', 'boolean', 'timestamp', 'date', 'json',
  ]).default('string'),
  required:   z.boolean().default(false),
  readOnly:   z.boolean().default(false),
  length:     z.number().int().optional(),
  precision:  z.number().int().optional(),
  scale:      z.number().int().optional(),
  /** Reference to another BO; SPA uses this to render a combobox. */
  fk:         z.string().optional(),
  /** Optional enum hint — SPA renders a Select instead of free text. */
  enumValues: z.array(z.string()).optional(),
});
export type BoAttr = z.infer<typeof BoAttrSchema>;

export const BoSchema = z.object({
  name:       z.string(),
  label:      z.string().optional(),
  table:      z.string(),
  primaryKey: z.string().default('id'),
  attributes: z.array(BoAttrSchema),
  /** name → attr-names array; e.g. { list: ['id','name'], description: [...]} */
  groups:     z.record(z.string(), z.array(z.string())),
  /** Optional natural-language description for AI Copilot context. */
  description: z.string().optional(),
});
export type Bo = z.infer<typeof BoSchema>;

export const PageDescriptorSchema = z.object({
  /** Path under /page; e.g. "wms/inbound". */
  path:      z.string(),
  title:     z.string().optional(),
  /** Function names declared in the page (`main`, `asn`, `receive`, …). */
  functions: z.array(z.string()).default([]),
  /** Inferred shape for the SPA's default renderer. */
  shape:     z.enum(['list', 'form', 'master-detail', 'dashboard', 'custom']).default('custom'),
  /** Optional FA / lucide icon name. */
  icon:      z.string().optional(),
  /** BO this page is principally about (when inferable). */
  primaryBo: z.string().optional(),
});
export type PageDescriptor = z.infer<typeof PageDescriptorSchema>;

export const NavItemSchema: z.ZodType<NavItem> = z.lazy(() => z.object({
  label:    z.string(),
  path:     z.string().optional(),
  icon:     z.string().optional(),
  order:    z.number().int().default(0),
  children: z.array(NavItemSchema).optional(),
}));
export type NavItem = {
  label: string;
  path?: string;
  icon?: string;
  order?: number;
  children?: NavItem[];
};

// ============================================================================
// /api/v1/schema response
// ============================================================================

export const SchemaResponseSchema = z.object({
  version:    z.literal(1),
  appName:    z.string(),
  bos:        z.array(BoSchema),
  pages:      z.array(PageDescriptorSchema),
  navigation: z.array(NavItemSchema),
  /** Capabilities the backend supports — SPA hides UI for unsupported ones. */
  capabilities: z.object({
    write:     z.boolean().default(true),
    pageActions: z.boolean().default(true),
    rawSql:    z.boolean().default(false),
    sse:       z.boolean().default(false),
    auth:      z.boolean().default(true),
  }),
});
export type SchemaResponse = z.infer<typeof SchemaResponseSchema>;

// ============================================================================
// /api/v1/bo/:bo/list
// ============================================================================

export const BoListQuerySchema = z.object({
  group:    z.string().default('list'),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  /** Comma-separated; prefix with `-` for descending. e.g. `-id,name`. */
  sort:     z.string().optional(),
  /** Free-text search applied to label group; backend chooses the columns. */
  q:        z.string().optional(),
});
export type BoListQuery = z.infer<typeof BoListQuerySchema>;

export const BoRowSchema = z.record(z.string(), z.unknown());
export type BoRow = z.infer<typeof BoRowSchema>;

export const BoListResponseSchema = z.object({
  rows:     z.array(BoRowSchema),
  total:    z.number().int(),
  page:     z.number().int(),
  pageSize: z.number().int(),
  group:    z.string(),
  /** The columns in the chosen group, in display order. */
  columns:  z.array(BoAttrSchema),
});
export type BoListResponse = z.infer<typeof BoListResponseSchema>;

// ============================================================================
// /api/v1/bo/:bo/get
// ============================================================================

export const BoGetResponseSchema = z.object({
  row:        BoRowSchema,
  /** Map of fk-attr-name → display label, prefetched for ergonomics. */
  fkLabels:   z.record(z.string(), z.string()).default({}),
  attributes: z.array(BoAttrSchema),
});
export type BoGetResponse = z.infer<typeof BoGetResponseSchema>;

// ============================================================================
// /api/v1/bo/:bo/save / delete
// ============================================================================

export const BoSaveRequestSchema = z.record(z.string(), z.unknown());
export const BoSaveResponseSchema = z.object({
  row:     BoRowSchema,
  version: z.number().int().optional(),
});
export type BoSaveResponse = z.infer<typeof BoSaveResponseSchema>;

export const BoDeleteRequestSchema = z.object({ id: z.union([z.string(), z.number()]) });
export const BoDeleteResponseSchema = z.object({ ok: z.literal(true) });

// ============================================================================
// /api/v1/page/:path/:fn  (page action)
// ============================================================================

export const PageActionRequestSchema = z.record(z.string(), z.unknown());
export const PageActionResponseSchema = z.object({
  ok:      z.boolean(),
  /** Variables the .cms function set under `//act_*`. */
  outputs: z.record(z.string(), z.unknown()).default({}),
  /** Optional human-readable message (e.g. from `//act_msg`). */
  message: z.string().optional(),
  /** Optional error if ok=false. */
  error:   z.string().optional(),
});
export type PageActionResponse = z.infer<typeof PageActionResponseSchema>;

// ============================================================================
// Session
// ============================================================================

export const SessionMeResponseSchema = z.object({
  authenticated: z.boolean(),
  user:          z.object({
    id:    z.union([z.string(), z.number()]),
    email: z.string().optional(),
    name:  z.string().optional(),
  }).optional(),
  /** Permissions are opaque strings the SPA gates UI on. */
  perms:         z.array(z.string()).default([]),
  csrf:          z.string(),
});
export type SessionMeResponse = z.infer<typeof SessionMeResponseSchema>;

export const SessionLoginRequestSchema = z.object({
  email:    z.string(),
  password: z.string(),
});
export const SessionLoginResponseSchema = z.object({
  ok:   z.boolean(),
  user: SessionMeResponseSchema.shape.user,
  csrf: z.string(),
});

// ============================================================================
// Preferences (per-user, scoped: 'theme', 'dashboard:wms/inbound', etc.)
// ============================================================================

export const PreferencesGetResponseSchema = z.object({
  scope: z.string(),
  value: z.unknown().nullable(),
});
export const PreferencesPutRequestSchema = z.object({
  value: z.unknown(),
});

// ============================================================================
// Errors
// ============================================================================

export const ApiErrorSchema = z.object({
  ok:    z.literal(false),
  error: z.string(),
  code:  z.string().optional(),
  /** Field-level validation errors, in zod-shape. */
  fields: z.record(z.string(), z.array(z.string())).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
