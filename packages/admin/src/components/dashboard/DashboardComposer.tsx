/**
 * Drag-drop dashboard composer (Phase 4 / §T6).
 *
 * Stack: react-grid-layout (12-col grid, mature lib, accessible-enough).
 * Tiles are React components selected from a small catalog. Layouts
 * persist per-user via /api/v1/preferences/dashboard:<scope>.
 *
 * Pre-built named layouts (Inbound Manager / Picker Floor / Quality
 * Lead) live alongside the composer in `presets.ts`.
 */

import { useEffect, useState } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { Button, Skeleton } from '../ui/primitives';
import { Icon, type IconName } from '../ui/icon';
import { useBoList, usePref, useSchema } from '../../hooks/queries';
import { statusPill, formatDate } from '../../lib/format';
import { Link } from 'react-router-dom';
import { Pill } from '../ui/primitives';

const RGL = WidthProvider(Responsive);

// ----- tile definitions -----

export type Tile =
  | { id: string; type: 'kpi';     bo: string; label: string; icon?: IconName }
  | { id: string; type: 'list';    bo: string; label: string; pageSize?: number; sort?: string }
  | { id: string; type: 'note';    text: string };

export interface DashboardModel {
  tiles:   Record<string, Tile>;
  layouts: { lg: Layout[]; md?: Layout[]; sm?: Layout[] };
}

export function DashboardComposer({ scope, defaultModel }: { scope: string; defaultModel: DashboardModel }) {
  const pref = usePref<DashboardModel>('dashboard:' + scope);
  const [editing, setEditing] = useState(false);
  const [model, setModel] = useState<DashboardModel>(defaultModel);

  useEffect(() => {
    if (pref.status === 'success' && pref.value) setModel(pref.value as DashboardModel);
  }, [pref.status, pref.value]);

  const save = () => { pref.set(model); setEditing(false); };
  const reset = () => { setModel(defaultModel); };
  const remove = (tileId: string) => {
    setModel((m) => {
      const tiles = { ...m.tiles }; delete tiles[tileId];
      return { ...m, tiles, layouts: { ...m.layouts, lg: m.layouts.lg.filter((l) => l.i !== tileId) } };
    });
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Dashboard</h2>
          <p className="text-xs text-muted">Layouts persist per user. Press Edit to drag, resize, or remove tiles.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={reset}>Reset</Button>
          <Button onClick={() => setEditing((e) => !e)} variant={editing ? 'primary' : 'ghost'}>
            <Icon name={editing ? 'check' : 'pencil'} /> {editing ? 'Done' : 'Edit'}
          </Button>
          {editing && <Button variant="primary" onClick={save}>Save layout</Button>}
        </div>
      </header>

      <RGL
        className={editing ? 'is-editing' : ''}
        layouts={model.layouts as any}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={56}
        margin={[12, 12]}
        isDraggable={editing}
        isResizable={editing}
        onLayoutChange={(layout) => editing && setModel((m) => ({ ...m, layouts: { ...m.layouts, lg: layout } }))}
      >
        {Object.values(model.tiles).map((t) => (
          <div key={t.id} className="bg-surface border border-border rounded-lg overflow-hidden flex flex-col">
            <header className="px-3 py-2 border-b border-border flex items-center justify-between bg-elev/50">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted truncate">{tileTitle(t)}</span>
              {editing && (
                <button onClick={() => remove(t.id)} className="text-muted hover:text-danger" title="Remove tile">
                  <Icon name="trash" size={14} />
                </button>
              )}
            </header>
            <div className="flex-1 overflow-auto">
              <TileBody tile={t} />
            </div>
          </div>
        ))}
      </RGL>
    </div>
  );
}

function tileTitle(t: Tile): string {
  if (t.type === 'kpi')  return t.label;
  if (t.type === 'list') return t.label;
  return 'Note';
}

function TileBody({ tile }: { tile: Tile }) {
  if (tile.type === 'note') return <p className="p-3 text-sm text-muted">{tile.text}</p>;
  if (tile.type === 'kpi')  return <KpiBody tile={tile} />;
  if (tile.type === 'list') return <ListBody tile={tile} />;
  return null;
}

function KpiBody({ tile }: { tile: Extract<Tile, { type: 'kpi' }> }) {
  const list = useBoList({ bo: tile.bo, pageSize: 1 });
  return (
    <div className="p-4 grid place-items-center text-center">
      {list.isLoading
        ? <Skeleton className="h-10 w-20" />
        : <>
            <div className="text-3xl font-semibold tabular-nums">{(list.data?.total ?? 0).toLocaleString()}</div>
            <Link to={'/' + tile.bo} className="mt-1 text-xs text-accent hover:underline">View →</Link>
          </>
      }
    </div>
  );
}

function ListBody({ tile }: { tile: Extract<Tile, { type: 'list' }> }) {
  const { data: schema } = useSchema();
  const list = useBoList({ bo: tile.bo, pageSize: tile.pageSize ?? 8, sort: tile.sort });
  const meta = schema?.bos.find((b) => b.name === tile.bo);
  if (!schema || list.isLoading) return <div className="p-3 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>;
  if (list.isError) return <div className="p-3 text-danger text-sm">Failed to load.</div>;
  const labelCol = meta?.groups['label']?.[0] ?? meta?.groups['list']?.[0] ?? 'id';
  return (
    <ul className="divide-y divide-border">
      {(list.data?.rows ?? []).map((r) => (
        <li key={String(r.id)} className="flex items-center justify-between px-3 py-2 hover:bg-elev/40">
          <Link to={`/${tile.bo}/${String(r.id)}`} className="text-sm hover:text-accent truncate">
            {String(r[labelCol] ?? `#${String(r.id)}`)}
          </Link>
          {r.status != null && <Pill kind={statusPill(r.status).replace('pill-', '') as any}>{String(r.status)}</Pill>}
          {r.created_at != null && r.status == null && <span className="text-xs text-muted">{formatDate(r.created_at)}</span>}
        </li>
      ))}
    </ul>
  );
}
