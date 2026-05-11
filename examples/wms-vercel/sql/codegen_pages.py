"""Code-generate one Casemaster page per WMS table at page/wms/<table>.cms.

Pattern follows page/axylog/cmTest.cms — inherits 'base', iterator.ofEntity
over the matching wms/<table> BO, renders <@page/data/table>.
"""
import os, re

SCHEMA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wms_schema.sql')
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'page', 'wms')

os.makedirs(OUT_DIR, exist_ok=True)

with open(SCHEMA, 'r', encoding='utf-8') as f:
    sql = f.read()

table_re = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s*\(",
    re.IGNORECASE,
)

def humanise(name: str) -> str:
    return name.replace('_', ' ').strip()

# Default order column heuristic: id DESC for transactional, code/sku/name asc otherwise
ORDER_OVERRIDES = {
    'inventory_journal': '-journal_timestamp',
    'audit_log': '-occurred_at',
    'license_plate_event': '-event_at',
    'serial_event': '-event_at',
    'yard_event': '-event_at',
    'equipment_event': '-occurred_at',
    'message_log': '-received_at',
    'alert_event': '-triggered_at',
    'webhook_delivery': '-next_attempt_at',
    'idempotency_record': '-created_at',
    'device_sync_log': '-started_at',
    'labor_activity': '-started_at',
    'labor_clock': '-clock_in_at',
    'kpi_snapshot': '-period_start',
    'forecast_run': '-started_at',
    'anomaly_event': '-detected_at',
    'inspection': '-started_at',
    'inspection_result': '-recorded_at',
    'load_event': '-event_at',
    'rate_quote': '-quoted_at',
    'shipping_document': '-rendered_at',
    'putaway_task': '-priority',
    'count_task': '-counted_at',
    'pick_path_segment': '-arrived_at',
    'storage_billing_snapshot': '-snapshot_date',
    'billing_event': '-event_at',
    'bill_run': '-generated_at',
    'lot': '-received_date',
    'inventory_adjustment': '-created_at',
    'inventory_reservation': '-created_at',
    'inventory_hold': '-placed_at',
    'workflow_instance': '-started_at',
    'workflow_task': '-due_at',
}

PAGE_TEMPLATE = """// Generated from sql/wms_schema.sql by codegen_pages.py.
// List view over the wms/{table} BO.

inherits 'base'

function main()
    set('rows',
        iterator.ofEntity(
            entities: <
                <@iterator/entity
                    name:    'r',
                    entity:  'wms/{table}',
                    orderBy: '{order}'
                >
            >,
            rows: 500
        )
    )
    set('main', page.get('./main'))
    page.render(page.get('./main'))
end-function

protected resource main
    <@page/container
        content: <@page/content
            title: <@page/title label: '{title}'>,
            crumbs: <@page/html `<p><a href="../wms" class="btn btn-sm btn-outline-secondary">&larr; WMS dashboard</a></p>`>,
            count: <@page/html
                resolveTemplate(
                    `<p class="text-muted">{{{{iterator.count([rows])}}}} row(s) in <code>{table}</code>.</p>`
                )
            >,
            table: <@page/data/table
                iterator: [rows],
                group:    'list',
                pagingMode: pagingMode.None
            >
        >
    >
end-resource
"""

count = 0
for m in table_re.finditer(sql):
    table = m.group(1)
    order = ORDER_OVERRIDES.get(table)
    if order is None:
        order = '-id' if any(k in table for k in ['_event','_log','_journal','_session','_run','_snapshot']) else 'id'
    title = humanise(table).title()
    src = PAGE_TEMPLATE.format(table=table, order=order, title=title)
    path = os.path.join(OUT_DIR, f"{table}.cms")
    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    count += 1

print(f"Wrote {count} list-page files to {OUT_DIR}")
