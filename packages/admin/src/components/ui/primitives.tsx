/**
 * Shadcn-philosophy primitives: small, opinionated, copy-pasteable.
 * No black-box library. Tailwind classes against the cms- design tokens.
 */

import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'link'; size?: 'sm' | 'md' | 'icon' }>(
  ({ variant = 'ghost', size = 'md', className, ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        size === 'sm' && 'h-7 px-2 text-xs',
        size === 'md' && 'h-8 px-3 text-sm',
        size === 'icon' && 'h-8 w-8 p-0',
        variant === 'primary' && 'bg-accent text-accent-fg hover:brightness-110',
        variant === 'ghost'   && 'text-fg border border-border bg-transparent hover:bg-elev',
        variant === 'danger'  && 'text-danger border border-border hover:bg-danger/10',
        variant === 'link'    && 'text-accent underline-offset-4 hover:underline',
        className,
      )}
      {...rest}
    />
  ),
);
Button.displayName = 'Button';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-8 w-full rounded-md border border-border bg-bg px-2.5 text-sm text-fg',
      'placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent',
      'disabled:opacity-50',
      className,
    )}
    {...rest}
  />
));
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...rest }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-8 rounded-md border border-border bg-bg px-2 text-sm text-fg',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent',
      className,
    )}
    {...rest}
  />
));
Select.displayName = 'Select';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn('w-full rounded-md border border-border bg-bg p-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', className)}
    {...rest}
  />
));
Textarea.displayName = 'Textarea';

export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="block text-xs font-medium text-muted mb-1">{label}</span>}
      {children}
      {hint && !error && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
      {error && <span role="alert" className="block text-[11px] text-danger mt-1">{error}</span>}
    </label>
  );
}

export function Pill({ kind = 'muted', children }: { kind?: 'ok' | 'warn' | 'bad' | 'info' | 'muted'; children: React.ReactNode }) {
  return <span className={`pill pill-${kind}`}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skel', className)} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd>{children}</kbd>;
}

/** A focus-trapping modal scaffold. */
export function Dialog({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title?: string; children?: React.ReactNode; footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (!open) return null;
  return (
    <>
      <div className="cmd-backdrop" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface border border-border rounded-lg shadow-2xl z-[51]',
          size === 'sm' && 'w-[400px] max-w-[92vw]',
          size === 'md' && 'w-[640px] max-w-[92vw]',
          size === 'lg' && 'w-[920px] max-w-[92vw]',
        )}
      >
        {title && (
          <header className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-base font-semibold">{title}</h3>
            <button className="text-muted hover:text-fg" onClick={onClose} aria-label="Close">✕</button>
          </header>
        )}
        <div className="p-4">{children}</div>
        {footer && <footer className="px-4 py-3 border-t border-border flex justify-end gap-2">{footer}</footer>}
      </div>
    </>
  );
}
