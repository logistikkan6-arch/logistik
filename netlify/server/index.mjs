import { getUser } from '@netlify/identity'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/netlify-db'
import * as schema from '../../db/schema.ts'
import { WarehouseError, closeOrder, createOrder, history, id, itemFields, locationFields, moveAsset, recordStock, snapshot, text } from './warehouse.mjs'

let db
const database = () => (db ??= drizzle({ schema }))
const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })

async function account(request) {
  const current = await getUser()
  if (current) return current
  const session = request.headers.get('cookie')?.match(/(?:^|;\s*)nf_jwt=([^;]+)/)?.[1]
  if (!session || !process.env.URL) return null
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(session)) return null
  const identity = await fetch(new URL('/.netlify/identity/user', process.env.URL), {
    headers: { Authorization: `Bearer ${session}` }, redirect: 'error', signal: AbortSignal.timeout(5000),
  })
  if (identity.status === 401 || identity.status === 403) return null
  if (!identity.ok) throw new WarehouseError('Layanan login belum tersedia. Coba lagi nanti.', 503)
  const user = await identity.json()
  return user.id ? { id: user.id, email: user.email, roles: user.app_metadata?.roles, name: user.user_metadata?.full_name } : null
}

async function body(request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new WarehouseError('Format permintaan tidak valid.', 415)
  if (!request.body) throw new WarehouseError('Permintaan kosong.')
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let raw = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    received += value.length
    if (received > 256_000) {
      await reader.cancel()
      throw new WarehouseError('Ukuran permintaan terlalu besar.', 413)
    }
    raw += decoder.decode(value, { stream: true })
  }
  try {
    const parsed = JSON.parse(raw + decoder.decode())
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    throw new WarehouseError('Data JSON tidak valid.')
  }
  throw new WarehouseError('Data tidak valid.')
}

const adminOnly = (admin) => {
  if (!admin) throw new WarehouseError('Tindakan ini hanya tersedia untuk admin.', 403)
}

function sameOrigin(request, url) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  const site = request.headers.get('sec-fetch-site')
  if (site) return site === 'same-origin'
  const publicUrls = [url.origin, process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]
  return publicUrls.some((candidate) => URL.canParse(candidate ?? '') && new URL(candidate).origin === origin)
}

export default async function handler(request) {
  try {
    const url = new URL(request.url)
    const { pathname, searchParams } = url
    const { method } = request
    if (!pathname.startsWith('/api/')) return new Response(null, { status: 404 })
    if (method !== 'GET' && (method !== 'POST' || !sameOrigin(request, url))) {
      return reply({ error: 'Permintaan tidak diizinkan.' }, 403)
    }
    const user = await account(request)
    if (!user?.id || !user.email) return reply({ error: 'Silakan masuk kembali.' }, 401)
    const roles = Array.isArray(user.roles) ? user.roles : []
    const admin = roles.includes('admin')
    if (!admin && !roles.includes('operator')) return reply({ error: 'Akun belum memiliki akses gudang. Hubungi admin untuk mengaktifkan peran akun.' }, 403)
    if (method === 'GET' && pathname === '/api/session') return reply({ name: user.name || user.email, email: user.email, admin })
    if (method === 'GET' && pathname === '/api/warehouse') return reply(await snapshot(database()))
    if (method === 'GET' && pathname === '/api/history') return reply(await history(database(), searchParams))
    if (method !== 'POST') return reply({ error: 'Halaman tidak ditemukan.' }, 404)

    const data = await body(request)
    const actor = user.email
    const orderRoute = pathname.match(/^\/api\/orders\/([^/]+)$/)
    if (pathname === '/api/stock') {
      if (data.kind === 'count') adminOnly(admin)
      await database().transaction((tx) => recordStock(tx, data, actor))
    } else if (pathname === '/api/orders') {
      await createOrder(database(), data, actor)
    } else if (orderRoute) {
      if (data.action === 'cancel') adminOnly(admin)
      await closeOrder(database(), orderRoute[1], data, actor)
    } else if (pathname === '/api/assets/move') {
      await moveAsset(database(), data, actor)
    } else if (pathname === '/api/assets') {
      adminOnly(admin)
      await database().insert(schema.assets).values({ name: text(data.name, 'Nama aset'), vendor: text(data.vendor, 'Vendor'), unit: text(data.unit, 'Satuan', 30) })
    } else if (pathname === '/api/items' || pathname === '/api/locations') {
      adminOnly(admin)
      const isItem = pathname === '/api/items'
      const table = isItem ? schema.items : schema.locations
      const fields = isItem ? itemFields(data) : locationFields(data)
      if (data.id) {
        const updated = await database().update(table).set(fields).where(eq(table.id, id(data.id))).returning({ id: table.id })
        if (!updated.length) throw new WarehouseError('Data tidak ditemukan.', 404)
      } else await database().insert(table).values(fields)
    } else if (pathname === '/api/items/import') {
      adminOnly(admin)
      if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 500) throw new WarehouseError('Impor harus berisi 1–500 baris barang.')
      const entries = data.items.map((entry, index) => {
        try { return itemFields(entry) } catch (error) { throw new WarehouseError(`Baris data ${index + 1}: ${error.message}`) }
      })
      const inserted = await database().insert(schema.items).values(entries).onConflictDoNothing({ target: schema.items.sku }).returning({ id: schema.items.id })
      return reply({ inserted: inserted.length, skipped: entries.length - inserted.length })
    } else return reply({ error: 'Halaman tidak ditemukan.' }, 404)
    return reply({ ok: true })
  } catch (error) {
    if (error instanceof WarehouseError) return reply({ error: error.message }, error.status)
    if ((error.cause?.code ?? error.code) === '23505') return reply({ error: 'Kode atau nama tersebut sudah digunakan.' }, 409)
    return reply({ error: 'Layanan gudang belum dapat memproses permintaan. Coba lagi nanti.' }, 503)
  }
}
