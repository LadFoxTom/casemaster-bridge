import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:          'rgb(var(--cms-bg) / <alpha-value>)',
        surface:     'rgb(var(--cms-surface) / <alpha-value>)',
        elev:        'rgb(var(--cms-elev) / <alpha-value>)',
        border:      'rgb(var(--cms-border) / <alpha-value>)',
        fg:          'rgb(var(--cms-fg) / <alpha-value>)',
        muted:       'rgb(var(--cms-muted) / <alpha-value>)',
        accent:      'rgb(var(--cms-accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--cms-accent-fg) / <alpha-value>)',
        ok:          'rgb(var(--cms-ok) / <alpha-value>)',
        warn:        'rgb(var(--cms-warn) / <alpha-value>)',
        danger:      'rgb(var(--cms-danger) / <alpha-value>)',
      },
    },
  },
  plugins: [],
} satisfies Config;
