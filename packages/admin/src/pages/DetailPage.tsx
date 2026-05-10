import { useNavigate, useParams } from 'react-router-dom';
import { useBoDelete, useBoGet, useSchema } from '../hooks/queries';
import { BoForm } from '../components/form/BoForm';
import { Button, Skeleton } from '../components/ui/primitives';
import { Icon } from '../components/ui/icon';

export function DetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { data: schema } = useSchema();
  // route shape: /:bo/:id  with bo possibly multi-segment (handled by App)
  const bo = (params.bo ?? '') as string;
  const id = params.id as string;
  const isNew = id === 'new';

  const get = useBoGet(bo, isNew ? null : id);
  const del = useBoDelete(bo);

  if (!schema) return null;
  const meta = schema.bos.find((b) => b.name === bo);
  if (!meta) return <div className="text-sm text-danger">Unknown BO: {bo}</div>;

  if (!isNew && get.isLoading) return <div className="space-y-2 max-w-3xl">{Array.from({length:8}).map((_,i)=>(<Skeleton key={i} className="h-8" />))}</div>;
  if (!isNew && get.isError) return <div className="text-sm text-danger">{String(get.error)}</div>;

  const initialValue = isNew ? null : get.data?.row ?? null;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {isNew ? `New ${meta.label}` : `${meta.label} #${id}`}
          </h1>
          <p className="text-sm text-muted">{meta.name}</p>
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <Button variant="danger" onClick={async () => {
              if (!confirm(`Delete ${meta.label} #${id}?`)) return;
              await del.mutateAsync(id);
              navigate(`/${bo}`);
            }}>
              <Icon name="trash" size={14} /> Delete
            </Button>
          )}
          <Button onClick={() => navigate(`/${bo}`)}>Cancel</Button>
        </div>
      </header>

      <BoForm
        bo={bo}
        schema={schema}
        initialValue={initialValue}
        onSaved={(row) => navigate(`/${bo}/${row.id}`)}
        onCancel={() => navigate(`/${bo}`)}
      />
    </div>
  );
}
