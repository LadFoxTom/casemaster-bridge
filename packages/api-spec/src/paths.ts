/**
 * Canonical paths for the cms-admin JSON contract. Every backend (Vercel
 * adapter, future C# adapter) MUST mount these exactly so the SPA is
 * portable across runtimes.
 */
export const API_BASE = '/api/v1';

export const API_PATHS = {
  schema:        `${API_BASE}/schema`,
  boList:        (bo: string) => `${API_BASE}/bo/${bo}/list`,
  boGet:         (bo: string) => `${API_BASE}/bo/${bo}/get`,
  boSave:        (bo: string) => `${API_BASE}/bo/${bo}/save`,
  boDelete:      (bo: string) => `${API_BASE}/bo/${bo}/delete`,
  pageAction:    (path: string, fn: string) => `${API_BASE}/page/${path}/${fn}`,
  sessionMe:     `${API_BASE}/session/me`,
  sessionLogin:  `${API_BASE}/session/login`,
  sessionLogout: `${API_BASE}/session/logout`,
  preferences:   (scope: string) => `${API_BASE}/preferences/${scope}`,
  stream:        (bo: string) => `${API_BASE}/stream/${bo}`,
} as const;

/** Pattern for a server router to match. */
export const API_ROUTE_PATTERNS = [
  { method: 'GET',  pattern: /^\/api\/v1\/schema\/?$/,                                          name: 'schema' },
  { method: 'GET',  pattern: /^\/api\/v1\/bo\/(?<bo>[^?]+)\/list\/?$/,                          name: 'boList' },
  { method: 'GET',  pattern: /^\/api\/v1\/bo\/(?<bo>[^?]+)\/get\/?$/,                           name: 'boGet' },
  { method: 'POST', pattern: /^\/api\/v1\/bo\/(?<bo>[^?]+)\/save\/?$/,                          name: 'boSave' },
  { method: 'POST', pattern: /^\/api\/v1\/bo\/(?<bo>[^?]+)\/delete\/?$/,                        name: 'boDelete' },
  { method: 'POST', pattern: /^\/api\/v1\/page\/(?<path>[^?]+)\/(?<fn>[^/?]+)\/?$/,             name: 'pageAction' },
  { method: 'GET',  pattern: /^\/api\/v1\/session\/me\/?$/,                                     name: 'sessionMe' },
  { method: 'POST', pattern: /^\/api\/v1\/session\/login\/?$/,                                  name: 'sessionLogin' },
  { method: 'POST', pattern: /^\/api\/v1\/session\/logout\/?$/,                                 name: 'sessionLogout' },
  { method: 'GET',  pattern: /^\/api\/v1\/preferences\/(?<scope>[^?]+)\/?$/,                    name: 'getPrefs' },
  { method: 'PUT',  pattern: /^\/api\/v1\/preferences\/(?<scope>[^?]+)\/?$/,                    name: 'putPrefs' },
  { method: 'GET',  pattern: /^\/api\/v1\/stream\/(?<bo>[^?]+)\/?$/,                            name: 'stream' },
] as const;
