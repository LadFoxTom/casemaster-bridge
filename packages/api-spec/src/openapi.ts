/**
 * OpenAPI 3.1 generator. Hand-written rather than via a third-party
 * zod-to-openapi pass so we have full control over the doc shape and
 * avoid a heavy build dependency.
 *
 * Run:  npx tsx src/openapi.ts > openapi.json
 * Or import generateOpenAPI() and serve it from /api/v1/openapi.json.
 */

import { z } from 'zod';
import {
  ApiErrorSchema,
  BoDeleteRequestSchema,
  BoGetResponseSchema,
  BoListQuerySchema,
  BoListResponseSchema,
  BoSaveResponseSchema,
  PageActionResponseSchema,
  PreferencesGetResponseSchema,
  PreferencesPutRequestSchema,
  SchemaResponseSchema,
  SessionLoginRequestSchema,
  SessionLoginResponseSchema,
  SessionMeResponseSchema,
} from './schemas.js';

export function generateOpenAPI(opts: { title?: string; version?: string } = {}) {
  const errResp = { description: 'Error', content: { 'application/json': { schema: zodToJson(ApiErrorSchema) } } };

  return {
    openapi: '3.1.0',
    info: {
      title: opts.title ?? 'cms-admin JSON API',
      version: opts.version ?? '1.0.0',
      description: 'Runtime-agnostic contract powering @casemaster/admin. Implemented by @casemaster/api-vercel and (future) @casemaster/api-dotnet.',
    },
    servers: [{ url: '/api/v1' }],
    paths: {
      '/schema': {
        get: {
          summary: 'Describe the entire app: BOs, pages, navigation, capabilities.',
          responses: { '200': okResp(SchemaResponseSchema), '500': errResp },
        },
      },
      '/bo/{bo}/list': {
        get: {
          summary: 'Paginated list of a Business Object.',
          parameters: [
            pathParam('bo'),
            ...queryParams(BoListQuerySchema),
            { name: 'filter[col]', in: 'query', required: false, description: 'Repeat per column you want to filter.', schema: { type: 'string' } },
          ],
          responses: { '200': okResp(BoListResponseSchema), '404': errResp, '500': errResp },
        },
      },
      '/bo/{bo}/get': {
        get: {
          summary: 'Fetch a single record by primary key, with FK label resolution.',
          parameters: [pathParam('bo'), { name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { '200': okResp(BoGetResponseSchema), '404': errResp },
        },
      },
      '/bo/{bo}/save': {
        post: {
          summary: 'INSERT or UPDATE a record. Goes through bo.persist on the runtime.',
          parameters: [pathParam('bo')],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
          responses: { '200': okResp(BoSaveResponseSchema), '400': errResp },
        },
      },
      '/bo/{bo}/delete': {
        post: {
          summary: 'DELETE by primary key.',
          parameters: [pathParam('bo')],
          requestBody: { required: true, content: { 'application/json': { schema: zodToJson(BoDeleteRequestSchema) } } },
          responses: { '200': okResp(z.object({ ok: z.literal(true) })), '400': errResp, '404': errResp },
        },
      },
      '/page/{path}/{fn}': {
        post: {
          summary: 'Run a .cms page function as a JSON action; collects //act_* outputs.',
          parameters: [pathParam('path'), pathParam('fn')],
          requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
          responses: { '200': okResp(PageActionResponseSchema), '400': errResp },
        },
      },
      '/session/me':     { get:  { summary: 'Current user, perms, CSRF token.', responses: { '200': okResp(SessionMeResponseSchema) } } },
      '/session/login':  { post: { summary: 'Cookie login.', requestBody: { required: true, content: { 'application/json': { schema: zodToJson(SessionLoginRequestSchema) } } }, responses: { '200': okResp(SessionLoginResponseSchema), '401': errResp } } },
      '/session/logout': { post: { summary: 'Clear the session cookie.', responses: { '200': okResp(z.object({ ok: z.literal(true) })) } } },
      '/preferences/{scope}': {
        get: { summary: 'Read per-user preferences.', parameters: [pathParam('scope')], responses: { '200': okResp(PreferencesGetResponseSchema) } },
        put: { summary: 'Write per-user preferences.', parameters: [pathParam('scope')], requestBody: { required: true, content: { 'application/json': { schema: zodToJson(PreferencesPutRequestSchema) } } }, responses: { '200': okResp(PreferencesGetResponseSchema) } },
      },
      '/stream/{bo}': {
        get: {
          summary: 'Server-Sent Events stream of insert/update/delete events for a BO.',
          parameters: [pathParam('bo')],
          responses: { '200': { description: 'SSE event stream', content: { 'text/event-stream': { schema: { type: 'string' } } } } },
        },
      },
    },
    components: {
      securitySchemes: {
        cmsv_sid:     { type: 'apiKey', in: 'cookie', name: 'cmsv_sid' },
        csrfHeader:   { type: 'apiKey', in: 'header', name: 'X-CSRF-Token' },
      },
    },
    security: [{ cmsv_sid: [] }, { csrfHeader: [] }],
  } as const;
}

function pathParam(name: string) {
  return { name, in: 'path' as const, required: true, schema: { type: 'string' as const } };
}

function queryParams(schema: z.ZodObject<any>): any[] {
  const shape = schema.shape ?? {};
  return Object.entries(shape).map(([name, def]: [string, any]) => ({
    name, in: 'query', required: false, schema: zodToJson(def),
  }));
}

function okResp(schema: z.ZodTypeAny) {
  return { description: 'OK', content: { 'application/json': { schema: zodToJson(schema) } } };
}

/**
 * Tiny zod → JSON Schema translator covering the shapes we use.
 * Intentionally NOT general-purpose — pulling in `zod-to-json-schema`
 * would add 50KB to consumer bundles for marginal extra coverage.
 *
 * `seen` breaks recursion on z.lazy self-references (NavItem.children
 * is NavItem[]). We emit a generic object placeholder when re-entered.
 */
function zodToJson(z: z.ZodTypeAny, seen: WeakSet<z.ZodTypeAny> = new WeakSet()): any {
  if (seen.has(z)) return { type: 'object', additionalProperties: true };
  seen.add(z);
  const def = (z as any)._def;
  switch (def.typeName) {
    case 'ZodString':   return { type: 'string' };
    case 'ZodNumber':   return { type: 'number' };
    case 'ZodBoolean':  return { type: 'boolean' };
    case 'ZodLiteral':  return { const: def.value };
    case 'ZodEnum':     return { type: 'string', enum: def.values };
    case 'ZodNativeEnum': return { type: 'string' };
    case 'ZodOptional': return zodToJson(def.innerType, seen);
    case 'ZodNullable': { const inner = zodToJson(def.innerType, seen); return { ...inner, nullable: true }; }
    case 'ZodDefault':  return zodToJson(def.innerType, seen);
    case 'ZodArray':    return { type: 'array', items: zodToJson(def.type, seen) };
    case 'ZodUnion':    return { oneOf: def.options.map((o: any) => zodToJson(o, seen)) };
    case 'ZodLazy':     return zodToJson(def.getter(), seen);
    case 'ZodRecord':   return { type: 'object', additionalProperties: zodToJson(def.valueType, seen) };
    case 'ZodObject': {
      const props: Record<string, any> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(def.shape() as Record<string, z.ZodTypeAny>)) {
        props[k] = zodToJson(v, seen);
        if (!(v as any).isOptional?.()) required.push(k);
      }
      return { type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false };
    }
    case 'ZodAny':
    case 'ZodUnknown':  return {};
    default:            return {};
  }
}

// CLI usage: tsx src/openapi.ts > openapi.json
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('openapi.ts')) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateOpenAPI(), null, 2));
}
