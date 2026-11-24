import { and, asc, desc, eq, gte, sql } from 'drizzle-orm'
import { assetMovements, assets, items, locations, movements, orders, stock } from '../../db/schema.ts'

export const limitQuantity = 1_000_000_000

export class WarehouseError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

export function text(value, label, limit = 120, required = true) {
  const result = typeof value === 'string' ? value.trim() : ''
  if ((required && !result) || result.length > limit) throw new WarehouseError(`${label} tidak valid.`)
  return result
}

export function whole(value, label, min = 0, max = limitQuantity) {
  if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value).trim())) throw new WarehouseError(`${label} harus berupa bilangan bulat.`)
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new WarehouseError(`${label} harus antara ${min} dan ${max}.`)
  return result
}

export function id(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)) throw new WarehouseError('Pilihan data tidak valid.')
  return value
}

export function calendarDate(value) {
  if (!value) return ''
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new WarehouseError('Tanggal tidak valid.')
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) throw new WarehouseError('Tanggal tidak valid.')
  return value
}

function code(value, label) {
  const result = text(value, label, 40).toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9_.-]*$/.test(result)) throw new WarehouseError(`${label} hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung.`)
  return result
}

export function itemFields(data) {
  if (!data || typeof data !== 'object') throw new WarehouseError('Baris barang tidak valid.')
  return {
    sku: code(data.sku, 'SKU'), name: text(data.name, 'Nama barang'),
    category: text(data.category, 'Kategori', 60), unit: text(data.unit, 'Satuan', 30),
    minimum: whole(data.minimum || 0, 'Stok minimum'), leadDays: whole(data.leadDays || 0, 'Waktu tunggu', 0, 365),
  }
}

export function locationFields(data) {
  return { code: code(data.code, 'Kode lokasi'), name: text(data.name, 'Nama lokasi'), zone: text(data.zone, 'Zona', 80, false) }
}

function direction(value) {
  if (value !== 'in' && value !== 'out') throw new WarehouseError('Pilih barang masuk atau keluar.')
  return value
}

export async function snapshot(db) {
  const monthAgo = new Date(Date.now() - 30 * 86400000)
  const firstDay = new Date(Date.now() - 7 * 86400000)
  const movementDay = sql`to_char(${movements.createdAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`
  const [itemRows, locationRows, stockRows, recent, orderRows, closedOrders, assetRows, assetHistory, demand, flow] = await Promise.all([
    db.select().from(items).orderBy(asc(items.name)),
    db.select().from(locations).orderBy(asc(locations.code)),
    db.select().from(stock).where(sql`${stock.quantity} > 0`),
    db.select().from(movements).orderBy(desc(movements.createdAt), desc(movements.id)).limit(15),
    db.select().from(orders).where(eq(orders.status, 'pending')).orderBy(asc(orders.dueDate), desc(orders.createdAt)),
    db.select().from(orders).where(sql`${orders.status} <> 'pending'`).orderBy(desc(orders.closedAt)).limit(20),
    db.select().from(assets).orderBy(asc(assets.vendor), asc(assets.name)),
    db.select().from(assetMovements).orderBy(desc(assetMovements.createdAt), desc(assetMovements.id)).limit(20),
    db.select({ itemId: movements.itemId, units: sql`sum(-${movements.delta})::text` })
      .from(movements).where(and(eq(movements.kind, 'out'), gte(movements.createdAt, monthAgo))).groupBy(movements.itemId),
    db.select({ day: movementDay, kind: movements.kind, units: sql`sum(abs(${movements.delta}))::text` })
      .from(movements).where(and(gte(movements.createdAt, firstDay), sql`${movements.kind} in ('in', 'out')`)).groupBy(movementDay, movements.kind),
  ])
  return { items: itemRows, locations: locationRows, stock: stockRows, recent, orders: orderRows, closedOrders, assets: assetRows, assetHistory, demand, flow }
}

export async function recordStock(tx, data, actor, orderId = null) {
  const itemId = id(data.itemId)
  const locationId = id(data.locationId)
  const kind = data.kind === 'count' ? 'count' : direction(data.kind)
  const quantity = whole(data.quantity, 'Jumlah', kind === 'count' ? 0 : 1)
  const lot = text(data.lot, 'Nomor lot', 60, false)
  const expiry = calendarDate(data.expiry)
  const note = text(data.note, 'Catatan', 240, kind === 'count')

  const [item] = await tx.select({ id: items.id }).from(items).where(eq(items.id, itemId)).for('update')
  const [location] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, locationId))
  if (!item || !location) throw new WarehouseError('Barang atau lokasi tidak ditemukan.', 404)

  const rows = await tx.select().from(stock).where(and(eq(stock.itemId, itemId), eq(stock.locationId, locationId)))
    .orderBy(sql`nullif(${stock.expiry}, '') asc nulls last`, asc(stock.lot), asc(stock.id))
  const base = { itemId, locationId, kind, note, actor, orderId }
  if (kind === 'out') {
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
    const candidates = rows.filter((row) => row.quantity > 0 && (!row.expiry || row.expiry >= today) && (!lot || row.lot === lot) && (!expiry || row.expiry === expiry))
    if (candidates.reduce((total, row) => total + row.quantity, 0) < quantity) throw new WarehouseError('Stok layak kirim di lokasi atau lot yang dipilih tidak mencukupi.', 409)
    let remaining = quantity
    const entries = []
    for (const row of candidates) {
      if (!remaining) break
      const deduction = Math.min(remaining, row.quantity)
      const balance = row.quantity - deduction
      await tx.update(stock).set({ quantity: balance }).where(eq(stock.id, row.id))
      entries.push({ ...base, lot: row.lot, expiry: row.expiry, delta: -deduction, balance })
      remaining -= deduction
    }
    await tx.insert(movements).values(entries)
    return
  }

  const existing = rows.find((row) => row.lot === lot && row.expiry === expiry)
  const previous = existing?.quantity ?? 0
  const balance = kind === 'count' ? quantity : previous + quantity
  if (balance > limitQuantity) throw new WarehouseError('Kapasitas saldo per lot terlampaui.', 409)
  if (existing) await tx.update(stock).set({ quantity: balance }).where(eq(stock.id, existing.id))
  else if (balance) await tx.insert(stock).values({ itemId, locationId, lot, expiry, quantity: balance })
  await tx.insert(movements).values({ ...base, lot, expiry, delta: balance - previous, balance })
}

export async function createOrder(db, data, actor) {
  const itemId = id(data.itemId)
  const locationId = id(data.locationId)
  const [item, location] = await Promise.all([
    db.select({ id: items.id }).from(items).where(eq(items.id, itemId)),
    db.select({ id: locations.id }).from(locations).where(eq(locations.id, locationId)),
  ])
  if (!item.length || !location.length) throw new WarehouseError('Barang atau lokasi tidak ditemukan.', 404)
  await db.insert(orders).values({
    itemId, locationId, direction: direction(data.direction), quantity: whole(data.quantity, 'Jumlah', 1),
    partner: text(data.partner, 'Mitra'), reference: text(data.reference, 'Referensi', 100, false),
    dueDate: calendarDate(data.dueDate) || null, createdBy: actor,
  })
}

export async function closeOrder(db, orderId, data, actor) {
  const action = data.action
  if (!['realize', 'cancel'].includes(action)) throw new WarehouseError('Tindakan tidak valid.')
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id(orderId))).for('update')
    if (!order) throw new WarehouseError('Pesanan tidak ditemukan.', 404)
    if (order.status !== 'pending') throw new WarehouseError('Pesanan sudah ditutup. Muat ulang daftar.', 409)
    if (action === 'realize') {
      await recordStock(tx, { ...order, lot: data.lot, expiry: data.expiry, kind: order.direction, note: `Realisasi ${order.reference || order.partner}` }, actor, order.id)
    }
    await tx.update(orders).set({ status: action === 'realize' ? 'realized' : 'cancelled', closedBy: actor, closedAt: new Date() }).where(eq(orders.id, order.id))
  })
}

export async function moveAsset(db, data, actor) {
  const assetId = id(data.assetId)
  const sign = direction(data.direction) === 'in' ? 1 : -1
  const delta = sign * whole(data.quantity, 'Jumlah', 1)
  const note = text(data.note, 'Catatan', 240, false)
  await db.transaction(async (tx) => {
    const [asset] = await tx.select().from(assets).where(eq(assets.id, assetId)).for('update')
    if (!asset) throw new WarehouseError('Aset tidak ditemukan.', 404)
    const balance = asset.quantity + delta
    if (balance < 0 || balance > limitQuantity) throw new WarehouseError('Jumlah aset di luar saldo yang tersedia.', 409)
    await tx.update(assets).set({ quantity: balance }).where(eq(assets.id, assetId))
    await tx.insert(assetMovements).values({ assetId, delta, balance, note, actor })
  })
}

export async function history(db, search) {
  const filters = []
  if (search.get('item')) filters.push(eq(movements.itemId, id(search.get('item'))))
  if (search.get('location')) filters.push(eq(movements.locationId, id(search.get('location'))))
  const rawPage = search.get('page') ?? '0'
  const page = whole(rawPage, 'Halaman', 0, 20000)
  const pageSize = 50
  const rows = await db.select().from(movements).where(and(...filters)).orderBy(desc(movements.createdAt), desc(movements.id)).offset(page * pageSize).limit(pageSize + 1)
  return { rows: rows.slice(0, pageSize), more: rows.length > pageSize, page }
}
