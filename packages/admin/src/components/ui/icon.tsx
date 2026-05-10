/**
 * Inline SVG icon set. Lucide-flavoured, subset only — no 200KB pulled in.
 * If you need more, just copy the path from https://lucide.dev.
 */

import { cn } from '../../lib/cn';

export const ICONS = {
  search:            'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-5.4-5.4',
  menu:              'M3 6h18 M3 12h18 M3 18h18',
  x:                 'M18 6 6 18 M6 6l12 12',
  sun:               'M12 3v1 M12 20v1 M3 12h1 M20 12h1 M5.6 5.6l.7.7 M17.7 17.7l.7.7 M5.6 18.4l.7-.7 M17.7 6.3l.7-.7',
  moon:              'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  circle:            'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  fileText:          'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  database:          'M12 8c4.97 0 9-1.79 9-4s-4.03-4-9-4-9 1.79-9 4 4.03 4 9 4 M3 5v14c0 2.21 4 4 9 4s9-1.79 9-4V5 M3 12c0 2.21 4 4 9 4s9-1.79 9-4',
  zap:               'm13 2-3 14h7l-3 8 11-14h-8l3-8H4z',
  package:           'm7.5 4.27 9 5.15 M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z M3.3 7 12 12l8.7-5 M12 22V12',
  truck:             'M5 18H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h13v14h-3 M9 18h7 M14 9h4l3 3v6h-3 M5 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M16 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  boxes:             'M2.97 12.92 2 16l2.97 1.08L8 16l-3.03-3.08-3 0z M5 16l3-1 3 1 3-1 3 1 M2 16v3l3 1.5v-3l-3-1.5z M5 19.5l3-1.5v-3l-3 1.5v3z',
  users:             'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  inbox:             'm22 12-6 0-2 3h-4l-2-3-6 0 M6 5l-4 7v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-4-7H6Z',
  tag:               'm20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z',
  mapPin:            'M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0z M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  clipboardCheck:    'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 14l2 2 4-4 M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z',
  shoppingCart:      'm1 1 4 0 2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6 M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2 M20 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  building:          'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2 M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2',
  settings:          'M12 15.5A3.5 3.5 0 1 0 12 8.5 3.5 3.5 0 0 0 12 15.5z',
  layoutDashboard:   'M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z',
  chevronDown:       'm6 9 6 6 6-6',
  chevronRight:      'm9 18 6-6-6-6',
  arrowUp:           'm5 12 7-7 7 7 M12 19V5',
  arrowDown:         'm5 12 7 7 7-7 M12 5v14',
  pencil:            'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  trash:             'm3 6 3 0 16 0 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6',
  plus:              'M5 12h14 M12 5v14',
  check:             'm20 6-11 11-5-5',
  sparkles:          'm12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z',
  listFilter:        'M3 6h18 M7 12h10 M10 18h4',
  refresh:           'M21 12a9 9 0 1 1-3-6.7L21 8 M21 3v5h-5',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className, size = 16 }: { name: IconName; className?: string; size?: number }) {
  const d = ICONS[name];
  // Split on " M" boundaries so multi-segment paths render distinct elements.
  const segments = d.split(' M').map((s, i) => i === 0 ? s : 'M' + s);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(className)}
      aria-hidden="true"
      focusable="false"
    >
      {segments.map((seg, i) => <path key={i} d={seg} />)}
    </svg>
  );
}
