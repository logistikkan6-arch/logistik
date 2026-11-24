export const views = {
  overview: ['Ringkasan', 'layout-dashboard'], inventory: ['Persediaan', 'boxes'], locations: ['Lokasi & barcode', 'warehouse'],
  movement: ['Kartu stok', 'clipboard-list'], orders: ['Pesanan tertunda', 'truck'], assets: ['Aset vendor', 'package-check'], reports: ['Laporan', 'chart-no-axes-combined'],
}

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
export const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`
const numberFormat = new Intl.NumberFormat('id-ID')
export const num = (value) => numberFormat.format(Number(value) || 0)
const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' })
export const date = (value) => value ? dateFormat.format(new Date(value)) : '—'
export const wibDay = (time = Date.now()) => new Date(time + 7 * 3600000).toISOString().slice(0, 10)
export const formatDelta = (value) => `<b class="${value < 0 ? 'negative' : 'positive'}">${value > 0 ? '+' : ''}${num(value)}</b>`
export const nameCell = (name, sub = '') => `<strong>${esc(name || '—')}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}`
export const button = (label, action, symbol = '', style = 'secondary', rowId = '', disabled = false) => `<button type="button" class="button ${style}" data-action="${action}"${rowId ? ` data-id="${esc(rowId)}"` : ''}${disabled ? ' disabled' : ''}>${symbol ? icon(symbol) : ''}${esc(label)}</button>`
export const empty = (title, description, action = '', symbol = 'box') => `<div class="empty">${icon(symbol)}<strong>${esc(title)}</strong><p>${esc(description)}</p>${action}</div>`
export const table = (headings, rows, fallback) => rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr>${headings.map((title) => `<th scope="col">${esc(title)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : fallback
export const panel = (title, description, content, actions = '') => `<section class="panel"><div class="panel-heading"><div><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>${content}</section>`
export const intro = (title, description, actions = '') => `<div class="view-header"><div class="title-block"><p class="section-tag">OPERASIONAL GUDANG</p><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`
export const pill = (label, style = '') => `<span class="pill ${style}">${esc(label)}</span>`
export const kind = (value) => value === 'in' ? pill('Masuk', 'in') : value === 'out' ? pill('Keluar', 'out') : pill('Opname')

export function indexes(data) {
  const itemById = new Map(data.items.map((item) => [item.id, item]))
  const locationById = new Map(data.locations.map((location) => [location.id, location]))
  const totals = new Map()
  const usable = new Map()
  const itemCounts = new Map()
  const stockByLocation = new Map()
  const today = wibDay()
  for (const row of data.stock) {
    totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.quantity)
    if (!row.expiry || row.expiry >= today) usable.set(row.itemId, (usable.get(row.itemId) ?? 0) + row.quantity)
    if (!itemCounts.has(row.locationId)) itemCounts.set(row.locationId, new Set())
    itemCounts.get(row.locationId).add(row.itemId)
    if (!stockByLocation.has(row.locationId)) stockByLocation.set(row.locationId, [])
    stockByLocation.get(row.locationId).push(row)
  }
  return { itemById, locationById, totals, usable, itemCounts, stockByLocation }
}

export function stockTable(rows, context) {
  return table(['Barang', 'Lokasi', 'Lot', 'Kedaluwarsa', 'Saldo'], rows.map((row) => {
    const item = context.itemById.get(row.itemId)
    const location = context.locationById.get(row.locationId)
    return [nameCell(item?.name, item?.sku), esc(location?.code ?? '—'), esc(row.lot || '—'), date(row.expiry), `${num(row.quantity)} ${esc(item?.unit)}`]
  }), empty('Belum ada saldo di sini', 'Catat barang masuk untuk menambah stok.'))
}

export function movementTable(rows, context, full = false) {
  const headings = ['Tanggal', 'Barang', 'Lokasi', 'Jenis', 'Perubahan']
  if (full) headings.push('Saldo lot', 'Petugas / catatan')
  return table(headings, rows.map((row) => {
    const item = context.itemById.get(row.itemId)
    const location = context.locationById.get(row.locationId)
    const cells = [date(row.createdAt), nameCell(item?.name, row.lot ? `Lot ${row.lot}` : item?.sku), esc(location?.code ?? '—'), kind(row.kind), formatDelta(row.delta)]
    if (full) cells.push(num(row.balance), nameCell(row.actor, row.note))
    return cells
  }), empty('Belum ada transaksi', 'Transaksi yang tercatat akan muncul di sini.', '', 'clipboard-list'))
}

export function csvDownload(name, headings, rows) {
  const cell = (value) => {
    const raw = String(value ?? '')
    const safe = typeof value !== 'number' && /^[\s]*[=+\-@\t\r\n]/.test(raw) ? `'${raw}` : raw
    return `"${safe.replaceAll('"', '""')}"`
  }
  const file = new Blob(['\ufeff', [headings, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(file)
  const link = Object.assign(document.createElement('a'), { href: url, download: `${name}.csv` })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function readMasterCsv(raw) {
  const input = raw.replace(/^\ufeff/, '')
  const separator = input.split(/\r?\n/, 1)[0].includes(';') ? ';' : ','
  const records = []
  let row = []
  let field = ''
  let quoted = false
  let justClosed = false
  for (let index = 0; index <= input.length; index++) {
    const character = input[index] ?? '\n'
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { field += '"'; index++ }
      else if (character === '"') { quoted = false; justClosed = true }
      else field += character
    } else if (character === separator || character === '\n' || (character === '\r' && input[index + 1] !== '\n')) {
      row.push(field.trim())
      field = ''
      justClosed = false
      if (character !== separator) {
        if (row.some(Boolean)) records.push(row)
        row = []
      }
    } else if (character === '\r') continue
    else if (character === '"' && !field && !justClosed) quoted = true
    else if (justClosed || character === '"') throw new Error('Format tanda kutip CSV tidak valid.')
    else field += character
  }
  if (quoted || records.length < 2 || records.length > 501) throw new Error('CSV harus memuat header dan 1–500 baris data yang valid.')
  const [headings, ...entries] = records
  const expected = ['sku', 'nama', 'kategori', 'satuan', 'stok_minimum', 'waktu_tunggu']
  if (headings.map((value) => value.toLowerCase()).join(',') !== expected.join(',')) throw new Error(`Urutan kolom: ${expected.join(', ')}.`)
  return entries.map(([sku, name, category, unit, minimum, leadDays, ...extra], index) => {
    if (extra.length || entries[index].length !== expected.length) throw new Error(`Jumlah kolom tidak sesuai pada baris ${index + 2}.`)
    return { sku, name, category, unit, minimum, leadDays }
  })
}
