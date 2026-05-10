import { Dialog, Kbd } from '../ui/primitives';
import { listShortcuts } from '../../lib/shortcuts';

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const list = listShortcuts();
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <ul className="space-y-2 max-h-[60vh] overflow-auto">
        {list.length === 0 && <li className="text-sm text-muted">No shortcuts registered.</li>}
        {list.map((s) => (
          <li key={s.combo} className="flex items-center justify-between gap-3">
            <span className="text-sm">{s.label || s.combo}</span>
            <span className="flex gap-1">
              {s.combo.split(/[ +]/).map((p) => <Kbd key={p}>{p}</Kbd>)}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
