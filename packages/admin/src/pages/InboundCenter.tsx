/**
 * Workflow-shaped page: master-detail (ASN list left, receive form right).
 *
 * Demonstrates Phase 4: page actions reused via /api/v1/page/wms/inbound/receive,
 * master-detail layout, dependent queries, optimistic UX.
 */

import { useEffect, useState } from 'react';
import { Button, Pill, Skeleton } from '../components/ui/primitives';
import { Icon } from '../components/ui/icon';
import { api } from '../lib/api';
import { usePageAction, useBoGet, useBoList, useSchema } from '../hooks/queries';
import { formatDate, statusPill } from '../lib/format';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';

export function InboundCenter() {
  const [asnId, setAsnId] = useState<number | null>(null);
  const { data: schema } = useSchema();
  if (!schema) return null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">📦 Inbound center</h1>
        <p className="text-sm text-muted">Pick an ASN to start receiving — runs the existing <code>postReceive</code> .cms function via <code>/api/v1/page/wms/inbound/receive</code>.</p>
      </header>
      <div className="grid lg:grid-cols-[1fr,1fr] gap-4">
        <PendingAsns onPick={setAsnId} selected={asnId} />
        {asnId
          ? <ReceiveForm asnId={asnId} onClose={() => setAsnId(null)} />
          : <div className="bg-surface border border-border border-dashed rounded-lg p-8 text-center text-muted">
              <Icon name="inbox" size={36} className="mx-auto mb-2 opacity-50" />
              Pick an ASN on the left to start receiving.
            </div>
        }
      </div>
    </div>
  );
}

function PendingAsns({ onPick, selected }: { onPick: (id: number) => void; selected: number | null }) {
  const list = useBoList({
    bo: 'wms/asn',
    pageSize: 50,
    sort: '-expected_arrival',
    filters: { status: ['CONFIRMED','IN_TRANSIT','ARRIVED','RECEIVING','DRAFT'] },
  });

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {list.isLoading && <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>}
      {list.isSuccess && (list.data?.rows ?? []).map((r) => (
        <button
          key={String(r.id)}
          onClick={() => onPick(Number(r.id))}
          className={`w-full text-left flex items-center justify-between px-3 py-2.5 hover:bg-elev/60 border-b border-border ${String(selected) === String(r.id) ? 'bg-accent/10' : ''}`}
        >
          <div>
            <div className="font-medium">{String(r.asn_number)}</div>
            <div className="text-xs text-muted">expected {formatDate(r.expected_arrival)} · {String(r.total_units)} units</div>
          </div>
          <Pill kind={statusPill(r.status).replace('pill-', '') as any}>{String(r.status)}</Pill>
        </button>
      ))}
    </div>
  );
}

function ReceiveForm({ asnId, onClose }: { asnId: number; onClose: () => void }) {
  const asn = useBoGet('wms/asn', asnId);
  const lines = useBoList({ bo: 'wms/asn_line', pageSize: 200, sort: 'line_number', filters: { asn_id: String(asnId) } });
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [lots, setLots] = useState<Record<string, string>>({});
  const action = usePageAction('wms/inbound', 'receive');
  const qc = useQueryClient();

  useEffect(() => {
    if (lines.isSuccess) {
      const initialQ: Record<string,string> = {};
      const initialL: Record<string,string> = {};
      for (const ln of lines.data?.rows ?? []) {
        const out = Math.max(0, Number(ln.expected_qty) - Number(ln.received_qty ?? 0));
        initialQ[String(ln.id)] = String(out);
        initialL[String(ln.id)] = String(ln.lot_number ?? '');
      }
      setQtys(initialQ); setLots(initialL);
    }
  }, [lines.isSuccess, lines.data?.rows]);

  // Prefetch item names for the rows so we can show SKU + name without an N+1 cascade.
  const itemIds = [...new Set((lines.data?.rows ?? []).map((l) => Number(l.item_id)))];
  const items = useQuery({
    queryKey: ['fk', 'wms/item', 'batch', itemIds.join(',')],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const out: Record<string, Record<string, unknown>> = {};
      for (const id of itemIds) { try { const r = await api.boGet('wms/item', id); out[String(id)] = r.row; } catch {} }
      return out;
    },
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, unknown> = { asn: asnId };
    for (const [id, q] of Object.entries(qtys)) if (Number(q) > 0) params[`qty_${id}`] = q;
    for (const [id, l] of Object.entries(lots))  if (l) params[`lot_${id}`] = l;
    await action.mutateAsync(params);
    qc.invalidateQueries({ queryKey: ['bo', 'wms/asn'] });
    qc.invalidateQueries({ queryKey: ['bo', 'wms/asn_line'] });
    qc.invalidateQueries({ queryKey: ['bo', 'wms/inventory'] });
    qc.invalidateQueries({ queryKey: ['bo', 'wms/putaway_task'] });
    qc.invalidateQueries({ queryKey: ['bo', 'wms/receipt'] });
  };

  if (asn.isLoading || lines.isLoading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>;

  return (
    <form className="bg-surface border border-border rounded-lg overflow-hidden" onSubmit={onSubmit}>
      <header className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-xs text-muted">Receive against</div>
          <div className="font-semibold">{String(asn.data?.row.asn_number)}</div>
        </div>
        <button type="button" className="text-muted hover:text-fg" onClick={onClose}><Icon name="x" /></button>
      </header>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-elev text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Line</th>
              <th className="px-3 py-2 text-left">SKU / Name</th>
              <th className="px-3 py-2 text-right">Expected</th>
              <th className="px-3 py-2 text-right">Received</th>
              <th className="px-3 py-2">Receive now</th>
              <th className="px-3 py-2">Lot</th>
            </tr>
          </thead>
          <tbody>
            {(lines.data?.rows ?? []).map((ln) => {
              const it = items.data?.[String(ln.item_id)];
              return (
                <tr key={String(ln.id)} className="border-t border-border">
                  <td className="px-3 py-2 tabular-nums">{String(ln.line_number)}</td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">{String(it?.sku ?? '—')}</div>
                    <div className="text-xs text-muted">{String(it?.name ?? `item #${ln.item_id}`)}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{String(ln.expected_qty)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{String(ln.received_qty ?? 0)}</td>
                  <td className="px-3 py-2">
                    <input className="field !py-1 w-20 text-right tabular-nums" type="number" min="0" value={qtys[String(ln.id)] ?? ''} onChange={(e) => setQtys((q) => ({ ...q, [String(ln.id)]: e.currentTarget.value }))} />
                  </td>
                  <td className="px-3 py-2">
                    <input className="field !py-1 w-32 font-mono text-xs" value={lots[String(ln.id)] ?? ''} onChange={(e) => setLots((l) => ({ ...l, [String(ln.id)]: e.currentTarget.value }))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="px-4 py-3 border-t border-border flex items-center justify-between bg-elev/40">
        <span className="text-xs text-muted">Posts a receipt + inventory rows + putaway tasks via the .cms action.</span>
        <Button type="submit" variant="primary" disabled={action.isPending}>
          {action.isPending ? 'Posting…' : 'Post receipt'}
        </Button>
      </footer>
    </form>
  );
}
