"""Code-generate Casemaster BO (.cms) files for every WMS table.

Reads:   sql/wms_schema.sql  (sibling)
Writes:  bo/wms/<table>.cms

Mapping rules:
- BIGSERIAL/BIGINT   -> dataType.Long, length: 18
- INTEGER            -> dataType.Long, length: 9
- NUMERIC(p,s)       -> dataType.Decimal, length: p, precision: s
- BOOLEAN            -> dataType.Boolean
- DATE               -> dataType.Date
- TIME               -> dataType.Time
- TIMESTAMPTZ        -> dataType.DateTime
- TEXT / CITEXT      -> dataType.String, length: 4000
- VARCHAR(n)/CHAR(n) -> dataType.String, length: n
- JSONB / BYTEA      -> dataType.String, length: 4000 (treated as memo)
- INET               -> dataType.String, length: 50
- UUID               -> dataType.String, length: 36
- TEXT[] / *[]       -> dataType.String, length: 4000 (rendered as text)

REFERENCES <table>(id) -> foreignKey: 'wms/<table>'

Junction / composite-PK tables (role_permission, user_role) are emitted with
a single-column primaryKey on the first FK; full composite-key edits aren't
attempted from the BO layer.
"""

import os, re, sys

SCHEMA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wms_schema.sql')
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'bo', 'wms')

os.makedirs(OUT_DIR, exist_ok=True)

with open(SCHEMA, 'r', encoding='utf-8') as f:
    sql = f.read()

# Find every CREATE TABLE block
table_re = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s*\((.*?)\);",
    re.IGNORECASE | re.DOTALL,
)

def parse_columns(body: str):
    """Yield (col_name, raw_type_text, references_table_or_None) for each column.
    Skips composite UNIQUE / CONSTRAINT / PRIMARY KEY clauses.
    """
    # Strip line comments
    body = re.sub(r"--.*?$", "", body, flags=re.MULTILINE)
    # Split on commas at paren depth 0
    parts, depth, buf = [], 0, []
    for ch in body:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(''.join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    if buf:
        parts.append(''.join(buf).strip())

    skip_starts = ('UNIQUE', 'PRIMARY KEY', 'CONSTRAINT', 'CHECK', 'FOREIGN KEY', 'EXCLUDE')
    cols = []
    for p in parts:
        ps = p.strip()
        if not ps:
            continue
        if any(ps.upper().startswith(s) for s in skip_starts):
            continue
        # Split into name + rest
        m = re.match(r"([a-z_][a-z0-9_]*)\s+(.+)$", ps, re.IGNORECASE | re.DOTALL)
        if not m:
            continue
        name = m.group(1)
        rest = m.group(2)
        # Find REFERENCES <table>
        ref = None
        m2 = re.search(r"REFERENCES\s+([a-z_][a-z0-9_]*)\s*\(", rest, re.IGNORECASE)
        if m2:
            ref = m2.group(1)
        cols.append((name, rest, ref))
    return cols


def map_type(raw: str):
    raw_u = raw.upper()
    # numeric(p,s)
    m = re.match(r"\s*NUMERIC\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)", raw, re.IGNORECASE)
    if m:
        return ('Decimal', int(m.group(1)), int(m.group(2)))
    if re.match(r"\s*NUMERIC\b", raw, re.IGNORECASE):
        return ('Decimal', 18, 6)
    # varchar(n) / char(n)
    m = re.match(r"\s*(?:VAR)?CHAR\s*\(\s*(\d+)\s*\)", raw, re.IGNORECASE)
    if m:
        return ('String', int(m.group(1)), None)
    if raw_u.startswith('BIGSERIAL') or raw_u.startswith('BIGINT'):
        return ('Long', 18, None)
    if raw_u.startswith('SERIAL') or raw_u.startswith('INTEGER') or raw_u.startswith('INT'):
        return ('Long', 9, None)
    if raw_u.startswith('SMALLINT'):
        return ('Long', 5, None)
    if raw_u.startswith('BOOLEAN'):
        return ('Boolean', None, None)
    if raw_u.startswith('TIMESTAMPTZ') or raw_u.startswith('TIMESTAMP'):
        return ('Timestamp', None, None)
    if raw_u.startswith('DATE'):
        return ('Date', None, None)
    if raw_u.startswith('TIME'):
        return ('Time', None, None)
    if raw_u.startswith('JSONB') or raw_u.startswith('JSON'):
        return ('JSON', 4000, None)
    if raw_u.startswith('BYTEA'):
        return ('String', 4000, None)
    if raw_u.startswith('INET'):
        return ('String', 50, None)
    if raw_u.startswith('UUID'):
        return ('String', 36, None)
    if raw_u.startswith('CITEXT') or raw_u.startswith('TEXT'):
        return ('String', 4000, None)
    # array types like TEXT[]
    if '[]' in raw:
        return ('String', 4000, None)
    # default
    return ('String', 255, None)


def is_optional(raw: str) -> bool:
    return 'NOT NULL' not in raw.upper()


def humanise(name: str) -> str:
    return name.replace('_', ' ').strip().capitalize()


# Heuristic for "label" attribute: prefer name/code/sku/barcode/title columns
LABEL_PREFERENCES = ['name', 'full_name', 'code', 'sku', 'barcode', 'lpn_number', 'lot_number',
                     'asn_number', 'po_number', 'order_number', 'rma_number', 'wave_number',
                     'task_number', 'shipment_number', 'manifest_number', 'receipt_number',
                     'serial_number', 'inspection_number', 'ncr_number', 'recall_number',
                     'tracking_number', 'session_number', 'adjustment_number', 'cart_number',
                     'work_order_number', 'appointment_number', 'trailer_number',
                     'contract_number', 'invoice_number', 'rule_code', 'plan_code',
                     'workflow_code', 'kpi_code', 'report_code', 'screen_code',
                     'service_code', 'function_code', 'charge_code', 'activity_code',
                     'event_type', 'message_type', 'username', 'description', 'title']


def build_bo(table: str, cols):
    # Single-column FK targets
    attr_lines = []
    list_cols, label_col, search_cols = [], None, []
    has_id_pk = any(c[0] == 'id' for c in cols)
    pk = 'id' if has_id_pk else cols[0][0]

    for name, rest, ref in cols:
        cm_type, length, precision = map_type(rest)
        opt = 'true()' if is_optional(rest) else 'false()'
        # Compose attribute line
        parts = [f"label: '{humanise(name)}'", f"column: '{name}'", f"dataType: dataType.{cm_type}"]
        if length is not None:
            parts.append(f"length: {length}")
        if precision is not None:
            parts.append(f"precision: {precision}")
        if name == pk and has_id_pk:
            parts.append("locked: true()")
            parts.append("optional: false()")
        else:
            parts.append(f"optional: {opt}")
        if ref is not None and name != pk:
            parts.append(f"foreignKey: 'wms/{ref}'")
        attr_line = "            " + name + ": <@bo/attribute " + ", ".join(parts) + ">"
        attr_lines.append(attr_line)
        # Pick label column
        if label_col is None and name in LABEL_PREFERENCES and cm_type == 'String':
            label_col = name
        # List columns: skip very long text fields and *_at timestamps for compactness
        if cm_type in ('String', 'Long', 'Decimal', 'Date', 'Boolean', 'Timestamp') and not name.endswith('_at'):
            if len(list_cols) < 6 and name != 'id':
                list_cols.append(name)
        # Search candidates: code-like and name-like text fields
        if cm_type == 'String' and any(name.endswith(suf) for suf in ('_code','_number','_name','code','name','sku','barcode')):
            if len(search_cols) < 4:
                search_cols.append(name)

    if label_col is None:
        # Fall back to first non-pk string-ish column
        for name, rest, ref in cols:
            if name == pk:
                continue
            cm_type, _, _ = map_type(rest)
            if cm_type == 'String':
                label_col = name
                break
    if label_col is None and cols:
        label_col = cols[0][0]

    if not list_cols:
        list_cols = [c[0] for c in cols[:5] if c[0] != pk]

    label_block = f"            label: < '{label_col}' >" if label_col else ""
    list_block = "            list: < " + ", ".join(f"'{c}'" for c in list_cols) + " >"
    desc_cols = [c[0] for c in cols if c[0] != pk][:12]
    desc_block = "            description: < " + ", ".join(f"'{c}'" for c in desc_cols) + " >"
    search_block = ("            search: < " + ", ".join(f"'{c}'" for c in search_cols) + " >") if search_cols else ""

    groups = [b for b in [label_block, list_block, desc_block, search_block] if b]
    groups_text = ",\n".join(groups)

    # `sequence:` is required for the runtime's bo.create + bo.persist to
    # actually INSERT new rows. Without it, inserts silently no-op (documented
    # in Axylog's script/axylog/sync.cms comments). PostgreSQL BIGSERIAL
    # implicitly creates a sequence named `<table>_<column>_seq`; we emit that.
    # `sequence:` names a row in the framework `sequence` table (id, next).
    # On bo.persist of a new row the runtime reads that row's `next`, uses it
    # as the new id, and increments. Without it, INSERTs silently no-op.
    sequence_line = f"        sequence: '{table}',\n" if has_id_pk else ""

    src = f"""// Generated from sql/wms_schema.sql by codegen_bos.py.
// Maps the `{table}` table to a Casemaster Business Object so pages can
// iterator.ofEntity / bo.quickLoad against it.

function main()
    return script.get('./main')
end-function

resource main
    <@bo
        label: '{humanise(table)}',
        table: '{table}',
        primaryKey: '{pk}',
{sequence_line}        deleteRule: deleteRule.Allowed,
        auditable: auditing.None,
        attributes: <
{",\n".join(attr_lines)}
        >,
        attributeGroups: <
{groups_text}
        >
    >
end-resource
"""
    return src


count = 0
for m in table_re.finditer(sql):
    table = m.group(1)
    body = m.group(2)
    cols = parse_columns(body)
    if not cols:
        continue
    src = build_bo(table, cols)
    path = os.path.join(OUT_DIR, f"{table}.cms")
    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    count += 1

print(f"Wrote {count} BO files to {OUT_DIR}")
