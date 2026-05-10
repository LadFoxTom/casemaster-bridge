/**
 * Foreign-key combobox. Fetches the target BO list and renders a native
 * <select>. Real shadcn projects often replace this with Radix Combobox
 * + cmdk for a typeahead — that's a per-app override.
 */

import { forwardRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Select } from '../ui/primitives';
import type { Bo } from '@casemaster/api-spec';
import { fkLabel } from '../../lib/format';

interface Props {
  target: Bo | undefined;
  value: string | number | undefined;
  onChange: (v: number | null) => void;
  id?: string;
}

export const FkSelect = forwardRef<HTMLSelectElement, Props>(({ target, value, onChange, id }, ref) => {
  const { data } = useQuery({
    queryKey: ['fk', target?.name ?? '__none'],
    enabled:  !!target,
    queryFn:  () => api.boList(target!.name, { pageSize: 200 }),
    staleTime: 1000 * 60 * 5,
  });
  if (!target) return <Select disabled><option>—</option></Select>;
  return (
    <Select
      ref={ref}
      id={id}
      value={String(value ?? '')}
      onChange={(e) => {
        const v = e.currentTarget.value;
        onChange(v === '' ? null : Number(v));
      }}
    >
      <option value="">—</option>
      {(data?.rows ?? []).map((row) => (
        <option key={String(row.id)} value={String(row.id)}>{fkLabel(target, row) ?? `#${String(row.id)}`}</option>
      ))}
    </Select>
  );
});
FkSelect.displayName = 'FkSelect';
