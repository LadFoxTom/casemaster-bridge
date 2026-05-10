/**
 * In-memory seed for the demo. A curated slice of the Casemaster-WMS
 * schema: enough BOs and rows to make every UI pillar feel real, but
 * small enough that the entire dataset fits in a Vercel function.
 *
 * BOs included:
 *   wms/warehouse, wms/location, wms/partner, wms/item,
 *   wms/inventory, wms/asn, wms/asn_line, wms/receipt, wms/receipt_line,
 *   wms/putaway_task, wms/sales_order, wms/sales_order_line.
 *
 * Page-action handlers implement the WMS receive flow against the same
 * in-memory store, so the SPA's "Receive against ASN" button truly
 * persists rows you can see refresh in the inventory grid.
 */

export function wmsSeed() {
  // ----- attribute templates ------------------------------------------------
  const idAttr   = { name: 'id',         label: 'Id',         type: 'long',    required: true,  readOnly: true };
  const tsAttr   = (name, label) => ({ name, label, type: 'timestamp' });
  const strAttr  = (name, label, opts = {}) => ({ name, label, type: 'string', ...opts });
  const numAttr  = (name, label, opts = {}) => ({ name, label, type: 'decimal', ...opts });
  const fkAttr   = (name, label, fk) => ({ name, label, type: 'long', fk });

  // ----- BO defs -----------------------------------------------------------
  const bos = [
    {
      name: 'wms/warehouse', label: 'Warehouse', table: 'warehouse', primaryKey: 'id',
      attributes: [
        idAttr,
        strAttr('code', 'Code', { required: true }),
        strAttr('name', 'Name', { required: true }),
        strAttr('city', 'City'),
        strAttr('country_code', 'Country'),
        tsAttr('created_at', 'Created at'),
      ],
      groups: {
        label: ['name'], list: ['code', 'name', 'city', 'country_code'],
        description: ['code', 'name', 'city', 'country_code'],
        search: ['code', 'name'],
      },
      rows: [
        { id: 1, code: 'WH-EU-01', name: 'Brussels DC',  city: 'Brussels',  country_code: 'BE', created_at: '2025-09-01T08:00:00Z', updated_at: '2025-09-01T08:00:00Z' },
        { id: 2, code: 'WH-EU-02', name: 'Frankfurt DC', city: 'Frankfurt', country_code: 'DE', created_at: '2025-09-01T08:00:00Z', updated_at: '2025-09-01T08:00:00Z' },
      ],
    },
    {
      name: 'wms/location', label: 'Location', table: 'location', primaryKey: 'id',
      attributes: [
        idAttr,
        fkAttr('warehouse_id', 'Warehouse', 'wms/warehouse'),
        strAttr('code', 'Code'),
        strAttr('zone', 'Zone'),
        strAttr('aisle', 'Aisle'),
        strAttr('bay', 'Bay'),
        strAttr('level', 'Level'),
        strAttr('location_type', 'Type', { enumValues: ['STAGE_IN', 'STAGE_OUT', 'STORAGE', 'RECEIVING'] }),
        strAttr('status', 'Status', { enumValues: ['AVAILABLE', 'BLOCKED', 'FULL'] }),
      ],
      groups: {
        label: ['code'],
        list: ['code', 'warehouse_id', 'zone', 'location_type', 'status'],
        description: ['code', 'warehouse_id', 'zone', 'aisle', 'bay', 'level', 'location_type', 'status'],
        search: ['code', 'zone'],
      },
      rows: makeLocations(),
    },
    {
      name: 'wms/partner', label: 'Partner', table: 'partner', primaryKey: 'id',
      attributes: [
        idAttr,
        strAttr('code', 'Code'),
        strAttr('name', 'Name'),
        strAttr('partner_type', 'Type', { enumValues: ['CUSTOMER', 'SUPPLIER', 'CARRIER'] }),
        strAttr('country_code', 'Country'),
      ],
      groups: {
        label: ['name'],
        list: ['code', 'name', 'partner_type', 'country_code'],
        description: ['code', 'name', 'partner_type', 'country_code'],
        search: ['code', 'name'],
      },
      rows: [
        { id: 101, code: 'SUP-001', name: 'Acme Components',     partner_type: 'SUPPLIER', country_code: 'NL', created_at: '2025-09-02T10:00:00Z', updated_at: '2025-09-02T10:00:00Z' },
        { id: 102, code: 'SUP-002', name: 'Globex Industries',   partner_type: 'SUPPLIER', country_code: 'DE', created_at: '2025-09-02T10:00:00Z', updated_at: '2025-09-02T10:00:00Z' },
        { id: 103, code: 'SUP-003', name: 'Initech',             partner_type: 'SUPPLIER', country_code: 'US', created_at: '2025-09-02T10:00:00Z', updated_at: '2025-09-02T10:00:00Z' },
        { id: 201, code: 'CUS-001', name: 'Stark Logistics',     partner_type: 'CUSTOMER', country_code: 'BE', created_at: '2025-09-02T10:00:00Z', updated_at: '2025-09-02T10:00:00Z' },
        { id: 202, code: 'CUS-002', name: 'Wayne Enterprises',   partner_type: 'CUSTOMER', country_code: 'FR', created_at: '2025-09-02T10:00:00Z', updated_at: '2025-09-02T10:00:00Z' },
        { id: 203, code: 'CUS-003', name: 'Umbrella Foods',      partner_type: 'CUSTOMER', country_code: 'IT', created_at: '2025-09-02T10:00:00Z', updated_at: '2025-09-02T10:00:00Z' },
        { id: 301, code: 'CAR-001', name: 'DHL Parcel',          partner_type: 'CARRIER',  country_code: 'NL', created_at: '2025-09-02T10:00:00Z', updated_at: '2025-09-02T10:00:00Z' },
      ],
    },
    {
      name: 'wms/item', label: 'Item', table: 'item', primaryKey: 'id',
      attributes: [
        idAttr,
        strAttr('sku', 'SKU', { required: true }),
        strAttr('name', 'Name', { required: true }),
        strAttr('description', 'Description'),
        strAttr('uom_code', 'UoM'),
        numAttr('weight_kg', 'Weight (kg)', { scale: 3 }),
        strAttr('category', 'Category'),
        strAttr('status', 'Status', { enumValues: ['ACTIVE', 'DISCONTINUED', 'PHASE_OUT'] }),
      ],
      groups: {
        label: ['name'],
        list: ['sku', 'name', 'category', 'uom_code', 'status'],
        description: ['sku', 'name', 'description', 'uom_code', 'weight_kg', 'category', 'status'],
        search: ['sku', 'name'],
      },
      rows: makeItems(),
    },
    {
      name: 'wms/inventory', label: 'Inventory', table: 'inventory', primaryKey: 'id',
      attributes: [
        idAttr,
        fkAttr('warehouse_id', 'Warehouse', 'wms/warehouse'),
        fkAttr('location_id',  'Location',  'wms/location'),
        fkAttr('item_id',      'Item',      'wms/item'),
        strAttr('lot_number',  'Lot'),
        numAttr('qty_on_hand', 'On hand', { scale: 6 }),
        numAttr('qty_reserved', 'Reserved', { scale: 6 }),
        numAttr('qty_on_hold', 'On hold', { scale: 6 }),
        strAttr('quality_status', 'Quality', { enumValues: ['AVAILABLE', 'QUARANTINE', 'DAMAGED'] }),
        strAttr('uom_code', 'UoM'),
        tsAttr('last_movement_at', 'Last movement'),
      ],
      groups: {
        label: ['lot_number'],
        list: ['item_id', 'location_id', 'qty_on_hand', 'qty_reserved', 'quality_status', 'lot_number'],
        description: ['warehouse_id', 'location_id', 'item_id', 'lot_number', 'qty_on_hand', 'qty_reserved', 'qty_on_hold', 'quality_status', 'uom_code'],
        search: ['lot_number'],
      },
      rows: makeInventory(),
    },
    {
      name: 'wms/asn', label: 'ASN', table: 'asn', primaryKey: 'id',
      attributes: [
        idAttr,
        strAttr('asn_number', 'ASN #', { required: true }),
        fkAttr('supplier_id', 'Supplier', 'wms/partner'),
        fkAttr('warehouse_id', 'Warehouse', 'wms/warehouse'),
        tsAttr('expected_arrival', 'Expected'),
        tsAttr('actual_arrival', 'Actual'),
        strAttr('status', 'Status', { enumValues: ['DRAFT','CONFIRMED','IN_TRANSIT','ARRIVED','RECEIVING','CLOSED'] }),
        numAttr('total_units', 'Units'),
      ],
      groups: {
        label: ['asn_number'],
        list: ['asn_number', 'supplier_id', 'warehouse_id', 'expected_arrival', 'status', 'total_units'],
        description: ['asn_number', 'supplier_id', 'warehouse_id', 'expected_arrival', 'actual_arrival', 'status', 'total_units'],
        search: ['asn_number'],
      },
      rows: makeAsns(),
    },
    {
      name: 'wms/asn_line', label: 'ASN line', table: 'asn_line', primaryKey: 'id',
      attributes: [
        idAttr,
        fkAttr('asn_id', 'ASN', 'wms/asn'),
        numAttr('line_number', 'Line #'),
        fkAttr('item_id', 'Item', 'wms/item'),
        numAttr('expected_qty', 'Expected', { scale: 6 }),
        numAttr('received_qty', 'Received', { scale: 6 }),
        strAttr('uom_code', 'UoM'),
        strAttr('lot_number', 'Lot'),
      ],
      groups: {
        label: ['line_number'],
        list: ['line_number', 'item_id', 'expected_qty', 'received_qty', 'uom_code', 'lot_number'],
        description: ['asn_id', 'line_number', 'item_id', 'expected_qty', 'received_qty', 'uom_code', 'lot_number'],
        search: ['lot_number'],
      },
      rows: makeAsnLines(),
    },
    {
      name: 'wms/receipt', label: 'Receipt', table: 'receipt', primaryKey: 'id',
      attributes: [
        idAttr,
        strAttr('receipt_number', 'Receipt #'),
        fkAttr('asn_id', 'ASN', 'wms/asn'),
        fkAttr('warehouse_id', 'Warehouse', 'wms/warehouse'),
        tsAttr('started_at', 'Started'),
        tsAttr('completed_at', 'Completed'),
        strAttr('status', 'Status', { enumValues: ['OPEN','IN_PROGRESS','COMPLETED','CLOSED'] }),
      ],
      groups: {
        label: ['receipt_number'],
        list: ['receipt_number', 'asn_id', 'warehouse_id', 'started_at', 'completed_at', 'status'],
        description: ['receipt_number', 'asn_id', 'warehouse_id', 'started_at', 'completed_at', 'status'],
        search: ['receipt_number'],
      },
      rows: makeReceipts(),
    },
    {
      name: 'wms/putaway_task', label: 'Putaway task', table: 'putaway_task', primaryKey: 'id',
      attributes: [
        idAttr,
        fkAttr('warehouse_id', 'Warehouse', 'wms/warehouse'),
        fkAttr('item_id', 'Item', 'wms/item'),
        fkAttr('suggested_location_id', 'Suggested loc', 'wms/location'),
        fkAttr('actual_location_id', 'Actual loc', 'wms/location'),
        numAttr('qty', 'Qty', { scale: 6 }),
        strAttr('uom_code', 'UoM'),
        numAttr('priority', 'Priority'),
        strAttr('status', 'Status', { enumValues: ['OPEN','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED'] }),
        tsAttr('completed_at', 'Completed'),
      ],
      groups: {
        label: ['id'],
        list: ['id', 'item_id', 'suggested_location_id', 'qty', 'priority', 'status'],
        description: ['warehouse_id', 'item_id', 'suggested_location_id', 'actual_location_id', 'qty', 'uom_code', 'priority', 'status'],
        search: ['status'],
      },
      rows: makePutawayTasks(),
    },
    {
      name: 'wms/sales_order', label: 'Sales order', table: 'sales_order', primaryKey: 'id',
      attributes: [
        idAttr,
        strAttr('order_number', 'Order #'),
        fkAttr('customer_id', 'Customer', 'wms/partner'),
        fkAttr('warehouse_id', 'Warehouse', 'wms/warehouse'),
        tsAttr('order_date', 'Date'),
        tsAttr('promised_date', 'Promised'),
        strAttr('status', 'Status', { enumValues: ['IMPORTED','VALIDATED','ALLOCATED','RELEASED','IN_PICKING','PACKED','SHIPPED','CANCELLED'] }),
        numAttr('total_units', 'Units'),
      ],
      groups: {
        label: ['order_number'],
        list: ['order_number', 'customer_id', 'order_date', 'promised_date', 'status', 'total_units'],
        description: ['order_number', 'customer_id', 'warehouse_id', 'order_date', 'promised_date', 'status', 'total_units'],
        search: ['order_number'],
      },
      rows: makeOrders(),
    },
  ];

  // ----- pages / nav -------------------------------------------------------
  const pages = [
    { path: 'wms',           title: 'WMS Dashboard',  functions: ['main'], shape: 'dashboard',     icon: 'layout-dashboard' },
    { path: 'wms/inbound',   title: 'Inbound',        functions: ['main','asn','receive','receipt','putaway'], shape: 'master-detail', icon: 'package' },
    { path: 'wms/stock',     title: 'Stock',          functions: ['main','adjust','move'], shape: 'master-detail', icon: 'boxes', primaryBo: 'wms/inventory' },
    { path: 'wms/outbound',  title: 'Outbound',       functions: ['main','allocate','pick','ship'], shape: 'master-detail', icon: 'truck' },
    { path: 'wms/inventory', title: 'Inventory',      functions: ['main'], shape: 'list', primaryBo: 'wms/inventory', icon: 'boxes' },
    { path: 'wms/item',      title: 'Items',          functions: ['main'], shape: 'list', primaryBo: 'wms/item',     icon: 'tag' },
    { path: 'wms/location',  title: 'Locations',      functions: ['main'], shape: 'list', primaryBo: 'wms/location', icon: 'map-pin' },
    { path: 'wms/partner',   title: 'Partners',       functions: ['main'], shape: 'list', primaryBo: 'wms/partner',  icon: 'users' },
    { path: 'wms/asn',       title: 'ASNs',           functions: ['main'], shape: 'list', primaryBo: 'wms/asn',      icon: 'inbox' },
    { path: 'wms/receipt',   title: 'Receipts',       functions: ['main'], shape: 'list', primaryBo: 'wms/receipt',  icon: 'clipboard-check' },
    { path: 'wms/sales_order', title: 'Sales orders', functions: ['main'], shape: 'list', primaryBo: 'wms/sales_order', icon: 'shopping-cart' },
  ];

  const navigation = [
    { label: 'Dashboard',  path: '/admin/wms',           icon: 'layout-dashboard', order: 0 },
    {
      label: 'Inbound', icon: 'package', order: 10,
      children: [
        { label: 'Inbound center', path: '/admin/wms/inbound', icon: 'inbox' },
        { label: 'ASNs',           path: '/admin/wms/asn',     icon: 'inbox' },
        { label: 'Receipts',       path: '/admin/wms/receipt', icon: 'clipboard-check' },
      ],
    },
    {
      label: 'Stock', icon: 'boxes', order: 20,
      children: [
        { label: 'Inventory',  path: '/admin/wms/inventory', icon: 'boxes' },
        { label: 'Locations',  path: '/admin/wms/location',  icon: 'map-pin' },
        { label: 'Items',      path: '/admin/wms/item',      icon: 'tag' },
      ],
    },
    {
      label: 'Outbound', icon: 'truck', order: 30,
      children: [
        { label: 'Outbound center', path: '/admin/wms/outbound',     icon: 'truck' },
        { label: 'Sales orders',    path: '/admin/wms/sales_order', icon: 'shopping-cart' },
      ],
    },
    {
      label: 'Setup', icon: 'settings', order: 90,
      children: [
        { label: 'Partners',   path: '/admin/wms/partner',   icon: 'users' },
        { label: 'Warehouses', path: '/admin/wms/warehouse', icon: 'building' },
      ],
    },
  ];

  // ----- page-action handlers ---------------------------------------------
  const actions = {
    'wms/inbound:receive': (params, store) => {
      const asnId = Number(params.asn ?? params.asn_id);
      const asn = store.rows('wms/asn').find((r) => r.id === asnId);
      if (!asn) return { error: 'ASN not found' };
      const lines = store.rows('wms/asn_line').filter((l) => l.asn_id === asnId);
      const recvLoc = store.rows('wms/location').find((l) => l.warehouse_id === asn.warehouse_id && l.location_type === 'RECEIVING');
      if (!recvLoc) return { error: 'No receiving location available' };

      const rcptNumber = `RC-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${(store.rows('wms/receipt').length + 1).toString().padStart(3,'0')}`;
      const rcpt = store.insert('wms/receipt', {
        receipt_number: rcptNumber,
        asn_id: asnId,
        warehouse_id: asn.warehouse_id,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        status: 'COMPLETED',
      });

      let linesReceived = 0;
      let allComplete = true;
      for (const ln of lines) {
        const qty = Number(params[`qty_${ln.id}`] ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) {
          if (Number(ln.received_qty ?? 0) < Number(ln.expected_qty)) allComplete = false;
          continue;
        }
        const received = Number(ln.received_qty ?? 0) + qty;
        store.update('wms/asn_line', { id: ln.id, received_qty: received });
        store.insert('wms/inventory', {
          warehouse_id: asn.warehouse_id,
          location_id: recvLoc.id,
          item_id: ln.item_id,
          lot_number: params[`lot_${ln.id}`] || ln.lot_number,
          qty_on_hand: qty,
          qty_reserved: 0,
          qty_on_hold: 0,
          quality_status: 'AVAILABLE',
          uom_code: ln.uom_code,
          last_movement_at: new Date().toISOString(),
        });
        store.insert('wms/putaway_task', {
          warehouse_id: asn.warehouse_id,
          item_id: ln.item_id,
          suggested_location_id: recvLoc.id,
          qty,
          uom_code: ln.uom_code,
          priority: 50,
          status: 'OPEN',
        });
        linesReceived += 1;
        if (received < Number(ln.expected_qty)) allComplete = false;
      }
      store.update('wms/asn', {
        id: asnId,
        status: allComplete ? 'CLOSED' : 'RECEIVING',
        actual_arrival: new Date().toISOString(),
      });

      return {
        ok: true,
        message: `Receipt ${rcpt.receipt_number} posted; ${linesReceived} line(s) received.`,
        outputs: { act_rcpt_id: rcpt.id, act_lines_received: linesReceived, act_msg: `Receipt ${rcpt.receipt_number} posted` },
      };
    },
    'wms/stock:adjust': (params, store) => {
      const id = Number(params.id);
      const delta = Number(params.delta ?? 0);
      const reason = String(params.reason ?? 'manual');
      const inv = store.rows('wms/inventory').find((r) => r.id === id);
      if (!inv) return { error: 'inventory row not found' };
      const next = Number(inv.qty_on_hand) + delta;
      if (next < 0) return { error: 'Adjustment would make qty_on_hand negative' };
      store.update('wms/inventory', { id, qty_on_hand: next, last_movement_at: new Date().toISOString() });
      return { ok: true, message: `Adjusted by ${delta} (${reason}); new qty ${next}.` };
    },
  };

  return {
    appName: 'Casemaster-WMS Demo',
    bos,
    pages,
    navigation,
    actions,
    user: { id: 1, email: 'demo@casemaster.dev', name: 'Demo Operator', perms: ['*'] },
  };
}

// ============================================================================
// Generators
// ============================================================================

function makeLocations() {
  const out = [];
  let id = 1;
  for (const wh of [1, 2]) {
    out.push({ id: id++, warehouse_id: wh, code: `R-${wh}-IN`,    zone: 'RECV',  aisle: '00', bay: '01', level: '0', location_type: 'RECEIVING', status: 'AVAILABLE' });
    out.push({ id: id++, warehouse_id: wh, code: `R-${wh}-STG`,   zone: 'STAGE', aisle: '00', bay: '02', level: '0', location_type: 'STAGE_OUT', status: 'AVAILABLE' });
    for (const aisle of ['A', 'B', 'C']) {
      for (const bay of ['01','02','03','04']) {
        for (const level of ['0','1','2']) {
          out.push({ id: id++, warehouse_id: wh, code: `${aisle}-${bay}-${level}`, zone: 'STORE', aisle, bay, level, location_type: 'STORAGE', status: Math.random() > 0.92 ? 'BLOCKED' : 'AVAILABLE' });
        }
      }
    }
  }
  for (const r of out) { r.created_at = '2025-09-05T00:00:00Z'; r.updated_at = '2025-09-05T00:00:00Z'; }
  return out;
}

function makeItems() {
  const cats = ['Electronics', 'Apparel', 'Industrial', 'Food', 'Consumables'];
  const out = [];
  for (let i = 1; i <= 50; i++) {
    out.push({
      id: i,
      sku: `SKU-${1000 + i}`,
      name: `Item ${1000 + i}`,
      description: `Demo item #${1000 + i} — auto-generated for the seed.`,
      uom_code: 'EA',
      weight_kg: Number((0.1 + (i % 30) * 0.5).toFixed(3)),
      category: cats[i % cats.length],
      status: i % 23 === 0 ? 'PHASE_OUT' : 'ACTIVE',
      created_at: '2025-09-10T00:00:00Z', updated_at: '2025-09-10T00:00:00Z',
    });
  }
  return out;
}

function makeInventory() {
  const out = [];
  let id = 1;
  for (let item = 1; item <= 50; item++) {
    const placements = 1 + Math.floor(Math.random() * 4);
    for (let p = 0; p < placements; p++) {
      out.push({
        id: id++,
        warehouse_id: (item % 2) + 1,
        location_id:  3 + ((item * 7 + p) % 70),
        item_id:      item,
        lot_number:   `LOT-${2025}-${(item * 17 + p) % 999}`,
        qty_on_hand:  Math.round(Math.random() * 500),
        qty_reserved: Math.round(Math.random() * 50),
        qty_on_hold:  0,
        qty_in_transit: 0,
        quality_status: Math.random() > 0.95 ? 'QUARANTINE' : 'AVAILABLE',
        uom_code: 'EA',
        last_movement_at: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
        created_at: '2025-09-15T00:00:00Z', updated_at: '2025-09-15T00:00:00Z',
      });
    }
  }
  return out;
}

function makeAsns() {
  const out = [];
  const statuses = ['DRAFT','CONFIRMED','IN_TRANSIT','ARRIVED','RECEIVING','CLOSED'];
  for (let i = 1; i <= 18; i++) {
    const expected = new Date(Date.now() + (i % 7 - 3) * 86400000).toISOString();
    out.push({
      id: i,
      asn_number: `ASN-2026-${String(i).padStart(4, '0')}`,
      supplier_id: 100 + (i % 3) + 1,
      warehouse_id: (i % 2) + 1,
      expected_arrival: expected,
      actual_arrival: i % 4 === 0 ? expected : null,
      status: statuses[i % statuses.length],
      total_units: 50 + (i % 10) * 10,
      created_at: '2025-10-01T00:00:00Z', updated_at: '2025-10-01T00:00:00Z',
    });
  }
  return out;
}

function makeAsnLines() {
  const out = [];
  let id = 1;
  for (let asn = 1; asn <= 18; asn++) {
    const lines = 2 + (asn % 4);
    for (let l = 1; l <= lines; l++) {
      const expected = 10 + ((asn * l * 7) % 60);
      const received = (asn % 4 === 0) ? expected : Math.floor(Math.random() * expected);
      out.push({
        id: id++,
        asn_id: asn,
        line_number: l,
        item_id: ((asn + l * 3) % 50) + 1,
        expected_qty: expected,
        received_qty: received,
        uom_code: 'EA',
        lot_number: `LOT-2026-${String(asn).padStart(3, '0')}-${l}`,
        created_at: '2025-10-01T00:00:00Z', updated_at: '2025-10-01T00:00:00Z',
      });
    }
  }
  return out;
}

function makeReceipts() {
  const out = [];
  for (let i = 1; i <= 12; i++) {
    const started   = new Date(Date.now() - i * 86400000).toISOString();
    const completed = new Date(Date.now() - i * 86400000 + 3600 * 1000).toISOString();
    out.push({
      id: i,
      receipt_number: `RC-2026-${String(i).padStart(4, '0')}`,
      asn_id: ((i - 1) % 18) + 1,
      warehouse_id: (i % 2) + 1,
      started_at: started,
      completed_at: i % 5 === 0 ? null : completed,
      status: i % 5 === 0 ? 'IN_PROGRESS' : 'COMPLETED',
      created_at: started, updated_at: completed,
    });
  }
  return out;
}

function makePutawayTasks() {
  const out = [];
  for (let i = 1; i <= 25; i++) {
    out.push({
      id: i,
      warehouse_id: (i % 2) + 1,
      item_id: ((i * 5) % 50) + 1,
      suggested_location_id: 5 + (i % 60),
      actual_location_id: i % 4 === 0 ? 5 + (i % 60) : null,
      qty: 10 + (i % 7) * 5,
      uom_code: 'EA',
      priority: 50 + (i % 5) * 10,
      status: i % 4 === 0 ? 'COMPLETED' : (i % 3 === 0 ? 'IN_PROGRESS' : 'OPEN'),
      completed_at: i % 4 === 0 ? new Date(Date.now() - i * 3600 * 1000).toISOString() : null,
      created_at: '2025-10-15T00:00:00Z', updated_at: '2025-10-15T00:00:00Z',
    });
  }
  return out;
}

function makeOrders() {
  const out = [];
  const statuses = ['IMPORTED','VALIDATED','ALLOCATED','RELEASED','IN_PICKING','PACKED','SHIPPED'];
  for (let i = 1; i <= 30; i++) {
    out.push({
      id: i,
      order_number: `SO-2026-${String(i).padStart(5, '0')}`,
      customer_id: 200 + (i % 3) + 1,
      warehouse_id: (i % 2) + 1,
      order_date:    new Date(Date.now() - i * 86400000).toISOString(),
      promised_date: new Date(Date.now() + (i % 7) * 86400000).toISOString(),
      status: statuses[i % statuses.length],
      total_units: 5 + (i % 12) * 5,
      created_at: '2025-10-20T00:00:00Z', updated_at: '2025-10-20T00:00:00Z',
    });
  }
  return out;
}
