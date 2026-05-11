-- ============================================================================
-- Casemaster-WMS schema  (PostgreSQL 17 / Neon)
-- ============================================================================
-- Generated from C:\Casemaster-WMS\WMS_specification.md.
-- Tables are emitted in dependency order; cross-cutting forward references
-- that the spec leaves as bare BIGINT (not declared FKs) are kept as bare
-- BIGINT here too so the file is re-runnable as a single transaction.
-- Partitioning clauses from the spec are dropped (audit_log, kpi_snapshot,
-- message_log, webhook_delivery): they require per-partition DDL that is
-- premature for this build; the columns and indexes stay so the partitioning
-- can be retro-fitted later without breaking the schema.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- Tenants, partners, sites, geometry
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant (
    id BIGSERIAL PRIMARY KEY,
    code CITEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    region TEXT,
    deployment_type TEXT,             -- MULTI_TENANT, SINGLE_TENANT, ON_PREM, EDGE
    shard_id INTEGER,
    data_residency TEXT,
    plan TEXT,
    default_timezone TEXT NOT NULL DEFAULT 'UTC',
    default_currency CHAR(3) NOT NULL DEFAULT 'EUR',
    default_weight_unit TEXT NOT NULL DEFAULT 'kg',
    default_volume_unit TEXT NOT NULL DEFAULT 'm3',
    default_language CHAR(2) NOT NULL DEFAULT 'en',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    legal_name TEXT,
    is_supplier BOOLEAN NOT NULL DEFAULT FALSE,
    is_customer BOOLEAN NOT NULL DEFAULT FALSE,
    is_carrier BOOLEAN NOT NULL DEFAULT FALSE,
    is_3pl_owner BOOLEAN NOT NULL DEFAULT FALSE,
    tax_id TEXT,
    vat_number TEXT,
    duns_number TEXT,
    eori_number TEXT,
    payment_terms TEXT,
    default_currency CHAR(3),
    credit_limit NUMERIC(18,2),
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS partner_address (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    partner_id BIGINT NOT NULL REFERENCES partner(id),
    address_type TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    contact_name TEXT,
    company_name TEXT,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    region TEXT,
    postal_code TEXT,
    country_code CHAR(2) NOT NULL,
    phone TEXT,
    email TEXT,
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6)
);
CREATE INDEX IF NOT EXISTS idx_partner_address_partner ON partner_address(partner_id);

CREATE TABLE IF NOT EXISTS carrier_service (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    carrier_id BIGINT NOT NULL REFERENCES partner(id),
    service_code CITEXT NOT NULL,
    service_name TEXT NOT NULL,
    transit_days INTEGER,
    cutoff_time TIME,
    supports_cod BOOLEAN NOT NULL DEFAULT FALSE,
    supports_dangerous_goods BOOLEAN NOT NULL DEFAULT FALSE,
    label_format TEXT,
    UNIQUE (carrier_id, service_code)
);

CREATE TABLE IF NOT EXISTS site (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenant(id),
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    region TEXT,
    postal_code TEXT,
    country_code CHAR(2),
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    timezone TEXT NOT NULL,
    contact_phone TEXT,
    contact_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS warehouse (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenant(id),
    site_id BIGINT NOT NULL REFERENCES site(id),
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    warehouse_type TEXT NOT NULL DEFAULT 'STANDARD',
    valuation_method TEXT NOT NULL DEFAULT 'FIFO',
    operating_hours JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_warehouse_tenant_active ON warehouse(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS zone (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    zone_type TEXT NOT NULL,
    temperature_class TEXT,
    is_hazmat BOOLEAN NOT NULL DEFAULT FALSE,
    is_secure BOOLEAN NOT NULL DEFAULT FALSE,
    pick_velocity_class TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS aisle (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    zone_id BIGINT NOT NULL REFERENCES zone(id),
    code CITEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    travel_direction TEXT,
    UNIQUE (zone_id, code)
);

CREATE TABLE IF NOT EXISTS location (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    zone_id BIGINT NOT NULL REFERENCES zone(id),
    aisle_id BIGINT REFERENCES aisle(id),
    code CITEXT NOT NULL,
    barcode CITEXT NOT NULL,
    bay TEXT,
    level TEXT,
    position TEXT,
    location_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
    length_cm NUMERIC(10,2),
    width_cm NUMERIC(10,2),
    height_cm NUMERIC(10,2),
    max_weight_kg NUMERIC(10,3),
    max_volume_l NUMERIC(10,2),
    allow_mixed_sku BOOLEAN NOT NULL DEFAULT TRUE,
    allow_mixed_lot BOOLEAN NOT NULL DEFAULT TRUE,
    pick_sequence INTEGER,
    travel_x NUMERIC(10,2),
    travel_y NUMERIC(10,2),
    travel_z NUMERIC(10,2),
    abc_class CHAR(1),
    velocity_score NUMERIC(8,4),
    last_count_at TIMESTAMPTZ,
    last_movement_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (warehouse_id, code),
    UNIQUE (warehouse_id, barcode)
);
CREATE INDEX IF NOT EXISTS idx_location_zone_status ON location(zone_id, status);
CREATE INDEX IF NOT EXISTS idx_location_pick_sequence ON location(warehouse_id, pick_sequence);

-- ============================================================================
-- Items, UoM, kits
-- ============================================================================

CREATE TABLE IF NOT EXISTS item_category (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    parent_category_id BIGINT REFERENCES item_category(id),
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS item (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    sku CITEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    long_description TEXT,
    category_id BIGINT REFERENCES item_category(id),
    brand TEXT,
    manufacturer TEXT,
    manufacturer_part_number TEXT,
    base_uom_code TEXT NOT NULL DEFAULT 'EA',
    is_lot_tracked BOOLEAN NOT NULL DEFAULT FALSE,
    is_serial_tracked BOOLEAN NOT NULL DEFAULT FALSE,
    is_expiry_tracked BOOLEAN NOT NULL DEFAULT FALSE,
    shelf_life_days INTEGER,
    is_hazmat BOOLEAN NOT NULL DEFAULT FALSE,
    hazmat_class TEXT,
    un_number TEXT,
    is_perishable BOOLEAN NOT NULL DEFAULT FALSE,
    is_controlled BOOLEAN NOT NULL DEFAULT FALSE,
    is_fragile BOOLEAN NOT NULL DEFAULT FALSE,
    is_kit BOOLEAN NOT NULL DEFAULT FALSE,
    is_serialized_outbound BOOLEAN NOT NULL DEFAULT FALSE,
    requires_inspection_in BOOLEAN NOT NULL DEFAULT FALSE,
    requires_inspection_out BOOLEAN NOT NULL DEFAULT FALSE,
    rotation_method TEXT NOT NULL DEFAULT 'FIFO',
    abc_class CHAR(1),
    velocity_score NUMERIC(8,4),
    standard_cost NUMERIC(18,4),
    list_price NUMERIC(18,4),
    weight_kg NUMERIC(10,4),
    length_cm NUMERIC(10,2),
    width_cm NUMERIC(10,2),
    height_cm NUMERIC(10,2),
    volume_l NUMERIC(10,4),
    minimum_temperature_c NUMERIC(5,2),
    maximum_temperature_c NUMERIC(5,2),
    country_of_origin CHAR(2),
    customs_tariff_code TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_item_category ON item(tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_item_abc ON item(tenant_id, abc_class);

CREATE TABLE IF NOT EXISTS item_barcode (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL REFERENCES item(id),
    barcode CITEXT NOT NULL,
    barcode_type TEXT NOT NULL,
    uom_code TEXT NOT NULL DEFAULT 'EA',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (tenant_id, barcode)
);
CREATE INDEX IF NOT EXISTS idx_item_barcode_item ON item_barcode(item_id);

CREATE TABLE IF NOT EXISTS item_uom (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL REFERENCES item(id),
    uom_code TEXT NOT NULL,
    description TEXT,
    conversion_to_base NUMERIC(18,6) NOT NULL,
    weight_kg NUMERIC(10,4),
    length_cm NUMERIC(10,2),
    width_cm NUMERIC(10,2),
    height_cm NUMERIC(10,2),
    is_inbound_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_outbound_default BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (item_id, uom_code)
);

CREATE TABLE IF NOT EXISTS item_supplier (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL REFERENCES item(id),
    supplier_id BIGINT NOT NULL REFERENCES partner(id),
    supplier_sku TEXT,
    lead_time_days INTEGER,
    minimum_order_quantity NUMERIC(18,6),
    purchase_uom_code TEXT,
    last_purchase_price NUMERIC(18,4),
    last_purchased_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS item_kit_component (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    parent_item_id BIGINT NOT NULL REFERENCES item(id),
    component_item_id BIGINT NOT NULL REFERENCES item(id),
    quantity NUMERIC(18,6) NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 0,
    is_optional BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================================
-- Users, roles, permissions, devices, auth
-- ============================================================================

CREATE TABLE IF NOT EXISTS role (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS permission (
    id BIGSERIAL PRIMARY KEY,
    code CITEXT UNIQUE NOT NULL,
    name TEXT,
    description TEXT,
    module TEXT,
    category TEXT,
    sensitive BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS role_permission (
    role_id BIGINT NOT NULL REFERENCES role(id),
    permission_id BIGINT NOT NULL REFERENCES permission(id),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS app_user (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    username CITEXT NOT NULL,
    email CITEXT,
    full_name TEXT,
    employee_number TEXT,
    password_hash TEXT,
    pin_hash TEXT,
    sso_subject TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    preferred_language CHAR(2),
    UNIQUE (tenant_id, username)
);

CREATE TABLE IF NOT EXISTS user_role (
    user_id BIGINT NOT NULL REFERENCES app_user(id),
    role_id BIGINT NOT NULL REFERENCES role(id),
    warehouse_id BIGINT REFERENCES warehouse(id),
    PRIMARY KEY (user_id, role_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS user_scope (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES app_user(id),
    dimension TEXT NOT NULL,
    dimension_value BIGINT NOT NULL,
    granted_by_user_id BIGINT REFERENCES app_user(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, user_id, dimension, dimension_value)
);

CREATE TABLE IF NOT EXISTS device (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT REFERENCES warehouse(id),
    device_code CITEXT NOT NULL,
    device_name TEXT,
    device_type TEXT NOT NULL,
    manufacturer TEXT,
    model TEXT,
    serial_number TEXT,
    mac_address TEXT,
    android_version TEXT,
    app_version TEXT,
    last_seen_at TIMESTAMPTZ,
    last_user_id BIGINT REFERENCES app_user(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, device_code)
);

CREATE TABLE IF NOT EXISTS device_session (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    device_id BIGINT NOT NULL REFERENCES device(id),
    user_id BIGINT NOT NULL REFERENCES app_user(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    refresh_token_hash TEXT,
    ip_address INET,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_session (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES app_user(id),
    device_id BIGINT REFERENCES device(id),
    session_token_hash TEXT UNIQUE NOT NULL,
    refresh_token_hash TEXT UNIQUE,
    ip_address INET,
    user_agent TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT
);

CREATE TABLE IF NOT EXISTS elevation_event (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES app_user(id),
    operation TEXT NOT NULL,
    target_entity_type TEXT,
    target_entity_id BIGINT,
    reason TEXT NOT NULL,
    mfa_method TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS api_credential (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    client_id CITEXT UNIQUE NOT NULL,
    client_secret_hash TEXT NOT NULL,
    permissions TEXT[] NOT NULL,
    rate_limit_per_minute INTEGER,
    allowed_ip_ranges INET[],
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by_user_id BIGINT REFERENCES app_user(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS encryption_key_metadata (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT,
    key_purpose TEXT NOT NULL,
    key_id TEXT NOT NULL,
    kms_provider TEXT NOT NULL,
    rotation_period_days INTEGER,
    last_rotated_at TIMESTAMPTZ,
    next_rotation_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================================
-- Lots, serials, recalls, license plates
-- ============================================================================

CREATE TABLE IF NOT EXISTS lot (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL REFERENCES item(id),
    lot_number CITEXT NOT NULL,
    supplier_lot_number TEXT,
    supplier_id BIGINT REFERENCES partner(id),
    manufactured_date DATE,
    best_before_date DATE,
    expiry_date DATE,
    received_date DATE,
    country_of_origin CHAR(2),
    quality_status TEXT NOT NULL DEFAULT 'AVAILABLE',
    is_recalled BOOLEAN NOT NULL DEFAULT FALSE,
    recall_id BIGINT,
    attributes JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, item_id, lot_number)
);
CREATE INDEX IF NOT EXISTS idx_lot_item ON lot(item_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_lot_recall ON lot(is_recalled) WHERE is_recalled = TRUE;
CREATE INDEX IF NOT EXISTS idx_lot_expiry ON lot(expiry_date) WHERE expiry_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS lot_certificate (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    lot_id BIGINT NOT NULL REFERENCES lot(id),
    certificate_type TEXT NOT NULL,
    certificate_number TEXT,
    issued_by TEXT,
    issued_date DATE,
    valid_until DATE,
    file_attachment_id TEXT
);

CREATE TABLE IF NOT EXISTS license_plate (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    lpn_number CITEXT NOT NULL,
    lpn_type TEXT NOT NULL,
    parent_lpn_id BIGINT REFERENCES license_plate(id),
    current_location_id BIGINT REFERENCES location(id),
    weight_kg NUMERIC(10,4),
    length_cm NUMERIC(10,2),
    width_cm NUMERIC(10,2),
    height_cm NUMERIC(10,2),
    status TEXT NOT NULL DEFAULT 'BUILDING',
    is_mixed_sku BOOLEAN NOT NULL DEFAULT FALSE,
    is_mixed_lot BOOLEAN NOT NULL DEFAULT FALSE,
    sealed BOOLEAN NOT NULL DEFAULT FALSE,
    seal_number TEXT,
    receipt_id BIGINT,
    shipment_id BIGINT,
    created_by_user_id BIGINT REFERENCES app_user(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, lpn_number)
);
CREATE INDEX IF NOT EXISTS idx_lpn_location ON license_plate(current_location_id);
CREATE INDEX IF NOT EXISTS idx_lpn_status ON license_plate(warehouse_id, status);
CREATE INDEX IF NOT EXISTS idx_lpn_parent ON license_plate(parent_lpn_id);

CREATE TABLE IF NOT EXISTS license_plate_event (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    license_plate_id BIGINT NOT NULL REFERENCES license_plate(id),
    event_type TEXT NOT NULL,
    event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    from_location_id BIGINT REFERENCES location(id),
    to_location_id BIGINT REFERENCES location(id),
    user_id BIGINT REFERENCES app_user(id),
    device_id BIGINT REFERENCES device(id),
    reference_type TEXT,
    reference_id BIGINT,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_lpn_event_lpn ON license_plate_event(license_plate_id, event_at DESC);

-- ============================================================================
-- Inventory and journal
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    location_id BIGINT NOT NULL REFERENCES location(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    license_plate_id BIGINT REFERENCES license_plate(id),
    lot_id BIGINT REFERENCES lot(id),
    serial_number TEXT,
    owner_id BIGINT REFERENCES partner(id),
    qty_on_hand NUMERIC(18,6) NOT NULL DEFAULT 0,
    qty_reserved NUMERIC(18,6) NOT NULL DEFAULT 0,
    qty_on_hold NUMERIC(18,6) NOT NULL DEFAULT 0,
    qty_in_transit NUMERIC(18,6) NOT NULL DEFAULT 0,
    quality_status TEXT NOT NULL DEFAULT 'AVAILABLE',
    uom_code TEXT NOT NULL,
    catch_weight_kg NUMERIC(10,4),
    last_movement_at TIMESTAMPTZ,
    last_count_at TIMESTAMPTZ,
    cost NUMERIC(18,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT inventory_qty_non_negative
        CHECK (qty_on_hand >= 0 AND qty_reserved >= 0 AND qty_on_hold >= 0)
);
-- The spec's grain UNIQUE includes nullable columns; emulate it with a partial-NULL friendly index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_grain ON inventory (
    warehouse_id, location_id, item_id,
    COALESCE(license_plate_id, 0),
    COALESCE(lot_id, 0),
    COALESCE(serial_number, ''),
    quality_status,
    COALESCE(owner_id, 0)
);
CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory(warehouse_id, item_id, quality_status);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lpn ON inventory(license_plate_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lot ON inventory(lot_id);
CREATE INDEX IF NOT EXISTS idx_inventory_serial ON inventory(serial_number) WHERE serial_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_owner ON inventory(owner_id, item_id);

CREATE TABLE IF NOT EXISTS inventory_journal (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    journal_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transaction_type TEXT NOT NULL,
    reference_type TEXT,
    reference_id BIGINT,
    item_id BIGINT NOT NULL REFERENCES item(id),
    from_location_id BIGINT REFERENCES location(id),
    to_location_id BIGINT REFERENCES location(id),
    license_plate_id BIGINT REFERENCES license_plate(id),
    lot_id BIGINT REFERENCES lot(id),
    serial_number TEXT,
    owner_id BIGINT REFERENCES partner(id),
    qty NUMERIC(18,6) NOT NULL,
    uom_code TEXT NOT NULL,
    quality_status_from TEXT,
    quality_status_to TEXT,
    cost NUMERIC(18,4),
    user_id BIGINT REFERENCES app_user(id),
    device_id BIGINT REFERENCES device(id),
    erp_posting_id TEXT,
    erp_posted_at TIMESTAMPTZ,
    notes TEXT,
    idempotency_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_journal_item_time ON inventory_journal(warehouse_id, item_id, journal_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_journal_reference ON inventory_journal(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_idempotency ON inventory_journal(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_erp_unposted ON inventory_journal(erp_posted_at) WHERE erp_posted_at IS NULL;

CREATE TABLE IF NOT EXISTS inventory_reservation (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    inventory_id BIGINT NOT NULL REFERENCES inventory(id),
    sales_order_line_id BIGINT,
    transfer_order_line_id BIGINT,
    work_order_line_id BIGINT,
    qty NUMERIC(18,6) NOT NULL,
    reservation_type TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
);
CREATE INDEX IF NOT EXISTS idx_reservation_inventory ON inventory_reservation(inventory_id, status);

CREATE TABLE IF NOT EXISTS inventory_hold (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    inventory_id BIGINT NOT NULL REFERENCES inventory(id),
    qty NUMERIC(18,6) NOT NULL,
    hold_type TEXT NOT NULL,
    hold_reason TEXT,
    placed_by_user_id BIGINT REFERENCES app_user(id),
    placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_by_user_id BIGINT REFERENCES app_user(id),
    released_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS adjustment_reason (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    direction TEXT NOT NULL,
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    approval_threshold NUMERIC(18,2),
    erp_gl_account TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS inventory_adjustment (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    adjustment_number CITEXT NOT NULL,
    inventory_id BIGINT REFERENCES inventory(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    location_id BIGINT NOT NULL REFERENCES location(id),
    lot_id BIGINT REFERENCES lot(id),
    serial_number TEXT,
    qty_before NUMERIC(18,6) NOT NULL,
    qty_after NUMERIC(18,6) NOT NULL,
    qty_delta NUMERIC(18,6) NOT NULL,
    reason_id BIGINT NOT NULL REFERENCES adjustment_reason(id),
    notes TEXT,
    photo_attachment_ids JSONB,
    cost_impact NUMERIC(18,4),
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    approval_status TEXT NOT NULL DEFAULT 'NONE',
    approved_by_user_id BIGINT REFERENCES app_user(id),
    approved_at TIMESTAMPTZ,
    erp_posting_id TEXT,
    erp_posted_at TIMESTAMPTZ,
    created_by_user_id BIGINT REFERENCES app_user(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, adjustment_number)
);

CREATE TABLE IF NOT EXISTS serial_unit (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL REFERENCES item(id),
    serial_number TEXT NOT NULL,
    lot_id BIGINT REFERENCES lot(id),
    current_location_id BIGINT REFERENCES location(id),
    current_license_plate_id BIGINT REFERENCES license_plate(id),
    current_owner_id BIGINT REFERENCES partner(id),
    quality_status TEXT NOT NULL DEFAULT 'AVAILABLE',
    status TEXT NOT NULL DEFAULT 'IN_STOCK',
    received_at TIMESTAMPTZ,
    last_event_at TIMESTAMPTZ,
    customer_id BIGINT REFERENCES partner(id),
    shipped_at TIMESTAMPTZ,
    warranty_start_date DATE,
    warranty_end_date DATE,
    UNIQUE (tenant_id, item_id, serial_number)
);
CREATE INDEX IF NOT EXISTS idx_serial_status ON serial_unit(item_id, status);
CREATE INDEX IF NOT EXISTS idx_serial_customer ON serial_unit(customer_id);

CREATE TABLE IF NOT EXISTS serial_event (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    serial_unit_id BIGINT NOT NULL REFERENCES serial_unit(id),
    event_type TEXT NOT NULL,
    event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    location_id BIGINT REFERENCES location(id),
    user_id BIGINT REFERENCES app_user(id),
    reference_type TEXT,
    reference_id BIGINT,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_serial_event_unit ON serial_event(serial_unit_id, event_at DESC);

CREATE TABLE IF NOT EXISTS recall (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    recall_number CITEXT NOT NULL,
    recall_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    initiator TEXT,
    description TEXT NOT NULL,
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'OPEN',
    UNIQUE (tenant_id, recall_number)
);

CREATE TABLE IF NOT EXISTS recall_lot (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    recall_id BIGINT NOT NULL REFERENCES recall(id),
    lot_id BIGINT NOT NULL REFERENCES lot(id),
    qty_originally_received NUMERIC(18,6),
    qty_in_stock NUMERIC(18,6),
    qty_shipped NUMERIC(18,6),
    qty_recovered NUMERIC(18,6),
    qty_destroyed NUMERIC(18,6)
);

-- ============================================================================
-- Inbound: PO, ASN, receipt
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchase_order (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    owner_id BIGINT REFERENCES partner(id),
    supplier_id BIGINT NOT NULL REFERENCES partner(id),
    po_number CITEXT NOT NULL,
    external_reference TEXT,
    expected_date DATE,
    status TEXT NOT NULL DEFAULT 'OPEN',
    currency CHAR(3),
    notes TEXT,
    erp_document_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_line (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    purchase_order_id BIGINT NOT NULL REFERENCES purchase_order(id),
    line_number INTEGER NOT NULL,
    item_id BIGINT NOT NULL REFERENCES item(id),
    expected_qty NUMERIC(18,6) NOT NULL,
    received_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
    uom_code TEXT NOT NULL,
    unit_cost NUMERIC(18,4),
    requested_lot TEXT,
    requested_expiry DATE,
    status TEXT NOT NULL DEFAULT 'OPEN',
    UNIQUE (purchase_order_id, line_number)
);

CREATE TABLE IF NOT EXISTS asn (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    asn_number CITEXT NOT NULL,
    supplier_id BIGINT REFERENCES partner(id),
    carrier_id BIGINT REFERENCES partner(id),
    trailer_number TEXT,
    seal_number TEXT,
    bill_of_lading TEXT,
    expected_arrival TIMESTAMPTZ,
    actual_arrival TIMESTAMPTZ,
    dock_door_id BIGINT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, asn_number)
);
CREATE INDEX IF NOT EXISTS idx_asn_status_date ON asn(warehouse_id, status, expected_arrival);

CREATE TABLE IF NOT EXISTS asn_line (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    asn_id BIGINT NOT NULL REFERENCES asn(id),
    line_number INTEGER NOT NULL,
    purchase_order_line_id BIGINT REFERENCES purchase_order_line(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    expected_qty NUMERIC(18,6) NOT NULL,
    received_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
    uom_code TEXT NOT NULL,
    lot_number TEXT,
    serial_numbers JSONB,
    expiry_date DATE,
    country_of_origin CHAR(2),
    UNIQUE (asn_id, line_number)
);

CREATE TABLE IF NOT EXISTS receipt (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    receipt_number CITEXT NOT NULL,
    asn_id BIGINT REFERENCES asn(id),
    purchase_order_id BIGINT REFERENCES purchase_order(id),
    supplier_id BIGINT REFERENCES partner(id),
    receipt_type TEXT NOT NULL,
    dock_door_id BIGINT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    received_by_user_id BIGINT REFERENCES app_user(id),
    status TEXT NOT NULL DEFAULT 'OPEN',
    notes TEXT,
    erp_posting_id TEXT,
    erp_posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS receipt_line (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    receipt_id BIGINT NOT NULL REFERENCES receipt(id),
    line_number INTEGER NOT NULL,
    asn_line_id BIGINT REFERENCES asn_line(id),
    purchase_order_line_id BIGINT REFERENCES purchase_order_line(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    qty_received NUMERIC(18,6) NOT NULL,
    uom_code TEXT NOT NULL,
    lot_number TEXT,
    serial_number TEXT,
    expiry_date DATE,
    catch_weight_kg NUMERIC(10,4),
    quality_status TEXT NOT NULL DEFAULT 'AVAILABLE',
    license_plate_id BIGINT REFERENCES license_plate(id),
    receiving_location_id BIGINT REFERENCES location(id),
    received_by_user_id BIGINT REFERENCES app_user(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    discrepancy_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
    discrepancy_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_receipt_line_receipt ON receipt_line(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_line_lpn ON receipt_line(license_plate_id);

CREATE TABLE IF NOT EXISTS receipt_discrepancy (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    receipt_id BIGINT NOT NULL REFERENCES receipt(id),
    receipt_line_id BIGINT REFERENCES receipt_line(id),
    discrepancy_type TEXT NOT NULL,
    expected_qty NUMERIC(18,6),
    actual_qty NUMERIC(18,6),
    description TEXT,
    photo_attachment_ids JSONB,
    resolution_status TEXT NOT NULL DEFAULT 'OPEN',
    resolved_by_user_id BIGINT REFERENCES app_user(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT
);

CREATE TABLE IF NOT EXISTS cross_dock_link (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    receipt_line_id BIGINT REFERENCES receipt_line(id),
    asn_line_id BIGINT REFERENCES asn_line(id),
    sales_order_line_id BIGINT,
    qty_linked NUMERIC(18,6) NOT NULL,
    link_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PLANNED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cross_dock_status ON cross_dock_link(warehouse_id, status);

-- ============================================================================
-- Putaway, slotting, velocity, affinity
-- ============================================================================

CREATE TABLE IF NOT EXISTS putaway_rule (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    name TEXT NOT NULL,
    priority INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    selector_jsonb JSONB NOT NULL,
    target_zone_id BIGINT REFERENCES zone(id),
    target_location_filter JSONB,
    strategy TEXT NOT NULL,
    fallback_rule_id BIGINT REFERENCES putaway_rule(id),
    UNIQUE (warehouse_id, name)
);

CREATE TABLE IF NOT EXISTS putaway_task (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    license_plate_id BIGINT REFERENCES license_plate(id),
    item_id BIGINT REFERENCES item(id),
    qty NUMERIC(18,6),
    uom_code TEXT,
    suggested_location_id BIGINT REFERENCES location(id),
    actual_location_id BIGINT REFERENCES location(id),
    receipt_line_id BIGINT REFERENCES receipt_line(id),
    rule_id BIGINT REFERENCES putaway_rule(id),
    priority INTEGER NOT NULL DEFAULT 50,
    status TEXT NOT NULL DEFAULT 'OPEN',
    assigned_to_user_id BIGINT REFERENCES app_user(id),
    assigned_to_device_id BIGINT REFERENCES device(id),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_putaway_task_status ON putaway_task(warehouse_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_putaway_task_user ON putaway_task(assigned_to_user_id, status);

CREATE TABLE IF NOT EXISTS item_velocity (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    pick_count INTEGER NOT NULL,
    line_count INTEGER NOT NULL,
    qty_picked NUMERIC(18,6) NOT NULL,
    abc_class CHAR(1),
    velocity_score NUMERIC(8,4),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (warehouse_id, item_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS item_affinity (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    item_id_a BIGINT NOT NULL REFERENCES item(id),
    item_id_b BIGINT NOT NULL REFERENCES item(id),
    co_pick_count INTEGER NOT NULL,
    lift_score NUMERIC(8,4),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (warehouse_id, item_id_a, item_id_b, period_start)
);

CREATE TABLE IF NOT EXISTS item_slot_assignment (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    location_id BIGINT NOT NULL REFERENCES location(id),
    slot_role TEXT NOT NULL,
    min_qty NUMERIC(18,6),
    max_qty NUMERIC(18,6),
    reorder_point NUMERIC(18,6),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (warehouse_id, item_id, location_id, slot_role)
);
CREATE INDEX IF NOT EXISTS idx_slot_item ON item_slot_assignment(item_id, slot_role);
CREATE INDEX IF NOT EXISTS idx_slot_location ON item_slot_assignment(location_id);

CREATE TABLE IF NOT EXISTS slot_recommendation (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    current_location_id BIGINT REFERENCES location(id),
    suggested_location_id BIGINT NOT NULL REFERENCES location(id),
    expected_travel_savings_seconds NUMERIC(10,2),
    expected_pick_count_per_day NUMERIC(10,2),
    rationale JSONB,
    status TEXT NOT NULL DEFAULT 'PROPOSED',
    reviewed_by_user_id BIGINT REFERENCES app_user(id),
    reviewed_at TIMESTAMPTZ,
    executed_move_task_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Outbound: sales orders, holds, allocation
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_order (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    owner_id BIGINT REFERENCES partner(id),
    order_number CITEXT NOT NULL,
    external_order_number TEXT,
    channel TEXT,
    customer_id BIGINT NOT NULL REFERENCES partner(id),
    ship_to_address_id BIGINT REFERENCES partner_address(id),
    bill_to_address_id BIGINT REFERENCES partner_address(id),
    order_date DATE NOT NULL,
    required_ship_date DATE,
    required_delivery_date DATE,
    carrier_id BIGINT REFERENCES partner(id),
    carrier_service_id BIGINT REFERENCES carrier_service(id),
    priority INTEGER NOT NULL DEFAULT 50,
    is_hazmat BOOLEAN NOT NULL DEFAULT FALSE,
    is_signature_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_ship_complete BOOLEAN NOT NULL DEFAULT FALSE,
    is_partial_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    insured_value NUMERIC(18,2),
    cod_amount NUMERIC(18,2),
    currency CHAR(3),
    status TEXT NOT NULL DEFAULT 'IMPORTED',
    hold_reason TEXT,
    erp_order_id TEXT,
    notes TEXT,
    customer_po TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_so_status_date ON sales_order(warehouse_id, status, required_ship_date);
CREATE INDEX IF NOT EXISTS idx_so_customer ON sales_order(customer_id, order_date);
CREATE INDEX IF NOT EXISTS idx_so_external ON sales_order(external_order_number);

CREATE TABLE IF NOT EXISTS sales_order_line (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    sales_order_id BIGINT NOT NULL REFERENCES sales_order(id),
    line_number INTEGER NOT NULL,
    item_id BIGINT NOT NULL REFERENCES item(id),
    qty_ordered NUMERIC(18,6) NOT NULL,
    qty_allocated NUMERIC(18,6) NOT NULL DEFAULT 0,
    qty_picked NUMERIC(18,6) NOT NULL DEFAULT 0,
    qty_packed NUMERIC(18,6) NOT NULL DEFAULT 0,
    qty_shipped NUMERIC(18,6) NOT NULL DEFAULT 0,
    qty_cancelled NUMERIC(18,6) NOT NULL DEFAULT 0,
    qty_backordered NUMERIC(18,6) NOT NULL DEFAULT 0,
    uom_code TEXT NOT NULL,
    unit_price NUMERIC(18,4),
    requested_lot TEXT,
    requested_serial TEXT,
    requires_serial BOOLEAN NOT NULL DEFAULT FALSE,
    customer_sku TEXT,
    line_notes TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    UNIQUE (sales_order_id, line_number)
);
CREATE INDEX IF NOT EXISTS idx_sol_item_status ON sales_order_line(item_id, status);

CREATE TABLE IF NOT EXISTS order_hold (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    sales_order_id BIGINT NOT NULL REFERENCES sales_order(id),
    hold_type TEXT NOT NULL,
    hold_reason TEXT,
    placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    placed_by_user_id BIGINT REFERENCES app_user(id),
    released_at TIMESTAMPTZ,
    released_by_user_id BIGINT REFERENCES app_user(id),
    status TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS order_compliance_rule (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    customer_id BIGINT REFERENCES partner(id),
    item_category_id BIGINT REFERENCES item_category(id),
    country_code CHAR(2),
    rule_type TEXT NOT NULL,
    rule_definition JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS allocation_strategy (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    name TEXT NOT NULL,
    selector_jsonb JSONB,
    rotation_method TEXT NOT NULL,
    prefer_pick_face BOOLEAN NOT NULL DEFAULT TRUE,
    prefer_full_lpn BOOLEAN NOT NULL DEFAULT FALSE,
    prefer_single_location BOOLEAN NOT NULL DEFAULT TRUE,
    minimum_shelf_life_days INTEGER,
    avoid_quality_status JSONB,
    priority INTEGER NOT NULL DEFAULT 50,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS allocation (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    sales_order_line_id BIGINT NOT NULL REFERENCES sales_order_line(id),
    inventory_id BIGINT NOT NULL REFERENCES inventory(id),
    qty_allocated NUMERIC(18,6) NOT NULL,
    uom_code TEXT NOT NULL,
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    allocated_by TEXT,
    pick_task_id BIGINT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    released_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_allocation_inventory ON allocation(inventory_id, status);
CREATE INDEX IF NOT EXISTS idx_allocation_sol ON allocation(sales_order_line_id);

-- ============================================================================
-- Wave / task / picking
-- ============================================================================

CREATE TABLE IF NOT EXISTS wave_template (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    selector_jsonb JSONB,
    max_order_count INTEGER,
    max_line_count INTEGER,
    max_unit_count NUMERIC(18,6),
    max_carton_count INTEGER,
    max_weight_kg NUMERIC(12,2),
    pick_strategy TEXT NOT NULL DEFAULT 'BATCH',
    cutoff_offset_minutes INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS wave (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    wave_number CITEXT NOT NULL,
    template_id BIGINT REFERENCES wave_template(id),
    planned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    pick_strategy TEXT NOT NULL,
    order_count INTEGER NOT NULL DEFAULT 0,
    line_count INTEGER NOT NULL DEFAULT 0,
    unit_count NUMERIC(18,6) NOT NULL DEFAULT 0,
    expected_pick_minutes NUMERIC(10,2),
    status TEXT NOT NULL DEFAULT 'PLANNED',
    notes TEXT,
    UNIQUE (tenant_id, wave_number)
);
CREATE INDEX IF NOT EXISTS idx_wave_status ON wave(warehouse_id, status, planned_at);

CREATE TABLE IF NOT EXISTS wave_order (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    wave_id BIGINT NOT NULL REFERENCES wave(id),
    sales_order_id BIGINT NOT NULL REFERENCES sales_order(id),
    sequence INTEGER,
    UNIQUE (wave_id, sales_order_id)
);

CREATE TABLE IF NOT EXISTS task (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    task_type TEXT NOT NULL,
    task_number CITEXT NOT NULL,
    wave_id BIGINT REFERENCES wave(id),
    reference_type TEXT,
    reference_id BIGINT,
    priority INTEGER NOT NULL DEFAULT 50,
    zone_id BIGINT REFERENCES zone(id),
    from_location_id BIGINT REFERENCES location(id),
    to_location_id BIGINT REFERENCES location(id),
    license_plate_id BIGINT REFERENCES license_plate(id),
    item_id BIGINT REFERENCES item(id),
    qty_required NUMERIC(18,6),
    qty_completed NUMERIC(18,6) NOT NULL DEFAULT 0,
    uom_code TEXT,
    required_equipment_type TEXT,
    required_qualification TEXT,
    assigned_to_user_id BIGINT REFERENCES app_user(id),
    assigned_to_device_id BIGINT REFERENCES device(id),
    assigned_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'OPEN',
    expected_seconds INTEGER,
    actual_seconds INTEGER,
    sequence INTEGER,
    parent_task_id BIGINT REFERENCES task(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, task_number)
);
CREATE INDEX IF NOT EXISTS idx_task_dispatch ON task(warehouse_id, status, task_type, priority, zone_id);
CREATE INDEX IF NOT EXISTS idx_task_user_active ON task(assigned_to_user_id, status) WHERE status IN ('ASSIGNED','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_task_reference ON task(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS pick_cart (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    cart_number CITEXT NOT NULL,
    cart_type TEXT NOT NULL,
    bin_count INTEGER NOT NULL,
    current_user_id BIGINT REFERENCES app_user(id),
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
    UNIQUE (tenant_id, cart_number)
);

CREATE TABLE IF NOT EXISTS pick_cart_bin (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    cart_id BIGINT NOT NULL REFERENCES pick_cart(id),
    position INTEGER NOT NULL,
    sales_order_id BIGINT REFERENCES sales_order(id),
    license_plate_id BIGINT REFERENCES license_plate(id),
    UNIQUE (cart_id, position)
);

CREATE TABLE IF NOT EXISTS pick_task (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    task_id BIGINT NOT NULL REFERENCES task(id),
    sales_order_line_id BIGINT NOT NULL REFERENCES sales_order_line(id),
    allocation_id BIGINT REFERENCES allocation(id),
    cart_id BIGINT REFERENCES pick_cart(id),
    cart_position INTEGER,
    qty_required NUMERIC(18,6) NOT NULL,
    qty_picked NUMERIC(18,6) NOT NULL DEFAULT 0,
    qty_short NUMERIC(18,6) NOT NULL DEFAULT 0,
    short_reason TEXT,
    pick_method TEXT NOT NULL DEFAULT 'RF',
    picked_lot_id BIGINT REFERENCES lot(id),
    picked_serial_numbers JSONB,
    picked_lpn_id BIGINT REFERENCES license_plate(id),
    drop_lpn_id BIGINT REFERENCES license_plate(id),
    UNIQUE (task_id)
);
CREATE INDEX IF NOT EXISTS idx_pick_task_sol ON pick_task(sales_order_line_id);

CREATE TABLE IF NOT EXISTS pick_path_segment (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    wave_id BIGINT REFERENCES wave(id),
    user_id BIGINT REFERENCES app_user(id),
    sequence INTEGER NOT NULL,
    location_id BIGINT REFERENCES location(id),
    expected_distance_m NUMERIC(8,2),
    actual_distance_m NUMERIC(8,2),
    expected_seconds INTEGER,
    actual_seconds INTEGER,
    arrived_at TIMESTAMPTZ,
    departed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pick_exception (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    pick_task_id BIGINT NOT NULL REFERENCES pick_task(id),
    exception_type TEXT NOT NULL,
    description TEXT,
    photo_attachment_ids JSONB,
    resolution_status TEXT NOT NULL DEFAULT 'OPEN',
    resolved_by_user_id BIGINT REFERENCES app_user(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Packing, cartons, VAS, work orders, shipping, manifesting
-- ============================================================================

CREATE TABLE IF NOT EXISTS packing_station (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    has_scale BOOLEAN NOT NULL DEFAULT FALSE,
    has_dim_scanner BOOLEAN NOT NULL DEFAULT FALSE,
    label_printer_device_id BIGINT REFERENCES device(id),
    document_printer_device_id BIGINT REFERENCES device(id),
    UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS carton_type (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT REFERENCES warehouse(id),
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    inner_length_cm NUMERIC(10,2) NOT NULL,
    inner_width_cm NUMERIC(10,2) NOT NULL,
    inner_height_cm NUMERIC(10,2) NOT NULL,
    outer_length_cm NUMERIC(10,2),
    outer_width_cm NUMERIC(10,2),
    outer_height_cm NUMERIC(10,2),
    tare_weight_kg NUMERIC(10,3) NOT NULL,
    max_payload_kg NUMERIC(10,3) NOT NULL,
    cost NUMERIC(10,4),
    is_corrugated BOOLEAN,
    is_padded BOOLEAN,
    on_hand_qty INTEGER,
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS shipment (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    shipment_number CITEXT NOT NULL,
    sales_order_id BIGINT REFERENCES sales_order(id),
    carrier_id BIGINT REFERENCES partner(id),
    carrier_service_id BIGINT REFERENCES carrier_service(id),
    ship_to_address_id BIGINT REFERENCES partner_address(id),
    planned_ship_date DATE,
    actual_ship_date DATE,
    tracking_number TEXT,
    master_tracking_number TEXT,
    carrier_label_url TEXT,
    insured_value NUMERIC(18,2),
    cod_amount NUMERIC(18,2),
    declared_weight_kg NUMERIC(10,3),
    actual_weight_kg NUMERIC(10,3),
    declared_volume_l NUMERIC(10,3),
    package_count INTEGER NOT NULL DEFAULT 0,
    pallet_count INTEGER NOT NULL DEFAULT 0,
    freight_cost NUMERIC(18,2),
    status TEXT NOT NULL DEFAULT 'PLANNED',
    erp_posting_id TEXT,
    erp_posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, shipment_number)
);

CREATE TABLE IF NOT EXISTS package (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    shipment_id BIGINT NOT NULL REFERENCES shipment(id),
    sequence INTEGER NOT NULL,
    license_plate_id BIGINT REFERENCES license_plate(id),
    carton_type_id BIGINT REFERENCES carton_type(id),
    weight_kg NUMERIC(10,3),
    length_cm NUMERIC(10,2),
    width_cm NUMERIC(10,2),
    height_cm NUMERIC(10,2),
    tracking_number TEXT,
    label_url TEXT,
    contents_value NUMERIC(18,2),
    UNIQUE (shipment_id, sequence)
);

CREATE TABLE IF NOT EXISTS package_item (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    package_id BIGINT NOT NULL REFERENCES package(id),
    sales_order_line_id BIGINT NOT NULL REFERENCES sales_order_line(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    qty NUMERIC(18,6) NOT NULL,
    uom_code TEXT NOT NULL,
    lot_id BIGINT REFERENCES lot(id),
    serial_numbers JSONB
);

CREATE TABLE IF NOT EXISTS cartonization_plan (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    sales_order_id BIGINT NOT NULL REFERENCES sales_order(id),
    carton_count INTEGER NOT NULL,
    plan_jsonb JSONB NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vas_template (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    selector_jsonb JSONB,
    expected_seconds_per_unit INTEGER,
    billable_rate NUMERIC(18,4),
    billable_uom TEXT,
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS vas_step (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    template_id BIGINT NOT NULL REFERENCES vas_template(id),
    sequence INTEGER NOT NULL,
    instruction TEXT NOT NULL,
    requires_photo BOOLEAN NOT NULL DEFAULT FALSE,
    requires_supervisor_signoff BOOLEAN NOT NULL DEFAULT FALSE,
    expected_seconds INTEGER
);

CREATE TABLE IF NOT EXISTS vas_activity (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    template_id BIGINT NOT NULL REFERENCES vas_template(id),
    sales_order_id BIGINT REFERENCES sales_order(id),
    license_plate_id BIGINT REFERENCES license_plate(id),
    qty NUMERIC(18,6) NOT NULL,
    user_id BIGINT REFERENCES app_user(id),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'OPEN',
    billed BOOLEAN NOT NULL DEFAULT FALSE,
    bill_run_id BIGINT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS work_order (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    work_order_number CITEXT NOT NULL,
    work_order_type TEXT NOT NULL,
    parent_item_id BIGINT NOT NULL REFERENCES item(id),
    qty_planned NUMERIC(18,6) NOT NULL,
    qty_completed NUMERIC(18,6) NOT NULL DEFAULT 0,
    target_lot_id BIGINT REFERENCES lot(id),
    target_location_id BIGINT REFERENCES location(id),
    sales_order_id BIGINT REFERENCES sales_order(id),
    status TEXT NOT NULL DEFAULT 'PLANNED',
    planned_start TIMESTAMPTZ,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    UNIQUE (tenant_id, work_order_number)
);

CREATE TABLE IF NOT EXISTS work_order_component (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    work_order_id BIGINT NOT NULL REFERENCES work_order(id),
    component_item_id BIGINT NOT NULL REFERENCES item(id),
    qty_required NUMERIC(18,6) NOT NULL,
    qty_consumed NUMERIC(18,6) NOT NULL DEFAULT 0,
    uom_code TEXT NOT NULL,
    sequence INTEGER
);

CREATE TABLE IF NOT EXISTS rate_quote (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    shipment_id BIGINT REFERENCES shipment(id),
    sales_order_id BIGINT REFERENCES sales_order(id),
    carrier_id BIGINT REFERENCES partner(id),
    carrier_service_id BIGINT REFERENCES carrier_service(id),
    transit_days INTEGER,
    base_rate NUMERIC(18,4),
    fuel_surcharge NUMERIC(18,4),
    accessorial_total NUMERIC(18,4),
    total_rate NUMERIC(18,4),
    currency CHAR(3),
    is_selected BOOLEAN NOT NULL DEFAULT FALSE,
    quoted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipping_document (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    shipment_id BIGINT NOT NULL REFERENCES shipment(id),
    document_type TEXT NOT NULL,
    file_url TEXT,
    rendered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    printed_at TIMESTAMPTZ,
    printed_by_user_id BIGINT REFERENCES app_user(id),
    reprint_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS manifest (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    manifest_number CITEXT NOT NULL,
    carrier_id BIGINT NOT NULL REFERENCES partner(id),
    pickup_date DATE NOT NULL,
    dock_door_id BIGINT,
    trailer_number TEXT,
    seal_number TEXT,
    package_count INTEGER NOT NULL DEFAULT 0,
    total_weight_kg NUMERIC(12,2),
    closed_at TIMESTAMPTZ,
    closed_by_user_id BIGINT REFERENCES app_user(id),
    transmitted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'OPEN',
    UNIQUE (tenant_id, manifest_number)
);

CREATE TABLE IF NOT EXISTS manifest_shipment (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    manifest_id BIGINT NOT NULL REFERENCES manifest(id),
    shipment_id BIGINT NOT NULL REFERENCES shipment(id),
    loaded_at TIMESTAMPTZ,
    loaded_by_user_id BIGINT REFERENCES app_user(id),
    UNIQUE (manifest_id, shipment_id)
);

CREATE TABLE IF NOT EXISTS load_event (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    manifest_id BIGINT NOT NULL REFERENCES manifest(id),
    package_id BIGINT REFERENCES package(id),
    license_plate_id BIGINT REFERENCES license_plate(id),
    user_id BIGINT REFERENCES app_user(id),
    device_id BIGINT REFERENCES device(id),
    event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL
);

-- ============================================================================
-- Returns / RMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS rma (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    rma_number CITEXT NOT NULL,
    sales_order_id BIGINT REFERENCES sales_order(id),
    customer_id BIGINT NOT NULL REFERENCES partner(id),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_arrival DATE,
    actual_arrival TIMESTAMPTZ,
    return_reason_category TEXT,
    requested_resolution TEXT,
    status TEXT NOT NULL DEFAULT 'ISSUED',
    notes TEXT,
    UNIQUE (tenant_id, rma_number)
);

CREATE TABLE IF NOT EXISTS rma_line (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    rma_id BIGINT NOT NULL REFERENCES rma(id),
    line_number INTEGER NOT NULL,
    sales_order_line_id BIGINT REFERENCES sales_order_line(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    qty_expected NUMERIC(18,6) NOT NULL,
    qty_received NUMERIC(18,6) NOT NULL DEFAULT 0,
    serial_number TEXT,
    return_reason_code TEXT,
    UNIQUE (rma_id, line_number)
);

CREATE TABLE IF NOT EXISTS return_disposition (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    rma_line_id BIGINT NOT NULL REFERENCES rma_line(id),
    qty NUMERIC(18,6) NOT NULL,
    disposition TEXT NOT NULL,
    target_location_id BIGINT REFERENCES location(id),
    target_quality_status TEXT,
    inspector_user_id BIGINT REFERENCES app_user(id),
    inspected_at TIMESTAMPTZ,
    inspection_notes TEXT,
    photo_attachment_ids JSONB
);

CREATE TABLE IF NOT EXISTS return_reason (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    is_customer_fault BOOLEAN NOT NULL DEFAULT FALSE,
    triggers_supplier_claim BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, code)
);

-- ============================================================================
-- Cycle counting
-- ============================================================================

CREATE TABLE IF NOT EXISTS count_program (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    program_type TEXT NOT NULL,
    cadence TEXT,
    tolerance_pct NUMERIC(6,3),
    requires_blind BOOLEAN NOT NULL DEFAULT FALSE,
    requires_recount BOOLEAN NOT NULL DEFAULT TRUE,
    selector_jsonb JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS count_session (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    program_id BIGINT REFERENCES count_program(id),
    session_number CITEXT NOT NULL,
    session_type TEXT NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'OPEN',
    expected_location_count INTEGER,
    completed_location_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, session_number)
);

CREATE TABLE IF NOT EXISTS count_task (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    session_id BIGINT NOT NULL REFERENCES count_session(id),
    location_id BIGINT NOT NULL REFERENCES location(id),
    item_id BIGINT REFERENCES item(id),
    is_blind BOOLEAN NOT NULL DEFAULT FALSE,
    expected_qty NUMERIC(18,6),
    counted_qty NUMERIC(18,6),
    variance_qty NUMERIC(18,6),
    counted_by_user_id BIGINT REFERENCES app_user(id),
    counted_at TIMESTAMPTZ,
    recount_required BOOLEAN NOT NULL DEFAULT FALSE,
    recount_qty NUMERIC(18,6),
    recounted_by_user_id BIGINT REFERENCES app_user(id),
    recounted_at TIMESTAMPTZ,
    final_qty NUMERIC(18,6),
    adjustment_id BIGINT REFERENCES inventory_adjustment(id),
    status TEXT NOT NULL DEFAULT 'OPEN',
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_count_task_session ON count_task(session_id, status);
CREATE INDEX IF NOT EXISTS idx_count_task_location ON count_task(location_id);

-- ============================================================================
-- Replenishment
-- ============================================================================

CREATE TABLE IF NOT EXISTS replenishment_rule (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    name TEXT NOT NULL,
    selector_jsonb JSONB,
    trigger_type TEXT NOT NULL,
    min_qty NUMERIC(18,6),
    max_qty NUMERIC(18,6),
    reorder_point NUMERIC(18,6),
    priority INTEGER NOT NULL DEFAULT 50,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS replenishment_task (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    task_id BIGINT NOT NULL REFERENCES task(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    source_location_id BIGINT NOT NULL REFERENCES location(id),
    target_location_id BIGINT NOT NULL REFERENCES location(id),
    qty_required NUMERIC(18,6) NOT NULL,
    qty_moved NUMERIC(18,6) NOT NULL DEFAULT 0,
    uom_code TEXT NOT NULL,
    rule_id BIGINT REFERENCES replenishment_rule(id),
    triggered_by TEXT,
    UNIQUE (task_id)
);

-- ============================================================================
-- Yard / dock
-- ============================================================================

CREATE TABLE IF NOT EXISTS dock_door (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    door_type TEXT NOT NULL,
    has_leveler BOOLEAN,
    has_seal BOOLEAN,
    has_refrigeration BOOLEAN,
    is_oversize BOOLEAN,
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
    UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS yard_slot (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    code CITEXT NOT NULL,
    yard_zone TEXT,
    has_power BOOLEAN,
    has_reefer_power BOOLEAN,
    is_drop_lot BOOLEAN,
    UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS trailer (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    trailer_number CITEXT NOT NULL,
    license_plate TEXT,
    carrier_id BIGINT REFERENCES partner(id),
    trailer_type TEXT,
    length_ft INTEGER,
    is_refrigerated BOOLEAN,
    UNIQUE (tenant_id, trailer_number)
);

CREATE TABLE IF NOT EXISTS appointment (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    appointment_number CITEXT NOT NULL,
    appointment_type TEXT NOT NULL,
    carrier_id BIGINT REFERENCES partner(id),
    asn_id BIGINT REFERENCES asn(id),
    manifest_id BIGINT REFERENCES manifest(id),
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    dock_door_id BIGINT REFERENCES dock_door(id),
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'SCHEDULED',
    notes TEXT,
    UNIQUE (tenant_id, appointment_number)
);

CREATE TABLE IF NOT EXISTS yard_event (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    trailer_id BIGINT REFERENCES trailer(id),
    appointment_id BIGINT REFERENCES appointment(id),
    event_type TEXT NOT NULL,
    event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    yard_slot_id BIGINT REFERENCES yard_slot(id),
    dock_door_id BIGINT REFERENCES dock_door(id),
    user_id BIGINT REFERENCES app_user(id),
    driver_name TEXT,
    driver_phone TEXT,
    seal_number TEXT,
    reefer_set_temp_c NUMERIC(5,2),
    reefer_actual_temp_c NUMERIC(5,2),
    notes TEXT,
    photo_attachment_ids JSONB
);
CREATE INDEX IF NOT EXISTS idx_yard_event_trailer ON yard_event(trailer_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_yard_event_door ON yard_event(dock_door_id, event_at DESC);

-- ============================================================================
-- Labor
-- ============================================================================

CREATE TABLE IF NOT EXISTS labor_standard (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    activity_code CITEXT NOT NULL,
    activity_name TEXT NOT NULL,
    selector_jsonb JSONB,
    base_seconds NUMERIC(10,3) NOT NULL,
    formula_jsonb JSONB,
    revision INTEGER NOT NULL DEFAULT 1,
    effective_from DATE NOT NULL,
    effective_to DATE,
    UNIQUE (warehouse_id, activity_code, revision)
);

CREATE TABLE IF NOT EXISTS labor_activity (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    user_id BIGINT NOT NULL REFERENCES app_user(id),
    task_id BIGINT REFERENCES task(id),
    standard_id BIGINT REFERENCES labor_standard(id),
    activity_code CITEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    expected_seconds NUMERIC(10,3),
    actual_seconds NUMERIC(10,3),
    performance_pct NUMERIC(8,3),
    units_processed NUMERIC(18,6),
    distance_m NUMERIC(10,2),
    is_indirect BOOLEAN NOT NULL DEFAULT FALSE,
    indirect_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_labor_activity_user_time ON labor_activity(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS labor_clock (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES app_user(id),
    clock_in_at TIMESTAMPTZ NOT NULL,
    clock_out_at TIMESTAMPTZ,
    shift_code TEXT,
    paid_break_minutes INTEGER,
    unpaid_break_minutes INTEGER,
    total_paid_minutes INTEGER,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS labor_incentive_plan (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT REFERENCES warehouse(id),
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    threshold_pct NUMERIC(8,3),
    rate_per_pct NUMERIC(18,4),
    cap_per_shift NUMERIC(18,2),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS labor_forecast (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    forecast_date DATE NOT NULL,
    shift_code TEXT NOT NULL,
    zone_id BIGINT REFERENCES zone(id),
    activity_code TEXT,
    forecast_units NUMERIC(18,6),
    forecast_hours NUMERIC(10,2),
    forecast_ftes NUMERIC(8,2),
    confidence_pct NUMERIC(6,2),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3PL billing
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_contract (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    owner_id BIGINT NOT NULL REFERENCES partner(id),
    contract_number CITEXT NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    currency CHAR(3) NOT NULL,
    billing_frequency TEXT NOT NULL,
    minimum_monthly NUMERIC(18,2),
    payment_terms TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, contract_number)
);

CREATE TABLE IF NOT EXISTS rate_card (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    contract_id BIGINT NOT NULL REFERENCES client_contract(id),
    code CITEXT NOT NULL,
    name TEXT NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    UNIQUE (contract_id, code)
);

CREATE TABLE IF NOT EXISTS rate_card_line (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    rate_card_id BIGINT NOT NULL REFERENCES rate_card(id),
    charge_code CITEXT NOT NULL,
    charge_name TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    uom TEXT NOT NULL,
    rate NUMERIC(18,4) NOT NULL,
    minimum_charge NUMERIC(18,4),
    tier_jsonb JSONB,
    selector_jsonb JSONB,
    UNIQUE (rate_card_id, charge_code)
);

CREATE TABLE IF NOT EXISTS billing_event (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    owner_id BIGINT NOT NULL REFERENCES partner(id),
    event_at TIMESTAMPTZ NOT NULL,
    activity_type TEXT NOT NULL,
    reference_type TEXT,
    reference_id BIGINT,
    item_id BIGINT REFERENCES item(id),
    qty NUMERIC(18,6),
    uom TEXT,
    weight_kg NUMERIC(10,3),
    volume_l NUMERIC(10,3),
    user_id BIGINT REFERENCES app_user(id),
    rate_card_line_id BIGINT REFERENCES rate_card_line(id),
    charge_code TEXT,
    rate NUMERIC(18,4),
    quantity_billed NUMERIC(18,6),
    amount NUMERIC(18,4),
    currency CHAR(3),
    bill_run_id BIGINT,
    is_billed BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_billing_event_owner_time ON billing_event(owner_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_event_unbilled ON billing_event(is_billed, event_at) WHERE is_billed = FALSE;

CREATE TABLE IF NOT EXISTS storage_billing_snapshot (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    snapshot_date DATE NOT NULL,
    owner_id BIGINT NOT NULL REFERENCES partner(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    location_id BIGINT REFERENCES location(id),
    qty_on_hand NUMERIC(18,6),
    pallet_count NUMERIC(10,2),
    cubic_m NUMERIC(12,3),
    sq_m NUMERIC(12,3),
    UNIQUE (warehouse_id, snapshot_date, owner_id, item_id, location_id)
);

CREATE TABLE IF NOT EXISTS bill_run (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    contract_id BIGINT NOT NULL REFERENCES client_contract(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    invoice_number CITEXT,
    subtotal NUMERIC(18,2),
    tax NUMERIC(18,2),
    total NUMERIC(18,2),
    currency CHAR(3),
    status TEXT NOT NULL DEFAULT 'DRAFT',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by_user_id BIGINT REFERENCES app_user(id),
    approved_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    erp_invoice_id TEXT
);

CREATE TABLE IF NOT EXISTS bill_run_line (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    bill_run_id BIGINT NOT NULL REFERENCES bill_run(id),
    charge_code TEXT NOT NULL,
    description TEXT,
    quantity NUMERIC(18,6),
    uom TEXT,
    rate NUMERIC(18,4),
    amount NUMERIC(18,4),
    event_count INTEGER
);

-- ============================================================================
-- QC, NCR, supplier scorecard
-- ============================================================================

CREATE TABLE IF NOT EXISTS qc_plan (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    plan_code CITEXT NOT NULL,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    item_id BIGINT REFERENCES item(id),
    item_category_id BIGINT REFERENCES item_category(id),
    supplier_id BIGINT REFERENCES partner(id),
    sampling_method TEXT NOT NULL,
    aql_level TEXT,
    aql_inspection_level TEXT,
    fixed_sample_size INTEGER,
    sample_percent NUMERIC(5,2),
    skip_lot_ratio INTEGER,
    auto_hold_on_fail BOOLEAN NOT NULL DEFAULT TRUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from DATE,
    effective_to DATE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, plan_code)
);

CREATE TABLE IF NOT EXISTS qc_characteristic (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    qc_plan_id BIGINT NOT NULL REFERENCES qc_plan(id),
    sequence INTEGER NOT NULL,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    char_type TEXT NOT NULL,
    measurement_method TEXT,
    instrument_required TEXT,
    expected_value TEXT,
    min_value NUMERIC(18,6),
    max_value NUMERIC(18,6),
    uom TEXT,
    mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    photo_required BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (tenant_id, qc_plan_id, sequence)
);

CREATE TABLE IF NOT EXISTS inspection (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    inspection_number CITEXT NOT NULL,
    qc_plan_id BIGINT NOT NULL REFERENCES qc_plan(id),
    trigger_type TEXT NOT NULL,
    receipt_id BIGINT REFERENCES receipt(id),
    rma_id BIGINT REFERENCES rma(id),
    work_order_id BIGINT REFERENCES work_order(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    lot_id BIGINT REFERENCES lot(id),
    quantity_inspected NUMERIC(18,6),
    sample_size INTEGER,
    status TEXT NOT NULL DEFAULT 'PENDING',
    inspector_user_id BIGINT REFERENCES app_user(id),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    outcome_summary TEXT,
    UNIQUE (tenant_id, inspection_number)
);

CREATE TABLE IF NOT EXISTS inspection_result (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    inspection_id BIGINT NOT NULL REFERENCES inspection(id),
    qc_characteristic_id BIGINT NOT NULL REFERENCES qc_characteristic(id),
    sample_index INTEGER NOT NULL,
    measured_value NUMERIC(18,6),
    measured_text TEXT,
    pass BOOLEAN NOT NULL,
    defect_code TEXT,
    notes TEXT,
    photo_uri TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS non_conformance (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    ncr_number CITEXT NOT NULL,
    inspection_id BIGINT REFERENCES inspection(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    lot_id BIGINT REFERENCES lot(id),
    supplier_id BIGINT REFERENCES partner(id),
    quantity_affected NUMERIC(18,6),
    severity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    disposition TEXT,
    root_cause TEXT,
    corrective_action TEXT,
    cost_impact NUMERIC(18,2),
    chargeback_amount NUMERIC(18,2),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    UNIQUE (tenant_id, ncr_number)
);

CREATE TABLE IF NOT EXISTS supplier_scorecard (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    supplier_id BIGINT NOT NULL REFERENCES partner(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    receipts_count INTEGER,
    on_time_count INTEGER,
    in_full_count INTEGER,
    accurate_asn_count INTEGER,
    failed_inspections INTEGER,
    total_ncr_count INTEGER,
    quality_score NUMERIC(5,2),
    delivery_score NUMERIC(5,2),
    overall_score NUMERIC(5,2),
    rating TEXT,
    UNIQUE (tenant_id, supplier_id, period_start, period_end)
);

-- ============================================================================
-- Equipment / WCS / MHE
-- ============================================================================

CREATE TABLE IF NOT EXISTS equipment (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(id),
    equipment_code CITEXT NOT NULL,
    equipment_type TEXT NOT NULL,
    vendor TEXT,
    model TEXT,
    adapter_protocol TEXT,
    endpoint_url TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    last_heartbeat_at TIMESTAMPTZ,
    config JSONB,
    UNIQUE (tenant_id, warehouse_id, equipment_code)
);

CREATE TABLE IF NOT EXISTS equipment_location_map (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    equipment_id BIGINT NOT NULL REFERENCES equipment(id),
    location_id BIGINT NOT NULL REFERENCES location(id),
    access_mode TEXT NOT NULL,
    UNIQUE (tenant_id, equipment_id, location_id)
);

CREATE TABLE IF NOT EXISTS equipment_command (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    equipment_id BIGINT NOT NULL REFERENCES equipment(id),
    command_type TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    sent_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT
);
CREATE INDEX IF NOT EXISTS equipment_command_status_idx ON equipment_command (status, sent_at);

CREATE TABLE IF NOT EXISTS equipment_event (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    equipment_id BIGINT NOT NULL REFERENCES equipment(id),
    event_type TEXT NOT NULL,
    correlation_id TEXT,
    related_task_id BIGINT REFERENCES task(id),
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS equipment_event_eq_time_idx ON equipment_event (equipment_id, occurred_at DESC);

-- ============================================================================
-- Reporting & analytics
-- ============================================================================

CREATE TABLE IF NOT EXISTS kpi_definition (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    kpi_code CITEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT,
    aggregation TEXT NOT NULL,
    source_query TEXT,
    target_value NUMERIC(18,4),
    warning_threshold NUMERIC(18,4),
    critical_threshold NUMERIC(18,4),
    direction TEXT NOT NULL,
    UNIQUE (tenant_id, kpi_code)
);

CREATE TABLE IF NOT EXISTS kpi_snapshot (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    kpi_definition_id BIGINT NOT NULL REFERENCES kpi_definition(id),
    warehouse_id BIGINT REFERENCES warehouse(id),
    zone_id BIGINT REFERENCES zone(id),
    user_id BIGINT REFERENCES app_user(id),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    value NUMERIC(18,4) NOT NULL,
    sample_count INTEGER,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshot_def_period ON kpi_snapshot(kpi_definition_id, period_start DESC);

CREATE TABLE IF NOT EXISTS report_definition (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    report_code CITEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    sql_template TEXT NOT NULL,
    parameters JSONB,
    output_formats TEXT[] NOT NULL,
    UNIQUE (tenant_id, report_code)
);

CREATE TABLE IF NOT EXISTS report_schedule (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    report_definition_id BIGINT NOT NULL REFERENCES report_definition(id),
    cron_expression TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    parameters JSONB,
    distribution JSONB NOT NULL,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS forecast_run (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    model_name TEXT NOT NULL,
    model_version TEXT NOT NULL,
    horizon_days INTEGER NOT NULL,
    granularity TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL,
    error_metrics JSONB
);

CREATE TABLE IF NOT EXISTS forecast_value (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    forecast_run_id BIGINT NOT NULL REFERENCES forecast_run(id),
    item_id BIGINT NOT NULL REFERENCES item(id),
    warehouse_id BIGINT REFERENCES warehouse(id),
    period_start TIMESTAMPTZ NOT NULL,
    forecast_quantity NUMERIC(18,4) NOT NULL,
    lower_bound NUMERIC(18,4),
    upper_bound NUMERIC(18,4)
);

CREATE TABLE IF NOT EXISTS anomaly_event (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    detector TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    severity TEXT NOT NULL,
    score NUMERIC(8,4),
    expected_value NUMERIC(18,4),
    observed_value NUMERIC(18,4),
    description TEXT,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_by_user_id BIGINT REFERENCES app_user(id),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ
);

-- ============================================================================
-- Mobile / device-fleet support (server-side)
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_sync_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    device_id BIGINT NOT NULL REFERENCES device(id),
    user_id BIGINT REFERENCES app_user(id),
    sync_type TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    records_pulled INTEGER,
    records_pushed INTEGER,
    records_failed INTEGER,
    bytes_transferred BIGINT,
    status TEXT NOT NULL,
    error TEXT
);

CREATE TABLE IF NOT EXISTS idempotency_record (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    idempotency_key TEXT NOT NULL,
    operation TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idempotency_expiry_idx ON idempotency_record(expires_at);

CREATE TABLE IF NOT EXISTS stuck_transaction (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    device_id BIGINT NOT NULL REFERENCES device(id),
    user_id BIGINT REFERENCES app_user(id),
    client_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload JSONB NOT NULL,
    last_error TEXT,
    attempt_count INTEGER NOT NULL,
    parked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_by_user_id BIGINT REFERENCES app_user(id),
    resolution TEXT,
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS mobile_screen_config (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    screen_code CITEXT NOT NULL,
    role_id BIGINT REFERENCES role(id),
    config JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, screen_code, role_id)
);

CREATE TABLE IF NOT EXISTS mobile_keybinding (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    device_profile TEXT NOT NULL,
    function_code TEXT NOT NULL,
    physical_key TEXT NOT NULL,
    UNIQUE (tenant_id, device_profile, function_code)
);

CREATE TABLE IF NOT EXISTS mobile_app_release (
    id BIGSERIAL PRIMARY KEY,
    version_code INTEGER NOT NULL,
    version_name TEXT NOT NULL,
    apk_url TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    minimum_supported_version INTEGER,
    rollout_percent INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    released_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_app_state (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    device_id BIGINT NOT NULL REFERENCES device(id),
    installed_version_code INTEGER,
    last_seen_at TIMESTAMPTZ,
    last_user_id BIGINT REFERENCES app_user(id),
    pending_queue_size INTEGER,
    parked_queue_size INTEGER,
    battery_percent INTEGER,
    network_type TEXT,
    storage_free_mb INTEGER,
    UNIQUE (tenant_id, device_id)
);

-- ============================================================================
-- Integration: endpoints, partners, message log, EDI, webhooks, ERP queue
-- ============================================================================

CREATE TABLE IF NOT EXISTS integration_endpoint (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    direction TEXT NOT NULL,
    transport TEXT NOT NULL,
    target_url TEXT,
    auth_method TEXT,
    auth_config JSONB,
    schema_version TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_partner (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    partner_id BIGINT REFERENCES partner(id),
    code CITEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    integration_type TEXT NOT NULL,
    edi_isa_id TEXT,
    edi_gs_id TEXT,
    test_mode BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB
);

CREATE TABLE IF NOT EXISTS message_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    integration_endpoint_id BIGINT REFERENCES integration_endpoint(id),
    integration_partner_id BIGINT REFERENCES integration_partner(id),
    direction TEXT NOT NULL,
    message_type TEXT NOT NULL,
    correlation_id UUID NOT NULL,
    external_reference TEXT,
    payload BYTEA,
    payload_format TEXT,
    status TEXT NOT NULL,
    error_summary TEXT,
    received_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    response_payload BYTEA,
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS message_log_corr_idx ON message_log (correlation_id);
CREATE INDEX IF NOT EXISTS message_log_partner_status_idx ON message_log (integration_partner_id, status);

CREATE TABLE IF NOT EXISTS edi_map (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    integration_partner_id BIGINT NOT NULL REFERENCES integration_partner(id),
    transaction_set TEXT NOT NULL,
    direction TEXT NOT NULL,
    version TEXT NOT NULL,
    map_definition JSONB NOT NULL,
    effective_from DATE,
    effective_to DATE,
    UNIQUE (tenant_id, integration_partner_id, transaction_set, direction, version)
);

CREATE TABLE IF NOT EXISTS webhook_subscription (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    target_url TEXT NOT NULL,
    secret TEXT NOT NULL,
    event_types TEXT[] NOT NULL,
    filter JSONB,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_delivery_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    consecutive_failures INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS webhook_delivery (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    webhook_subscription_id BIGINT NOT NULL REFERENCES webhook_subscription(id),
    event_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    response_status INTEGER,
    response_body TEXT,
    next_attempt_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS erp_posting_queue (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    source_table TEXT NOT NULL,
    source_id BIGINT NOT NULL,
    posting_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    erp_document_number TEXT,
    sent_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    last_error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- Audit, compliance, retention
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    user_id BIGINT,
    api_credential_id BIGINT,
    device_id BIGINT,
    correlation_id UUID,
    ip_address INET,
    operation TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id BIGINT,
    action TEXT NOT NULL,
    before_hash TEXT,
    after_hash TEXT,
    payload_encrypted BYTEA,
    result TEXT NOT NULL,
    failure_reason TEXT
);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_correlation_idx ON audit_log (correlation_id);

CREATE TABLE IF NOT EXISTS electronic_signature (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES app_user(id),
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    signature_meaning TEXT NOT NULL,
    signature_method TEXT NOT NULL,
    signed_payload_hash TEXT NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signature_chain_id BIGINT,
    ip_address INET,
    device_id BIGINT,
    UNIQUE (tenant_id, entity_type, entity_id, user_id, signature_meaning)
);

CREATE TABLE IF NOT EXISTS retention_policy (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    table_name TEXT NOT NULL,
    retention_period_days INTEGER NOT NULL,
    archival_target TEXT,
    deletion_strategy TEXT NOT NULL,
    legal_basis TEXT,
    UNIQUE (tenant_id, table_name)
);

CREATE TABLE IF NOT EXISTS legal_hold (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    case_reference TEXT NOT NULL,
    description TEXT,
    scope JSONB NOT NULL,
    placed_by_user_id BIGINT NOT NULL REFERENCES app_user(id),
    placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    released_by_user_id BIGINT REFERENCES app_user(id)
);

CREATE TABLE IF NOT EXISTS pii_data_subject_request (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    request_type TEXT NOT NULL,
    subject_email TEXT,
    subject_external_id TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    fulfilled_at TIMESTAMPTZ,
    rejection_reason TEXT,
    actions_log JSONB
);

CREATE TABLE IF NOT EXISTS compliance_attribute (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL REFERENCES item(id),
    attribute_type TEXT NOT NULL,
    attribute_value TEXT NOT NULL,
    effective_from DATE,
    effective_to DATE
);

CREATE TABLE IF NOT EXISTS denied_party_screening (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    partner_id BIGINT NOT NULL REFERENCES partner(id),
    list_source TEXT NOT NULL,
    screened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    match_score NUMERIC(5,2),
    match_status TEXT NOT NULL,
    reviewed_by_user_id BIGINT REFERENCES app_user(id),
    review_notes TEXT
);

-- ============================================================================
-- Notifications & workflow
-- ============================================================================

CREATE TABLE IF NOT EXISTS alert_rule (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    rule_code CITEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    event_type_filter TEXT[] NOT NULL,
    condition_expression TEXT,
    severity TEXT NOT NULL,
    throttle_seconds INTEGER,
    dedup_window_seconds INTEGER,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, rule_code)
);

CREATE TABLE IF NOT EXISTS alert_recipient (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    alert_rule_id BIGINT NOT NULL REFERENCES alert_rule(id),
    recipient_type TEXT NOT NULL,
    recipient_value TEXT NOT NULL,
    channel TEXT NOT NULL,
    escalation_level INTEGER NOT NULL DEFAULT 0,
    escalate_after_minutes INTEGER
);

CREATE TABLE IF NOT EXISTS alert_event (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    alert_rule_id BIGINT NOT NULL REFERENCES alert_rule(id),
    correlation_id UUID NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    context JSONB,
    status TEXT NOT NULL DEFAULT 'OPEN',
    acknowledged_by_user_id BIGINT REFERENCES app_user(id),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS alert_delivery (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    alert_event_id BIGINT NOT NULL REFERENCES alert_event(id),
    channel TEXT NOT NULL,
    target TEXT NOT NULL,
    status TEXT NOT NULL,
    attempted_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    error TEXT
);

CREATE TABLE IF NOT EXISTS workflow_definition (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    workflow_code CITEXT NOT NULL,
    name TEXT NOT NULL,
    version INTEGER NOT NULL,
    bpmn_xml TEXT,
    json_definition JSONB,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, workflow_code, version)
);

CREATE TABLE IF NOT EXISTS workflow_instance (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    workflow_definition_id BIGINT NOT NULL REFERENCES workflow_definition(id),
    business_key TEXT,
    initiated_by_user_id BIGINT REFERENCES app_user(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL,
    current_step TEXT,
    state JSONB
);

CREATE TABLE IF NOT EXISTS workflow_task (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    workflow_instance_id BIGINT NOT NULL REFERENCES workflow_instance(id),
    step_code TEXT NOT NULL,
    task_type TEXT NOT NULL,
    assigned_to_role_id BIGINT REFERENCES role(id),
    assigned_to_user_id BIGINT REFERENCES app_user(id),
    due_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'OPEN',
    completed_by_user_id BIGINT REFERENCES app_user(id),
    completed_at TIMESTAMPTZ,
    outcome TEXT,
    payload JSONB
);

-- ============================================================================
-- Operational metadata, deployment, tenancy quotas
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migration (
    id BIGSERIAL PRIMARY KEY,
    version TEXT UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by TEXT,
    checksum TEXT NOT NULL,
    duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS table_metadata (
    table_name TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    description TEXT,
    retention_days INTEGER,
    partition_strategy TEXT,
    expected_rows_per_facility_year BIGINT
);

CREATE TABLE IF NOT EXISTS configuration_setting (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT,
    scope TEXT NOT NULL,
    scope_id BIGINT,
    key CITEXT NOT NULL,
    value TEXT,
    value_type TEXT NOT NULL,
    description TEXT,
    overridable BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from TIMESTAMPTZ,
    effective_to TIMESTAMPTZ,
    UNIQUE (tenant_id, scope, scope_id, key)
);

CREATE TABLE IF NOT EXISTS feature_flag (
    id BIGSERIAL PRIMARY KEY,
    code CITEXT UNIQUE NOT NULL,
    description TEXT,
    enabled_globally BOOLEAN NOT NULL DEFAULT FALSE,
    enabled_for_tenants BIGINT[],
    rollout_percent INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS deployment (
    id BIGSERIAL PRIMARY KEY,
    environment TEXT NOT NULL,
    region TEXT NOT NULL,
    cluster TEXT NOT NULL,
    deployment_type TEXT NOT NULL,
    primary_database_host TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decommissioned_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS service_release (
    id BIGSERIAL PRIMARY KEY,
    service_name TEXT NOT NULL,
    version TEXT NOT NULL,
    image_digest TEXT NOT NULL,
    git_sha TEXT,
    released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rollout_status TEXT NOT NULL,
    canary_percent INTEGER,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS tenant_quota (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenant(id),
    quota_type TEXT NOT NULL,
    quota_value BIGINT NOT NULL,
    consumed_value BIGINT NOT NULL DEFAULT 0,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, quota_type, period_start)
);

-- ============================================================================
-- Bookkeeping: record this migration
-- ============================================================================

INSERT INTO schema_migration (version, applied_by, checksum)
VALUES ('wms_v1_initial', 'casemaster-wms', 'sha256:initial')
ON CONFLICT (version) DO NOTHING;
