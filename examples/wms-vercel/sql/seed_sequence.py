"""Seed the framework `sequence` table so Casemaster bo.persist can INSERT.

For every WMS table with a single `id` BIGSERIAL primary key, create a row in
`sequence` with `next` = (max(id) + 1). The runtime will use that value when
persisting new rows. Re-running this script is safe — it ON CONFLICT updates.

Also bumps the Postgres BIGSERIAL `<table>_id_seq` past 10_000_000 so that any
external code that *does* rely on BIGSERIAL (e.g. our seed_demo.py / psql)
won't ever collide with values Casemaster hands out from `sequence.next`.
"""

import os, re, psycopg

CONN = 'postgresql://neondb_owner:npg_0Hdnv4QWxceX@ep-odd-pine-al01qppf-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

# Discover tables with an id PK by parsing the schema file (single source of truth).
SCHEMA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wms_schema.sql')
with open(SCHEMA, 'r', encoding='utf-8') as f:
    sql = f.read()

# Match any "CREATE TABLE [IF NOT EXISTS] X (\n    id BIGSERIAL PRIMARY KEY"
table_re = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s*\(\s*([^;]+?)\)\s*;",
    re.IGNORECASE | re.DOTALL,
)

tables = []
for m in table_re.finditer(sql):
    table = m.group(1)
    body = m.group(2)
    # consider only tables whose first column is `id BIGSERIAL PRIMARY KEY`
    if re.search(r"\bid\s+BIGSERIAL\s+PRIMARY\s+KEY", body, re.IGNORECASE):
        tables.append(table)

with psycopg.connect(CONN, autocommit=False) as conn:
    with conn.cursor() as cur:
        # Ensure the sequence table exists (idempotent — also lives in schema)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sequence (
                id VARCHAR(75) PRIMARY KEY,
                next BIGINT NOT NULL
            )
        """)

        for t in tables:
            cur.execute(f'SELECT COALESCE(MAX(id), 0) + 1 FROM "{t}"')
            next_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO sequence (id, next) VALUES (%s, %s) "
                "ON CONFLICT (id) DO UPDATE SET next = GREATEST(sequence.next, EXCLUDED.next)",
                (t, next_id),
            )
            # Push the Postgres BIGSERIAL forward so it can never collide with
            # values Casemaster hands out from sequence.next.
            seq_name = f"{t}_id_seq"
            cur.execute("SELECT setval(%s, 10000000)", (seq_name,))

    conn.commit()
    print(f"Seeded {len(tables)} sequence rows; advanced Postgres BIGSERIAL to 10_000_000.")
