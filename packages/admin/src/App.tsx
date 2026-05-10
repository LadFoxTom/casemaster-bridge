/**
 * Root composition:
 *
 *   QueryClientProvider
 *     BrowserRouter (basename=/admin so the SPA mounts at /admin/*)
 *       Toaster
 *       Shell
 *         Routes
 *       CommandPalette + ShortcutsModal + Copilot (modals/overlays)
 *
 * BO names contain slashes (`wms/inventory`), so the route shape uses
 * a splat for the BO segment. App-level `useParams['*']` plus a
 * resolver pulls out the right (bo, id) pair.
 */

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';

import './styles.css';

import { Shell } from './components/layout/Shell';
import { CommandPalette } from './components/command/CommandPalette';
import { ShortcutsModal } from './components/layout/ShortcutsModal';
import { Copilot } from './components/copilot/Copilot';
import { Dashboard } from './pages/Dashboard';
import { ListPage } from './pages/ListPage';
import { DetailPage } from './pages/DetailPage';
import { InboundCenter } from './pages/InboundCenter';
import { useShortcut } from './lib/shortcuts';
import { useSchema } from './hooks/queries';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter basename="/admin">
        <Toaster richColors position="bottom-right" />
        <Inner />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Inner() {
  const [cmdOpen,    setCmdOpen]    = useState(false);
  const [shortsOpen, setShortsOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const navigate = useNavigate();

  // Linear-class shortcuts (T5). 'g X' chord support is in lib/shortcuts.ts.
  useShortcut('mod+k', () => setCmdOpen(true), 'Open command palette');
  useShortcut('mod+j', () => setCopilotOpen(true), 'Open Copilot');
  useShortcut('?',     () => setShortsOpen(true), 'Show keyboard shortcuts');
  useShortcut('mod+shift+l', () => {
    const t = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = t === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', t !== 'dark');
  }, 'Toggle theme');
  useShortcut('g d', () => navigate('/'),               'Go: dashboard');
  useShortcut('g i', () => navigate('/wms/inventory'),  'Go: inventory');
  useShortcut('g a', () => navigate('/wms/asn'),        'Go: ASNs');
  useShortcut('g r', () => navigate('/wms/receipt'),    'Go: receipts');
  useShortcut('g o', () => navigate('/wms/sales_order'),'Go: orders');
  useShortcut('g b', () => navigate('/wms/inbound'),    'Go: inbound center');

  return (
    <Shell onOpenCmd={() => setCmdOpen(true)} onOpenCopilot={() => setCopilotOpen(true)}>
      <RoutesWithBoSplat />
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} onOpenCopilot={() => setCopilotOpen(true)} onOpenShortcuts={() => setShortsOpen(true)} />
      <ShortcutsModal open={shortsOpen} onClose={() => setShortsOpen(false)} />
      <Copilot open={copilotOpen} onClose={() => setCopilotOpen(false)} />
    </Shell>
  );
}

/**
 * Splat handler: BO names contain slashes ("wms/inventory"). React
 * Router's standard params can't capture multi-segment IDs cleanly, so
 * we mount a single splat route and resolve to (bo, maybe id) here.
 */
function RoutesWithBoSplat() {
  const loc = useLocation();
  const { data: schema } = useSchema();

  // Static routes first.
  if (loc.pathname === '/' || loc.pathname === '/wms')      return <Routes><Route path="*" element={<Dashboard />} /></Routes>;
  if (loc.pathname === '/wms/inbound')                       return <Routes><Route path="*" element={<InboundCenter />} /></Routes>;

  // BO/detail resolution.
  if (!schema) return null;
  const parts = loc.pathname.replace(/^\//, '').split('/').filter(Boolean);
  const last  = parts[parts.length - 1];
  const isDetail = last && (/^\d+$/.test(last) || last === 'new');
  const boName = (isDetail ? parts.slice(0, -1) : parts).join('/');

  const isKnown = schema.bos.some((b) => b.name === boName);
  if (!isKnown) return <Navigate to="/" replace />;
  if (isDetail) return <DetailWrapper bo={boName} id={last as string} />;
  return <ListWrapper bo={boName} />;
}

function ListWrapper({ bo }: { bo: string }) {
  // ListPage reads `*` from useParams — pretend by setting it via context.
  return <Routes><Route path="*" element={<ListPage />} /></Routes>;
}
function DetailWrapper({ bo, id }: { bo: string; id: string }) {
  return <Routes><Route path="*" element={<DetailPage />} /></Routes>;
}
