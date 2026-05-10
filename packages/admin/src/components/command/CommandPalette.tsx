/**
 * Command palette built on `cmdk` (the library that powers Linear, Raycast,
 * and the shadcn Command primitive). The roadmap pegs Cmd-K as a hero
 * pattern; cmdk handles fuzzy matching, keyboard nav, and accessibility.
 */

import { Command } from 'cmdk';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../ui/icon';
import { Kbd } from '../ui/primitives';
import { useSchema } from '../../hooks/queries';
import { applyDensity, applyTheme } from '../../lib/theme';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCopilot?: () => void;
  onOpenShortcuts?: () => void;
}

export function CommandPalette({ open, onOpenChange, onOpenCopilot, onOpenShortcuts }: Props) {
  const { data: schema } = useSchema();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  useEffect(() => { if (open) setQ(''); }, [open]);

  const groups = useMemo(() => {
    if (!schema) return { pages: [], bos: [], cmds: [] };
    return {
      pages: schema.pages.map((p) => ({ key: p.path, title: p.title ?? p.path, sub: '/' + p.path, icon: (p.icon as IconName) || 'fileText',
        run: () => navigate(`/${p.path}`) })),
      bos: schema.bos.map((b) => ({ key: b.name, title: `Open ${b.label || b.name}`, sub: b.name, icon: 'database' as IconName,
        run: () => navigate(`/${b.name}`) })),
      cmds: [
        { key: 'theme:toggle',   title: 'Toggle theme',           sub: 'switch dark/light', icon: 'sun' as IconName, run: () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
        { key: 'theme:auto',     title: 'Theme: auto',            sub: 'follow OS preference', icon: 'sun' as IconName, run: () => applyTheme('auto') },
        { key: 'density:compact',title: 'Density: compact',       sub: 'tight rows', icon: 'listFilter' as IconName, run: () => applyDensity('compact') },
        { key: 'density:cozy',   title: 'Density: cozy',          sub: 'balanced', icon: 'listFilter' as IconName, run: () => applyDensity('cozy') },
        { key: 'density:comf',   title: 'Density: comfortable',   sub: 'spacious', icon: 'listFilter' as IconName, run: () => applyDensity('comfortable') },
        { key: 'open:copilot',   title: 'Open Copilot',           sub: 'Cmd-J', icon: 'sparkles' as IconName, run: () => onOpenCopilot?.() },
        { key: 'open:shortcuts', title: 'Open keyboard shortcuts', sub: '?', icon: 'zap' as IconName, run: () => onOpenShortcuts?.() },
      ],
    };
  }, [schema, navigate, onOpenCopilot, onOpenShortcuts]);

  if (!open) return null;
  const close = () => onOpenChange(false);
  const runAndClose = (fn: () => void) => { fn(); close(); };

  return (
    <>
      <div className="cmd-backdrop" onClick={close} />
      <Command
        label="Command palette"
        loop
        className="cmd-shell"
        shouldFilter
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Icon name="search" className="text-muted" />
          <Command.Input
            value={q}
            onValueChange={setQ}
            placeholder="Type to search pages, records, actions…"
            className="flex-1 bg-transparent border-0 outline-none text-sm py-1.5 placeholder:text-muted text-fg"
            autoFocus
          />
          <Kbd>esc</Kbd>
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto py-1">
          <Command.Empty className="px-4 py-8 text-center text-sm text-muted">No matches.</Command.Empty>

          {groups.pages.length > 0 && (
            <Command.Group heading="Pages">
              {groups.pages.map((it) => (
                <Command.Item key={`p:${it.key}`} value={`page ${it.title} ${it.sub}`} onSelect={() => runAndClose(it.run)} className="px-3 py-2 mx-1 rounded-md cursor-pointer flex items-center gap-3 data-[selected=true]:bg-elev">
                  <Icon name={it.icon} className="text-muted" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{it.title}</div>
                    <div className="text-xs text-muted truncate">{it.sub}</div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {groups.bos.length > 0 && (
            <Command.Group heading="Data">
              {groups.bos.map((it) => (
                <Command.Item key={`b:${it.key}`} value={`bo ${it.title} ${it.sub}`} onSelect={() => runAndClose(it.run)} className="px-3 py-2 mx-1 rounded-md cursor-pointer flex items-center gap-3 data-[selected=true]:bg-elev">
                  <Icon name={it.icon} className="text-muted" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{it.title}</div>
                    <div className="text-xs text-muted truncate">{it.sub}</div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Commands">
            {groups.cmds.map((it) => (
              <Command.Item key={`c:${it.key}`} value={`cmd ${it.title} ${it.sub}`} onSelect={() => runAndClose(it.run)} className="px-3 py-2 mx-1 rounded-md cursor-pointer flex items-center gap-3 data-[selected=true]:bg-elev">
                <Icon name={it.icon} className="text-muted" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{it.title}</div>
                  <div className="text-xs text-muted truncate">{it.sub}</div>
                </div>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
        <div className="flex items-center gap-3 px-3 py-2 border-t border-border text-xs text-muted">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span><Kbd>↵</Kbd> select</span>
        </div>
      </Command>
    </>
  );
}
