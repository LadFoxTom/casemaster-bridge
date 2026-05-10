/** Tailwind-friendly className concat. */
export function cn(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(' ');
}
