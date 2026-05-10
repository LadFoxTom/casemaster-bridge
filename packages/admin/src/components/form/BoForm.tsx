/**
 * Schema-driven BO form: react-hook-form + a zod resolver derived from the
 * BO descriptor. Saves go through useBoSave (optimistic; sonner toasts).
 *
 * Roadmap §T11 — defaults render every shape; per-page React overrides
 * escape hatch.
 */

import { useEffect, useMemo } from 'react';
import { useForm, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Field, Input, Select, Textarea } from '../ui/primitives';
import { Icon } from '../ui/icon';
import type { BoAttr, SchemaResponse, BoRow } from '@casemaster/api-spec';
import { FkSelect } from './FkSelect';
import { useBoSave } from '../../hooks/queries';

interface Props {
  bo: string;
  schema: SchemaResponse;
  initialValue?: BoRow | null;
  onSaved?: (row: BoRow) => void;
  onCancel?: () => void;
}

export function BoForm({ bo, schema, initialValue, onSaved, onCancel }: Props) {
  const meta = schema.bos.find((b) => b.name === bo);
  if (!meta) return <div className="text-sm text-danger">Unknown BO {bo}</div>;

  const groups = useMemo(() => groupAttributes(meta), [meta]);
  const zodSchema = useMemo(() => zodFromMeta(meta), [meta]);
  const save = useBoSave(bo);

  const form = useForm<FieldValues>({
    resolver: zodResolver(zodSchema),
    defaultValues: initialValue ?? {},
  });

  useEffect(() => {
    if (initialValue) form.reset(initialValue);
  }, [initialValue, form]);

  const onSubmit = form.handleSubmit(async (data) => {
    const r = await save.mutateAsync(stripEmpty(data) as BoRow);
    onSaved?.(r.row);
  });

  return (
    <form className="bg-surface border border-border rounded-lg p-5 space-y-5" onSubmit={onSubmit}>
      {groups.map(({ label, attrs }) => (
        <fieldset key={label} className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</legend>
          <div className="grid md:grid-cols-2 gap-3">
            {attrs.map((a) => (
              <FieldInput key={a.name} attr={a} schema={schema} form={form} />
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        {onCancel && <Button type="button" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" disabled={save.isPending}>
          <Icon name="check" /> {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

function FieldInput({ attr, schema, form }: { attr: BoAttr; schema: SchemaResponse; form: ReturnType<typeof useForm> }) {
  const id = `f-${attr.name}`;
  const error = form.formState.errors[attr.name]?.message as string | undefined;

  if (attr.fk) {
    return (
      <Field label={attr.label} error={error}>
        <FkSelect target={schema.bos.find((b) => b.name === attr.fk)} {...form.register(attr.name)} value={form.watch(attr.name) ?? ''} onChange={(v) => form.setValue(attr.name, v, { shouldDirty: true })} />
      </Field>
    );
  }
  if (attr.enumValues?.length) {
    return (
      <Field label={attr.label} error={error}>
        <Select id={id} {...form.register(attr.name)}>
          <option value="">—</option>
          {attr.enumValues.map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>
      </Field>
    );
  }
  if (attr.type === 'boolean') {
    return (
      <Field label={attr.label} error={error}>
        <input type="checkbox" id={id} {...form.register(attr.name)} className="h-4 w-4 mt-1.5" />
      </Field>
    );
  }
  if (attr.type === 'date' || attr.type === 'timestamp') {
    return (
      <Field label={attr.label} error={error}>
        <Input id={id} type={attr.type === 'date' ? 'date' : 'datetime-local'} {...form.register(attr.name)} />
      </Field>
    );
  }
  if (attr.type === 'long' || attr.type === 'decimal') {
    return (
      <Field label={attr.label} error={error}>
        <Input id={id} type="number" step={attr.type === 'decimal' ? 'any' : '1'} disabled={attr.readOnly} className="font-mono"
               {...form.register(attr.name, { valueAsNumber: true })} />
      </Field>
    );
  }
  if (attr.length && attr.length > 200) {
    return (
      <Field label={attr.label} error={error} className="md:col-span-2">
        <Textarea id={id} rows={3} {...form.register(attr.name)} />
      </Field>
    );
  }
  return (
    <Field label={attr.label} error={error}>
      <Input id={id} disabled={attr.readOnly} {...form.register(attr.name)} />
    </Field>
  );
}

function groupAttributes(meta: SchemaResponse['bos'][number]) {
  const grouped: Array<{ label: string; attrs: BoAttr[] }> = [];
  const used = new Set<string>();
  if (meta.groups['description']?.length) {
    const attrs = meta.groups['description'].map((n) => meta.attributes.find((a) => a.name === n)).filter(Boolean) as BoAttr[];
    grouped.push({ label: 'Details', attrs });
    meta.groups['description'].forEach((n) => used.add(n));
  }
  const rest = meta.attributes.filter((a) => !used.has(a.name) && !(a.readOnly && a.name === 'id'));
  if (rest.length) grouped.push({ label: grouped.length ? 'Other' : 'Details', attrs: rest });
  return grouped;
}

function zodFromMeta(meta: SchemaResponse['bos'][number]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const a of meta.attributes) {
    let s: z.ZodTypeAny;
    switch (a.type) {
      case 'long':
      case 'decimal':  s = z.coerce.number(); break;
      case 'boolean':  s = z.boolean(); break;
      case 'date':
      case 'timestamp': s = z.string(); break;
      default:         s = z.string();
    }
    if (!a.required) s = s.optional().or(z.literal('').transform(() => undefined));
    shape[a.name] = s;
  }
  return z.object(shape).passthrough();
}

function stripEmpty(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === '' || v == null) continue;
    out[k] = v;
  }
  return out;
}
