import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSchema, useLive } from '../hooks/queries';
import { DataTable } from '../components/table/DataTable';
import { Button } from '../components/ui/primitives';
import { Icon } from '../components/ui/icon';

export function ListPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { data: schema } = useSchema();
  // /:bo  →  bo === <param>; /wms/inventory  →  reconstruct from splat
  const bo = (params['*'] || params.bo) as string;
  if (!schema) return null;
  const meta = schema.bos.find((b) => b.name === bo);
  if (!meta) return <div className="text-sm text-danger">Unknown BO: {bo}</div>;

  // Subscribe to live updates if the backend supports SSE.
  useLive(bo, schema.capabilities.sse);

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">{meta.label || meta.name}</h1>
          <p className="text-sm text-muted">
            <code className="text-xs">{meta.name}</code> · table <code className="text-xs">{meta.table}</code>
          </p>
        </div>
        <div className="flex gap-2">
          <a className="btn btn-ghost text-muted" href={`/page/${meta.name}`} target="_blank" rel="noreferrer" title="Open the same page in classic HTML">
            <Icon name="zap" size={14} /> Classic HTML
          </a>
          <Button variant="primary" onClick={() => navigate(`/${bo}/new`)}>
            <Icon name="plus" size={14} /> New
          </Button>
        </div>
      </header>
      <DataTable bo={bo} schema={schema} />
    </div>
  );
}
