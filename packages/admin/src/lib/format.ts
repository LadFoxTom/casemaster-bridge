import type { BoAttr, SchemaResponse } from '@casemaster/api-spec';

/** Stable, locale-friendly date rendering. Today → time-only. */
export function formatDate(v: unknown): string {
  if (v == null || v === '') return '';
  try {
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) return String(v);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return d.toLocaleString(undefined, sameDay
      ? { hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return String(v); }
}

/** Pick the best display label for a FK target row. */
export function fkLabel(targetBo: SchemaResponse['bos'][number] | undefined, row: Record<string, unknown> | undefined): string | undefined {
  if (!targetBo || !row) return undefined;
  const cols = (targetBo.groups['label'] ?? targetBo.groups['list'] ?? ['name', 'code', 'sku', 'id']);
  for (const c of cols) {
    const v = row[c];
    if (v != null && String(v).length) return String(v);
  }
  return undefined;
}

/** Default column width for the data grid based on the attribute type. */
export function colWidth(c: BoAttr): string {
  if (c.fk)                                       return 'minmax(140px, 1.5fr)';
  if (c.type === 'long' && c.name === 'id')       return '80px';
  if (c.type === 'decimal')                       return 'minmax(100px, 1fr)';
  if (c.type === 'boolean')                       return '80px';
  if (c.type === 'timestamp' || c.type === 'date') return 'minmax(160px, 1.4fr)';
  return 'minmax(140px, 2fr)';
}

/** Map a status/enum value to a Tailwind pill class. */
export function statusPill(v: unknown): string {
  const s = String(v);
  const ok   = ['AVAILABLE','ACTIVE','COMPLETED','CLOSED','SHIPPED','DONE'];
  const info = ['OPEN','IN_PROGRESS','RECEIVING','RELEASED','ASSIGNED','ALLOCATED','VALIDATED','PACKED'];
  const warn = ['CONFIRMED','IN_TRANSIT','ARRIVED','IMPORTED','PARTIAL','DRAFT','PHASE_OUT','QUARANTINE','BLOCKED','IN_PICKING'];
  const bad  = ['CANCELLED','DAMAGED','DISCONTINUED','FULL','ERROR','FAILED'];
  if (ok.includes(s))   return 'pill-ok';
  if (info.includes(s)) return 'pill-info';
  if (warn.includes(s)) return 'pill-warn';
  if (bad.includes(s))  return 'pill-bad';
  return 'pill-muted';
}
