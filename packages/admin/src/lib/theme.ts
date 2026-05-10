/**
 * Theme (light/dark/auto) + density (compact/cozy/comfortable) state.
 * Tokens live in styles.css; this module just toggles dataset attrs and
 * persists choices.
 */

import { useEffect, useState } from 'react';

const THEME_KEY = 'cms.admin.theme';
const DENS_KEY  = 'cms.admin.density';

export type Theme   = 'dark' | 'light' | 'auto';
export type Density = 'compact' | 'cozy' | 'comfortable';

function resolveAuto(t: Theme): 'dark' | 'light' {
  if (t === 'auto') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return t;
}

export function applyTheme(t: Theme) {
  const eff = resolveAuto(t);
  document.documentElement.dataset.theme = eff;
  document.documentElement.classList.toggle('dark', eff === 'dark');
  localStorage.setItem(THEME_KEY, t);
}
export function applyDensity(d: Density) {
  document.documentElement.dataset.density = d;
  localStorage.setItem(DENS_KEY, d);
}

export function initialTheme(): Theme {
  return (localStorage.getItem(THEME_KEY) as Theme) || 'dark';
}
export function initialDensity(): Density {
  return (localStorage.getItem(DENS_KEY) as Density) || 'cozy';
}

// Apply on module load — avoids a flash of unstyled content.
applyTheme(initialTheme());
applyDensity(initialDensity());

export function useTheme() {
  const [theme, set] = useState<Theme>(initialTheme());
  const setTheme = (t: Theme) => { applyTheme(t); set(t); };
  // Re-apply when the OS preference changes if the user picked 'auto'.
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (theme === 'auto') applyTheme('auto'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
  return [theme, setTheme] as const;
}

export function useDensity() {
  const [d, set] = useState<Density>(initialDensity());
  const setDensity = (next: Density) => { applyDensity(next); set(next); };
  return [d, setDensity] as const;
}
