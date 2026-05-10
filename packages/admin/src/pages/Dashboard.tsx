import { useState } from 'react';
import { Select } from '../components/ui/primitives';
import { DashboardComposer } from '../components/dashboard/DashboardComposer';
import { PRESETS } from '../components/dashboard/presets';
import { useSchema } from '../hooks/queries';

export function Dashboard() {
  const { data: schema } = useSchema();
  const [preset, setPreset] = useState<keyof typeof PRESETS>('inbound_manager');

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{schema?.appName ?? 'Casemaster'}</h1>
          <p className="text-sm text-muted">Press <kbd>⌘</kbd>+<kbd>K</kbd> to navigate · <kbd>?</kbd> for shortcuts · <kbd>⌘</kbd>+<kbd>J</kbd> for Copilot.</p>
        </div>
        <Select value={preset} onChange={(e) => setPreset(e.currentTarget.value as keyof typeof PRESETS)}>
          <option value="inbound_manager">Inbound Manager</option>
          <option value="picker_floor">Picker Floor</option>
          <option value="quality_lead">Quality Lead</option>
        </Select>
      </header>
      <DashboardComposer scope={preset} defaultModel={PRESETS[preset]} />
    </div>
  );
}
