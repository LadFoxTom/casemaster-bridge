/**
 * The data-provider interface every backend implements. The SPA never
 * knows which one is in use; only this surface counts.
 *
 * Future: a C# implementation of this interface inside CaseMaster.Web.exe
 * delivers Shape 3 of the deployment story without a single SPA change.
 */

import type {
  Bo, BoRow, NavItem, PageDescriptor, SchemaResponse,
} from '../../api-spec/src/schemas.js';

export interface ListArgs {
  bo: string;
  group: string;
  page: number;
  pageSize: number;
  sort?: string;
  q?: string;
  filters?: Record<string, string | string[]>;
}

export interface ListResult {
  rows: BoRow[];
  total: number;
}

export interface DataProvider {
  /** Inspect the .cms tree (BOs, pages, derived nav). Cached upstream. */
  describe(): Promise<{
    appName: string;
    bos: Bo[];
    pages: PageDescriptor[];
    navigation: NavItem[];
    capabilities: SchemaResponse['capabilities'];
  }>;

  /** SELECT … FROM <bo.table> with predicates from `filters` and `q`. */
  listBo(args: ListArgs): Promise<ListResult>;

  /** SELECT … WHERE pk = id; bonus: enriched fk-label map for display. */
  getBo(args: { bo: string; id: string | number }): Promise<{
    row: BoRow;
    fkLabels: Record<string, string>;
  }>;

  /** INSERT or UPDATE through the BO machinery; returns the persisted row. */
  saveBo(args: { bo: string; data: BoRow }): Promise<{ row: BoRow; version?: number }>;

  /** DELETE by primary key. */
  deleteBo(args: { bo: string; id: string | number }): Promise<{ ok: true }>;

  /**
   * Run a .cms page function as a JSON action. The function is expected
   * to publish results via `set('//act_*', …)`; the adapter collects
   * those into `outputs`.
   */
  callPageAction(args: {
    pagePath: string;
    fn: string;
    params: Record<string, unknown>;
    sessionCookie?: string;
  }): Promise<{
    ok: boolean;
    outputs: Record<string, unknown>;
    message?: string;
    error?: string;
  }>;

  /** Session: returns the authenticated user (or null), plus a CSRF token. */
  sessionMe(args: { cookie?: string }): Promise<{
    authenticated: boolean;
    user?: { id: string | number; email?: string; name?: string };
    perms: string[];
    csrf: string;
  }>;

  /** login / logout — providers may no-op when auth is delegated. */
  sessionLogin(args: { email: string; password: string }): Promise<{
    ok: boolean;
    user?: { id: string | number; email?: string; name?: string };
    csrf: string;
    cookie?: string;
  }>;
  sessionLogout(args: { cookie?: string }): Promise<{ ok: true; clearCookie?: boolean }>;

  /** Per-user, key-value preferences. Implementations choose storage. */
  getPreferences(args: { scope: string; cookie?: string }): Promise<unknown>;
  putPreferences(args: { scope: string; value: unknown; cookie?: string }): Promise<unknown>;
}
