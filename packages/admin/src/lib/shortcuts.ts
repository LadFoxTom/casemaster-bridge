/**
 * Global shortcut registry. Linear-style: simple chord (mod-k), prefixed
 * (g i), and bare (?). Stored in a singleton so any component can bind.
 */

import { useEffect } from 'react';

type Handler = (e: KeyboardEvent) => void;

interface Entry { handler: Handler; label: string; }

const map = new Map<string, Entry>();
let recent = '';
let recentAt = 0;

function key(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey)   parts.push('alt');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    const inEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (inEditable && !(e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) return;

    const now = Date.now();
    if (recent === 'g' && now - recentAt < 1000 && /^[a-z0-9]$/i.test(e.key)) {
      const combo = `g ${e.key.toLowerCase()}`;
      const entry = map.get(combo);
      if (entry) { e.preventDefault(); entry.handler(e); recent = ''; return; }
    }
    if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      recent = 'g'; recentAt = now;
    } else { recent = ''; }

    const k = key(e);
    const entry = map.get(k);
    if (entry) { e.preventDefault(); entry.handler(e); }
  });
}

export function useShortcut(combo: string, handler: Handler, label = '') {
  useEffect(() => {
    map.set(combo, { handler, label });
    return () => { map.delete(combo); };
  }, [combo, handler, label]);
}

export function listShortcuts() {
  return [...map.entries()].map(([combo, e]) => ({ combo, label: e.label }));
}
