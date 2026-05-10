/**
 * Virtualized data grid built on TanStack Table + TanStack Virtual.
 *
 * Roadmap T2: virtualization is mandatory above ~1k rows. Server-side
 * pagination/sort/filter is mandatory above ~50k. This component does
 * both: it asks the API for one page at a time and virtualizes the
 * rendered window inside that page.
 *
 * Used by every list-shape page; per-page overrides can replace the
 * whole component or just compose around it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  flexRender, getCoreRowModel, useReactTable, createColumnHelper,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import { useNavigate } from 'react-router-dom';
import { useBoList } from '../../hooks/queries';
import type { BoAttr, SchemaResponse } from '@casemaster/api-spec';
import { Icon } from '../ui/icon';
import { Button, Input, Pill, Select, Skeleton } from '../ui/primitives';
import { colWidth, formatDate, statusPill } from '../../lib/format';

export interface DataTableProps {
  bo: string;
  schema: SchemaResponse;
  /** When provided, called with the row on click; otherwise navigates to the detail. */
  onRowClick?: (row: Record<string, unknown>) => void;
  /** Extra toolbar slot (e.g. a "New" button). */
  toolbar?: React.ReactNode;
  /** Initial sort string. */
  initialSort?: string;
  /** Initial filter map (column → value(s)). */
  initialFilters?: Record<string, string | string[]>;
  /** Hide rows with these statuses by default. */
}

export function DataTable({ bo, schema, onRowClick, toolbar, initialSort = '-id', initialFilters }: DataTableProps) {
  const meta = schema.bos.find((b) => b.name === bo);
  const navigate = useNavigate();

  const [sorting, setSorting] = useState<SortingState>(parseSort(initialSort));
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [q, setQ]             = useState('');
  const [hidden, setHidden]   = useState<Set<string>>(new Set());

  const sortStr = sorting.map((s) => (s.desc ? '-' : '') + s.id).join(',');
  const list = useBoList({ bo, page, pageSize, sort: sortStr, q, filters: initialFilters });

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const helper = createColumnHelper<Record<string, unknown>>();
    const allCols = list.data?.columns ?? meta?.attributes ?? [];
    return allCols.filter((c) => !hidden.has(c.name)).map((attr) =>
      helper.accessor((row) => row[attr.name], {
        id: attr.name,
        header: attr.label || attr.name,
        cell: (info) => renderCell(info.getValue(), attr, schema),
        enableSorting: true,
        meta: { width: colWidth(attr) },
      })
    );
  }, [list.data?.columns, meta, hidden, schema]);

  const table = useReactTable({
    data: list.data?.rows ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
    manualPagination: true,
    rowCount: list.data?.total ?? 0,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => String(r.id ?? Math.random()),
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight(),
    overscan: 10,
  });

  // Recompute virtualizer after density changes (CSS var — observe via attribute).
  useEffect(() => {
    const obs = new MutationObserver(() => virt.measure());
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-density'] });
    return () => obs.disconnect();
  }, [virt]);

  const gridTemplate = table.getVisibleLeafColumns().map((c) => (c.columnDef.meta as any)?.width ?? '1fr').join(' ');
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / pageSize)) : 1;

  return (
    <div className="dt h-[calc(100vh-200px)]">
      <div className="dt-toolbar">
        <div className="relative">
          <Icon name="search" className="absolute left-2.5 top-2 text-muted" />
          <Input
            className="pl-8 w-60"
            placeholder="Search…"
            value={q}
            onChange={(e) => { setQ(e.currentTarget.value); setPage(1); }}
          />
        </div>
        <Button onClick={() => { setQ(''); setSorting(parseSort('-id')); setPage(1); }}>Reset</Button>
        {toolbar}
        <ColumnVisibility columns={meta?.attributes ?? []} hidden={hidden} setHidden={setHidden} />
        <div className="flex-1" />
        <span className="text-xs text-muted">
          {list.data ? `${list.data.total.toLocaleString()} rows` : '…'}
        </span>
        <Select value={pageSize} onChange={(e) => { setPageSize(Number(e.currentTarget.value)); setPage(1); }}>
          {[25, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}/page</option>)}
        </Select>
      </div>

      <div className="dt-head" style={{ gridTemplateColumns: gridTemplate }}>
        {table.getHeaderGroups()[0].headers.map((h) => {
          const dir = h.column.getIsSorted();
          return (
            <div key={h.id} onClick={h.column.getToggleSortingHandler()} role="columnheader" aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}>
              <span className="truncate">{flexRender(h.column.columnDef.header, h.getContext())}</span>
              {dir === 'asc'  && <Icon name="arrowUp"   size={12} />}
              {dir === 'desc' && <Icon name="arrowDown" size={12} />}
            </div>
          );
        })}
      </div>

      <div ref={containerRef} className="overflow-auto relative" role="rowgroup">
        {list.isLoading && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-7" />)}
          </div>
        )}
        {list.isError && <div className="dt-empty text-danger">Error: {String(list.error)}</div>}
        {list.isSuccess && rows.length === 0 && <div className="dt-empty">No rows match your filter.</div>}
        {list.isSuccess && rows.length > 0 && (
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((v) => {
              const row = rows[v.index];
              return (
                <div
                  key={row.id}
                  className="dt-row absolute left-0 right-0"
                  style={{
                    transform: `translateY(${v.start}px)`,
                    height: v.size,
                    gridTemplateColumns: gridTemplate,
                  }}
                  onClick={() => onRowClick ? onRowClick(row.original) : navigate(`/${bo}/${row.original.id}`)}
                  role="row"
                >
                  {row.getVisibleCells().map((cell) => (
                    <div key={cell.id} role="cell">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="dt-footer">
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-1">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
          <Button size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function ColumnVisibility({ columns, hidden, setHidden }: {
  columns: BoAttr[]; hidden: Set<string>; setHidden: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button size="sm" onClick={() => setOpen((o) => !o)}>
        <Icon name="listFilter" size={12} /> Columns
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-9 left-0 z-50 bg-surface border border-border rounded-md shadow-lg p-2 w-56 max-h-72 overflow-auto">
            {columns.map((c) => (
              <label key={c.name} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-elev cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={!hidden.has(c.name)}
                  onChange={(e) => {
                    const next = new Set(hidden);
                    if (e.currentTarget.checked) next.delete(c.name); else next.add(c.name);
                    setHidden(next);
                  }}
                />
                <span className="truncate">{c.label || c.name}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function parseSort(s: string): SortingState {
  return s.split(',').filter(Boolean).map((p) => {
    const desc = p.startsWith('-');
    return { id: desc ? p.slice(1) : p, desc };
  });
}

function rowHeight(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--cms-row-h').trim();
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 36;
}

function renderCell(v: unknown, col: BoAttr, schema: SchemaResponse): React.ReactNode {
  if (v == null || v === '') return <span className="text-muted">—</span>;
  if (col.fk) {
    const targetBo = schema.bos.find((b) => b.name === col.fk);
    return <code className="text-xs text-muted" title={`${col.fk}#${v}`}>{targetBo?.label ?? col.fk}#{String(v)}</code>;
  }
  if (col.name === 'status' || col.enumValues) return <Pill kind={pillKind(v)}>{String(v)}</Pill>;
  if (col.type === 'timestamp' || col.type === 'date') return <span className="text-muted">{formatDate(v)}</span>;
  if (col.type === 'decimal') return <span className="font-mono tabular-nums">{Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>;
  if (col.type === 'boolean') return v ? <Icon name="check" className="text-ok" /> : <Icon name="x" className="text-muted" />;
  return <span className="truncate" title={String(v)}>{String(v)}</span>;
}

function pillKind(v: unknown): 'ok' | 'warn' | 'bad' | 'info' | 'muted' {
  const cls = statusPill(v);
  return (cls.replace('pill-', '') as any) || 'muted';
}
