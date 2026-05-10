import type { DashboardModel } from './DashboardComposer';

/**
 * Pre-built named layouts (§T9). Operators get one click to switch the
 * dashboard to a workflow-shaped view. Saved per-user but seeded from
 * one of these.
 */

export const PRESETS: Record<string, DashboardModel> = {
  inbound_manager: {
    tiles: {
      kpi_asn:    { id: 'kpi_asn',    type: 'kpi',  bo: 'wms/asn',          label: 'ASNs in flight', icon: 'inbox' },
      kpi_recv:   { id: 'kpi_recv',   type: 'kpi',  bo: 'wms/receipt',      label: 'Receipts',       icon: 'clipboardCheck' },
      kpi_putaway:{ id: 'kpi_putaway',type: 'kpi',  bo: 'wms/putaway_task', label: 'Putaway tasks',  icon: 'package' },
      list_asn:   { id: 'list_asn',   type: 'list', bo: 'wms/asn',          label: 'Pending ASNs',  pageSize: 8, sort: '-expected_arrival' },
      list_recv:  { id: 'list_recv',  type: 'list', bo: 'wms/receipt',      label: 'Recent receipts', pageSize: 8, sort: '-id' },
      note:       { id: 'note',       type: 'note', text: 'Inbound Manager preset — drag tiles to rearrange. Switch to Picker Floor in the dropdown.' },
    },
    layouts: {
      lg: [
        { i: 'kpi_asn',     x: 0, y: 0, w: 3, h: 2 },
        { i: 'kpi_recv',    x: 3, y: 0, w: 3, h: 2 },
        { i: 'kpi_putaway', x: 6, y: 0, w: 3, h: 2 },
        { i: 'note',        x: 9, y: 0, w: 3, h: 2 },
        { i: 'list_asn',    x: 0, y: 2, w: 6, h: 6 },
        { i: 'list_recv',   x: 6, y: 2, w: 6, h: 6 },
      ],
    },
  },
  picker_floor: {
    tiles: {
      kpi_orders: { id: 'kpi_orders', type: 'kpi',  bo: 'wms/sales_order',  label: 'Open orders',  icon: 'shoppingCart' },
      kpi_inv:    { id: 'kpi_inv',    type: 'kpi',  bo: 'wms/inventory',    label: 'Inventory rows', icon: 'boxes' },
      list_orders:{ id: 'list_orders',type: 'list', bo: 'wms/sales_order',  label: 'Recent orders', pageSize: 12, sort: '-id' },
      note:       { id: 'note',       type: 'note', text: 'Picker Floor preset — large tiles for shop-floor screens.' },
    },
    layouts: {
      lg: [
        { i: 'kpi_orders', x: 0, y: 0, w: 4, h: 3 },
        { i: 'kpi_inv',    x: 4, y: 0, w: 4, h: 3 },
        { i: 'note',       x: 8, y: 0, w: 4, h: 3 },
        { i: 'list_orders',x: 0, y: 3, w: 12, h: 7 },
      ],
    },
  },
  quality_lead: {
    tiles: {
      kpi_inv:   { id: 'kpi_inv',  type: 'kpi',  bo: 'wms/inventory', label: 'Inventory rows', icon: 'boxes' },
      list_inv:  { id: 'list_inv', type: 'list', bo: 'wms/inventory', label: 'Recent inventory', pageSize: 12, sort: '-last_movement_at' },
      note:      { id: 'note',     type: 'note', text: 'Quality Lead preset — focus on quality_status anomalies.' },
    },
    layouts: {
      lg: [
        { i: 'kpi_inv',  x: 0, y: 0, w: 4, h: 2 },
        { i: 'note',     x: 4, y: 0, w: 8, h: 2 },
        { i: 'list_inv', x: 0, y: 2, w: 12, h: 8 },
      ],
    },
  },
};
