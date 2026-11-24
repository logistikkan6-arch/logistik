import { sql } from 'drizzle-orm'
import { check, date, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const items = pgTable('warehouse_items', {
  id: uuid().defaultRandom().primaryKey(),
  sku: text().notNull().unique(),
  name: text().notNull(),
  category: text().notNull(),
  unit: text().notNull(),
  minimum: integer().notNull().default(0),
  leadDays: integer('lead_days').notNull().default(7),
})

export const locations = pgTable('warehouse_locations', {
  id: uuid().defaultRandom().primaryKey(),
  code: text().notNull().unique(),
  name: text().notNull(),
  zone: text().notNull().default(''),
})

export const stock = pgTable('warehouse_stock', {
  id: uuid().defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  locationId: uuid('location_id').notNull().references(() => locations.id),
  lot: text().notNull().default(''),
  expiry: text().notNull().default(''),
  quantity: integer().notNull(),
}, (table) => [
  unique().on(table.itemId, table.locationId, table.lot, table.expiry),
  check('warehouse_stock_nonnegative', sql`${table.quantity} >= 0`),
])

export const orders = pgTable('warehouse_orders', {
  id: uuid().defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  locationId: uuid('location_id').notNull().references(() => locations.id),
  direction: text().notNull(),
  quantity: integer().notNull(),
  partner: text().notNull(),
  reference: text().notNull().default(''),
  dueDate: date('due_date'),
  status: text().notNull().default('pending'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedBy: text('closed_by'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (table) => [check('warehouse_order_quantity_positive', sql`${table.quantity} > 0`)])

export const movements = pgTable('warehouse_movements', {
  id: uuid().defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  locationId: uuid('location_id').notNull().references(() => locations.id),
  orderId: uuid('order_id').references(() => orders.id),
  kind: text().notNull(),
  delta: integer().notNull(),
  balance: integer().notNull(),
  lot: text().notNull().default(''),
  expiry: text().notNull().default(''),
  note: text().notNull().default(''),
  actor: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index().on(table.createdAt), index().on(table.itemId, table.createdAt)])

export const assets = pgTable('warehouse_assets', {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  vendor: text().notNull(),
  unit: text().notNull(),
  quantity: integer().notNull().default(0),
}, (table) => [
  unique().on(table.name, table.vendor),
  check('warehouse_assets_nonnegative', sql`${table.quantity} >= 0`),
])

export const assetMovements = pgTable('warehouse_asset_movements', {
  id: uuid().defaultRandom().primaryKey(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  delta: integer().notNull(),
  balance: integer().notNull(),
  note: text().notNull().default(''),
  actor: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index().on(table.createdAt)])
