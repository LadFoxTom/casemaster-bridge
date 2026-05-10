/**
 * Cmd-J Copilot panel.
 *
 * Roadmap §T7: bring-your-own-key, off by default, key never leaves the
 * browser. Pluggable provider (`openai` / `anthropic`); offline keyword
 * router so the panel is useful even without a key.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../ui/icon';
import { Button, Field, Input, Select } from '../ui/primitives';
import { applyTheme } from '../../lib/theme';
import { useSchema } from '../../hooks/queries';

interface Msg { who: 'you' | 'copilot' | 'system'; text: string; }
interface CopilotConfig { provider: 'offline' | 'openai' | 'anthropic'; key: string; model: string; }

const CFG_KEY = 'cms.admin.copilot';

function loadConfig(): CopilotConfig {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) ?? '') as CopilotConfig; }
  catch { return { provider: 'offline', key: '', model: '' }; }
}
function saveConfig(c: CopilotConfig) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }

export function Copilot({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: schema } = useSchema();
  const navigate = useNavigate();
  const [cfg, setCfg]   = useState<CopilotConfig>(() => loadConfig());
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    { who: 'copilot',
      text: 'Hi — I navigate, filter and explain pages. Try "show me ASNs in transit" or "open inventory". For real LLM-backed answers, set a key in Settings below.' },
  ]);
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = q.trim(); if (!text) return;
    setQ('');
    setMsgs((m) => [...m, { who: 'you', text }]);
    setThinking(true);
    try {
      const reply = await respond(text, cfg, schema, navigate);
      setMsgs((m) => [...m, { who: 'copilot', text: reply }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { who: 'system', text: `Copilot error: ${e?.message ?? String(e)}` }]);
    } finally { setThinking(false); }
  };

  if (!open) return null;
  return (
    <>
      <div className="cmd-backdrop" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[420px] max-w-[92vw] bg-surface border-l border-border z-[51] flex flex-col">
        <header className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="sparkles" className="text-accent" />
            <h3 className="font-semibold">Copilot</h3>
            <span className="text-xs text-muted">· {cfg.provider}{cfg.provider !== 'offline' && cfg.model ? ` (${cfg.model})` : ''}</span>
          </div>
          <Button size="icon" variant="ghost" onClick={() => setShowSettings((s) => !s)} title="Settings">
            <Icon name="settings" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></Button>
        </header>

        {showSettings && (
          <section className="border-b border-border p-3 space-y-2 bg-elev/40">
            <Field label="Provider">
              <Select value={cfg.provider} onChange={(e) => { const next = { ...cfg, provider: e.currentTarget.value as any }; setCfg(next); saveConfig(next); }}>
                <option value="offline">Offline (keyword router)</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </Select>
            </Field>
            {cfg.provider !== 'offline' && (
              <>
                <Field label="API key" hint="Stored only in localStorage; never sent to our servers.">
                  <Input type="password" value={cfg.key} onChange={(e) => { const next = { ...cfg, key: e.currentTarget.value }; setCfg(next); saveConfig(next); }} placeholder={cfg.provider === 'openai' ? 'sk-...' : 'sk-ant-...'} />
                </Field>
                <Field label="Model">
                  <Input value={cfg.model} onChange={(e) => { const next = { ...cfg, model: e.currentTarget.value }; setCfg(next); saveConfig(next); }} placeholder={cfg.provider === 'openai' ? 'gpt-4o-mini' : 'claude-haiku-4-5'} />
                </Field>
              </>
            )}
          </section>
        )}

        <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.who === 'you' ? 'justify-end' : ''}`}>
              <div className={
                m.who === 'you'
                  ? 'rounded-lg px-3 py-2 max-w-[85%] bg-accent text-accent-fg'
                  : m.who === 'system'
                  ? 'rounded-lg px-3 py-2 max-w-[85%] bg-warn/10 text-warn border border-warn/30'
                  : 'rounded-lg px-3 py-2 max-w-[85%] bg-elev'
              }>{m.text}</div>
            </div>
          ))}
          {thinking && <div className="text-xs text-muted">Thinking…</div>}
          <div ref={endRef} />
        </div>

        <form className="p-3 border-t border-border flex gap-2" onSubmit={submit}>
          <Input className="flex-1" placeholder="Ask Copilot…" value={q} onChange={(e) => setQ(e.currentTarget.value)} autoFocus />
          <Button type="submit" variant="primary" disabled={thinking || !q.trim()}>Send</Button>
        </form>
      </aside>
    </>
  );
}

// ----- routing ---------------------------------------------------------------

async function respond(
  text: string,
  cfg: CopilotConfig,
  schema: ReturnType<typeof useSchema>['data'],
  navigate: ReturnType<typeof useNavigate>,
): Promise<string> {
  // 1) cheap offline router catches the most useful 80%
  const routed = offlineRoute(text, schema, navigate);
  if (routed) return routed;
  // 2) escalate to LLM if a key is set
  if (cfg.provider === 'offline' || !cfg.key) {
    return 'Offline mode — I can navigate, filter, and toggle theme. Set an LLM key in Settings for natural-language answers.';
  }
  return await callLLM(cfg, text, schema);
}

function offlineRoute(text: string, schema: ReturnType<typeof useSchema>['data'], navigate: ReturnType<typeof useNavigate>): string | null {
  const lc = text.toLowerCase();
  const m = lc.match(/(?:open|show|go to|navigate to)\s+(.+)/);
  const target = m?.[1] ?? lc;

  // map to a known page or BO by fuzzy include
  if (schema) {
    const hit = schema.pages.find((p) => target.includes(p.path.split('/').pop() ?? '') || (p.title && target.includes(p.title.toLowerCase()))) ??
                schema.bos.find((b)   => target.includes(b.name.split('/').pop() ?? '') || (b.label && target.includes(b.label.toLowerCase())));
    if (hit && 'path' in hit && hit.path) { navigate('/' + hit.path); return `Opened ${hit.title ?? hit.path}.`; }
    if (hit && 'name' in hit) { navigate('/' + hit.name); return `Opened ${hit.label ?? hit.name}.`; }
  }
  if (/dark/.test(lc))  { applyTheme('dark');  return 'Switched to dark theme.'; }
  if (/light/.test(lc)) { applyTheme('light'); return 'Switched to light theme.'; }
  return null;
}

async function callLLM(cfg: CopilotConfig, prompt: string, schema: ReturnType<typeof useSchema>['data']): Promise<string> {
  const sys = `You are Casemaster Copilot. The user runs a CaseMaster admin app with these BOs: ${schema?.bos.map((b) => b.name).join(', ')}. Be terse. Answer in <60 words.`;
  if (cfg.provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 200,
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message ?? 'openai error');
    return j.choices?.[0]?.message?.content?.trim() ?? '(empty)';
  }
  if (cfg.provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model || 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: sys,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message ?? 'anthropic error');
    const text = (j.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
    return text.trim() || '(empty)';
  }
  return '(unsupported provider)';
}
