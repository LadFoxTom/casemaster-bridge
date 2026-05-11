"""Seed a small set of demo rows so the WMS pages show data on first boot."""
import os, psycopg

CONN = 'postgresql://neondb_owner:npg_0Hdnv4QWxceX@ep-odd-pine-al01qppf-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

with psycopg.connect(CONN, autocommit=False) as conn:
    with conn.cursor() as cur:
        # 1 tenant
        cur.execute("""
            INSERT INTO tenant (code, name, region, deployment_type, plan, status)
            VALUES ('CASEMASTER-WMS', 'Casemaster WMS Demo', 'eu-central-1', 'MULTI_TENANT', 'STANDARD', 'ACTIVE')
            ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
        """)
        tenant_id = cur.fetchone()[0]

        # 2 partners (1 supplier, 1 customer, 1 carrier)
        partners = [
            ('SUP-ACME',    'Acme Components BV', True,  False, False, False),
            ('CUS-FOO',     'Foo Retail GmbH',    False, True,  False, False),
            ('CUS-BAR',     'Bar Distributors',   False, True,  False, False),
            ('CAR-DHL',     'DHL Express',        False, False, True,  False),
            ('CAR-UPS',     'UPS',                False, False, True,  False),
            ('OWN-DEMO',    'Demo Owner Brand',   False, False, False, True),
        ]
        cur.execute("DELETE FROM partner WHERE tenant_id = %s", (tenant_id,))
        for code, name, sup, cust, carr, owner in partners:
            cur.execute("""
                INSERT INTO partner (tenant_id, code, name, is_supplier, is_customer, is_carrier, is_3pl_owner, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'ACTIVE')
            """, (tenant_id, code, name, sup, cust, carr, owner))

        # 1 site, 1 warehouse
        cur.execute("DELETE FROM site WHERE tenant_id = %s", (tenant_id,))
        cur.execute("""
            INSERT INTO site (tenant_id, code, name, city, country_code, timezone)
            VALUES (%s, 'EHV', 'Eindhoven HQ', 'Eindhoven', 'NL', 'Europe/Amsterdam')
            RETURNING id
        """, (tenant_id,))
        site_id = cur.fetchone()[0]

        cur.execute("""
            INSERT INTO warehouse (tenant_id, site_id, code, name, warehouse_type, valuation_method)
            VALUES (%s, %s, 'EHV-01', 'Eindhoven DC',     'STANDARD', 'FIFO')
            RETURNING id
        """, (tenant_id, site_id))
        warehouse_id = cur.fetchone()[0]

        # Zones
        zones = [
            ('REC', 'Receiving',  'RECEIVING'),
            ('PUT', 'Putaway',    'PUTAWAY'),
            ('PCK', 'Pick face',  'PICK'),
            ('RES', 'Reserve',    'RESERVE'),
            ('PAK', 'Packing',    'PACK'),
            ('SHP', 'Shipping',   'SHIP'),
            ('RET', 'Returns',    'RETURNS'),
            ('QAR', 'Quarantine', 'QUARANTINE'),
        ]
        zone_ids = {}
        for code, name, ztype in zones:
            cur.execute("""
                INSERT INTO zone (tenant_id, warehouse_id, code, name, zone_type)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (warehouse_id, code) DO UPDATE SET name = EXCLUDED.name
                RETURNING id
            """, (tenant_id, warehouse_id, code, name, ztype))
            zone_ids[code] = cur.fetchone()[0]

        # Locations: 24 pick-face slots in zone PCK, 8 reserve in RES, plus dock/staging
        cur.execute("DELETE FROM location WHERE warehouse_id = %s", (warehouse_id,))
        seq = 1
        for aisle in ['A', 'B', 'C']:
            for bay in range(1, 9):
                code = f"PCK-{aisle}{bay:02d}"
                cur.execute("""
                    INSERT INTO location (tenant_id, warehouse_id, zone_id, code, barcode,
                                          bay, level, location_type, status, pick_sequence)
                    VALUES (%s, %s, %s, %s, %s, %s, '1', 'PICK_FACE', 'AVAILABLE', %s)
                """, (tenant_id, warehouse_id, zone_ids['PCK'], code, code, str(bay), seq))
                seq += 1
        for bay in range(1, 9):
            code = f"RES-{bay:02d}"
            cur.execute("""
                INSERT INTO location (tenant_id, warehouse_id, zone_id, code, barcode,
                                      bay, level, location_type, status, pick_sequence)
                VALUES (%s, %s, %s, %s, %s, %s, '1', 'PALLET_RACK', 'AVAILABLE', %s)
            """, (tenant_id, warehouse_id, zone_ids['RES'], code, code, str(bay), seq))
            seq += 1
        for code, zone in [('REC-01', 'REC'), ('REC-02', 'REC'),
                           ('PAK-01', 'PAK'), ('PAK-02', 'PAK'),
                           ('SHP-01', 'SHP'), ('RET-01', 'RET'),
                           ('QAR-01', 'QAR'), ('PUT-01', 'PUT')]:
            cur.execute("""
                INSERT INTO location (tenant_id, warehouse_id, zone_id, code, barcode,
                                      bay, level, location_type, status, pick_sequence)
                VALUES (%s, %s, %s, %s, %s, '1', '1', 'STAGE_OUT', 'AVAILABLE', %s)
            """, (tenant_id, warehouse_id, zone_ids[zone], code, code, seq))
            seq += 1

        # Item categories
        cur.execute("""
            INSERT INTO item_category (tenant_id, code, name)
            VALUES (%s, 'CONS', 'Consumer Goods')
            ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
        """, (tenant_id,))
        cat_id = cur.fetchone()[0]

        # 12 items
        cur.execute("DELETE FROM item WHERE tenant_id = %s", (tenant_id,))
        items = [
            ('SKU-001', 'Widget A',                 'Standard widget, blue',         False, False, False, 0.250),
            ('SKU-002', 'Widget B',                 'Standard widget, red',          False, False, False, 0.250),
            ('SKU-003', 'Gadget Pro',               'Premium gadget',                False, True,  False, 0.450),
            ('SKU-004', 'Gizmo X',                  'Compact gizmo',                 True,  False, False, 0.180),
            ('SKU-005', 'Tool Kit Standard',        '15-piece tool kit',             False, False, False, 1.800),
            ('SKU-006', 'Sensor Module',            'IoT sensor, lot tracked',       True,  False, True,  0.085),
            ('SKU-007', 'Cable 2m',                 'USB-C cable 2m',                False, False, False, 0.060),
            ('SKU-008', 'Battery Pack',             'Lithium-ion 5000mAh hazmat',    True,  False, True,  0.300),
            ('SKU-009', 'Display Unit',             'OLED 7" display',               False, True,  False, 0.220),
            ('SKU-010', 'Replacement Part R-12',    'Spare R-12 component',          False, False, False, 0.120),
            ('SKU-011', 'Premium Headset',          'Wireless premium headset',      False, True,  False, 0.350),
            ('SKU-012', 'Quick Charger',            'Multi-port USB charger',        False, False, False, 0.180),
        ]
        item_ids = {}
        for sku, name, desc, lot, ser, exp, w in items:
            cur.execute("""
                INSERT INTO item (tenant_id, sku, name, description, category_id,
                                  base_uom_code, is_lot_tracked, is_serial_tracked, is_expiry_tracked,
                                  weight_kg, status)
                VALUES (%s, %s, %s, %s, %s, 'EA', %s, %s, %s, %s, 'ACTIVE')
                RETURNING id
            """, (tenant_id, sku, name, desc, cat_id, lot, ser, exp, w))
            item_ids[sku] = cur.fetchone()[0]

        # Item barcodes (1 per item)
        for sku, iid in item_ids.items():
            cur.execute("""
                INSERT INTO item_barcode (tenant_id, item_id, barcode, barcode_type, uom_code, is_primary)
                VALUES (%s, %s, %s, 'GTIN13', 'EA', TRUE)
                ON CONFLICT (tenant_id, barcode) DO NOTHING
            """, (tenant_id, iid, '871234' + sku.split('-')[1].zfill(7)))

        # An app_user
        cur.execute("""
            INSERT INTO app_user (tenant_id, username, email, full_name, is_active)
            VALUES (%s, 'demo', 'demo@casemaster-wms.local', 'Demo Operator', TRUE)
            ON CONFLICT (tenant_id, username) DO NOTHING
            RETURNING id
        """, (tenant_id,))
        row = cur.fetchone()
        if row:
            user_id = row[0]
        else:
            cur.execute("SELECT id FROM app_user WHERE tenant_id=%s AND username='demo'", (tenant_id,))
            user_id = cur.fetchone()[0]

        # 2 license plates
        cur.execute("""
            INSERT INTO license_plate (tenant_id, warehouse_id, lpn_number, lpn_type, status, created_by_user_id)
            VALUES (%s, %s, 'LPN-1000001', 'PALLET', 'STORED',  %s),
                   (%s, %s, 'LPN-1000002', 'CASE',   'BUILDING', %s)
            ON CONFLICT (tenant_id, lpn_number) DO NOTHING
        """, (tenant_id, warehouse_id, user_id, tenant_id, warehouse_id, user_id))

        # 1 PO + lines
        cur.execute("""
            INSERT INTO purchase_order (tenant_id, warehouse_id, supplier_id, po_number, expected_date, status, currency)
            VALUES (%s, %s, (SELECT id FROM partner WHERE tenant_id=%s AND code='SUP-ACME'),
                    'PO-2026-0001', CURRENT_DATE + 7, 'OPEN', 'EUR')
            RETURNING id
        """, (tenant_id, warehouse_id, tenant_id))
        po_id = cur.fetchone()[0]
        for ln, sku, qty in [(1, 'SKU-001', 100), (2, 'SKU-002', 60), (3, 'SKU-005', 24)]:
            cur.execute("""
                INSERT INTO purchase_order_line (tenant_id, purchase_order_id, line_number, item_id,
                                                 expected_qty, uom_code, unit_cost, status)
                VALUES (%s, %s, %s, %s, %s, 'EA', 12.50, 'OPEN')
            """, (tenant_id, po_id, ln, item_ids[sku], qty))

        # 1 ASN against this PO
        cur.execute("""
            INSERT INTO asn (tenant_id, warehouse_id, asn_number, supplier_id, expected_arrival, status)
            VALUES (%s, %s, 'ASN-2026-0001',
                    (SELECT id FROM partner WHERE tenant_id=%s AND code='SUP-ACME'),
                    NOW() + INTERVAL '2 days', 'CONFIRMED')
            RETURNING id
        """, (tenant_id, warehouse_id, tenant_id))
        asn_id = cur.fetchone()[0]
        for ln, sku, qty in [(1, 'SKU-001', 100), (2, 'SKU-002', 60), (3, 'SKU-005', 24)]:
            cur.execute("""
                INSERT INTO asn_line (tenant_id, asn_id, line_number, item_id, expected_qty, uom_code)
                VALUES (%s, %s, %s, %s, %s, 'EA')
            """, (tenant_id, asn_id, ln, item_ids[sku], qty))

        # 1 sales order
        cur.execute("""
            INSERT INTO sales_order (tenant_id, warehouse_id, customer_id, order_number, order_date,
                                     required_ship_date, priority, status, currency)
            VALUES (%s, %s, (SELECT id FROM partner WHERE tenant_id=%s AND code='CUS-FOO'),
                    'SO-2026-0001', CURRENT_DATE, CURRENT_DATE + 1, 50, 'IMPORTED', 'EUR')
            RETURNING id
        """, (tenant_id, warehouse_id, tenant_id))
        so_id = cur.fetchone()[0]
        for ln, sku, qty in [(1, 'SKU-001', 5), (2, 'SKU-007', 10), (3, 'SKU-009', 1)]:
            cur.execute("""
                INSERT INTO sales_order_line (tenant_id, sales_order_id, line_number, item_id,
                                              qty_ordered, uom_code, unit_price, status)
                VALUES (%s, %s, %s, %s, %s, 'EA', 19.99, 'OPEN')
            """, (tenant_id, so_id, ln, item_ids[sku], qty))

        # Some inventory: SKU-001 in PCK-A01, SKU-002 in PCK-A02, etc.
        cur.execute("DELETE FROM inventory WHERE tenant_id = %s", (tenant_id,))
        seed_inv = [
            ('SKU-001', 'PCK-A01', 80),
            ('SKU-002', 'PCK-A02', 50),
            ('SKU-003', 'PCK-A03', 30),
            ('SKU-004', 'PCK-A04', 25),
            ('SKU-005', 'PCK-A05', 15),
            ('SKU-006', 'PCK-A06', 200),
            ('SKU-007', 'PCK-A07', 120),
            ('SKU-008', 'PCK-A08', 18),
            ('SKU-009', 'PCK-B01', 22),
            ('SKU-010', 'PCK-B02', 90),
            ('SKU-011', 'PCK-B03', 12),
            ('SKU-012', 'PCK-B04', 64),
        ]
        for sku, loc, qty in seed_inv:
            cur.execute("""
                INSERT INTO inventory (tenant_id, warehouse_id, location_id, item_id,
                                       qty_on_hand, qty_reserved, qty_on_hold, qty_in_transit,
                                       quality_status, uom_code, last_movement_at)
                VALUES (%s, %s, (SELECT id FROM location WHERE warehouse_id=%s AND code=%s),
                        %s, %s, 0, 0, 0, 'AVAILABLE', 'EA', NOW())
            """, (tenant_id, warehouse_id, warehouse_id, loc, item_ids[sku], qty))

        # 1 shipment placeholder linked to the sales order
        cur.execute("""
            INSERT INTO shipment (tenant_id, warehouse_id, shipment_number, sales_order_id,
                                  carrier_id, planned_ship_date, status)
            VALUES (%s, %s, 'SHP-2026-0001', %s,
                    (SELECT id FROM partner WHERE tenant_id=%s AND code='CAR-DHL'),
                    CURRENT_DATE + 1, 'PLANNED')
            ON CONFLICT (tenant_id, shipment_number) DO NOTHING
        """, (tenant_id, warehouse_id, so_id, tenant_id))

    conn.commit()
    print("Seeded demo data — tenant:", tenant_id, "warehouse:", warehouse_id)
