import { button, date, empty, esc, formatDelta, icon, indexes, intro, kind, movementTable, nameCell, num, panel, pill, stockTable, table, wibDay } from './presentation.js'

const itemAction = (admin) => admin ? button('Tambah barang', 'item', 'plus', 'primary') : ''
const locationAction = (admin) => admin ? button('Tambah lokasi', 'location', 'plus', 'primary') : ''
const option = (value, label, active) => `<option value="${esc(value)}"${value === active ? ' selected' : ''}>${esc(label)}</option>`
export const itemOptions = (rows, active) => rows.map((row) => option(row.id, `${row.sku} · ${row.name}`, active)).join('')
export const locationOptions = (rows, active) => rows.map((row) => option(row.id, `${row.code} · ${row.name}`, active)).join('')

const metric = (label, value, symbol) => `<div class="metric"><span class="metric-icon">${icon(symbol)}</span><strong>${num(value)}</strong><p>${esc(label)}</p></div>`

function expiration(data, context) {
  const today = wibDay()
  const threshold = wibDay(Date.now() + 30 * 86400000)
  const due = data.stock.filter((row) => row.expiry && row.expiry <= threshold).sort((left, right) => left.expiry.localeCompare(right.expiry))
  return table(['Barang / lot', 'Lokasi', 'Kedaluwarsa', 'Saldo'], due.map((row) => {
    const item = context.itemById.get(row.itemId)
    return [nameCell(item?.name, row.lot), esc(context.locationById.get(row.locationId)?.code), pill(date(row.expiry), row.expiry < today ? 'alert' : 'pending'), `${num(row.quantity)} ${esc(item?.unit)}`]
  }), empty('Tidak ada peringatan', 'Tidak ada lot yang kedaluwarsa atau jatuh tempo dalam 30 hari.', '', 'calendar-clock'))
}

function overview(data, context, state) {
  const ready = data.items.length && data.locations.length
  const low = data.items.filter((item) => (context.usable.get(item.id) ?? 0) <= item.minimum).length
  const sync = `<span title="${state.lastSync ? esc(new Date(state.lastSync).toLocaleTimeString('id-ID')) : ''}" class="sync-state${state.stale ? ' stale' : ''}">${icon(state.stale ? 'triangle-alert' : 'circle-check')}${state.stale ? 'Belum sinkron' : 'Data tersinkron'}</span>`
  const next = !data.locations.length ? locationAction(state.account.admin) : itemAction(state.account.admin)
  return `${intro('Ringkasan gudang', 'Pantau kondisi persediaan dan aktivitas tim dalam satu tempat.', sync)}
    <section class="dashboard-banner"><div><p class="section-tag">${esc(date(wibDay()))} · WAKTU GUDANG (WIB)</p><h2>${ready ? 'Siap mencatat arus barang?' : 'Siapkan ruang kerja gudang'}</h2><p>${ready ? 'Setiap transaksi langsung memperbarui saldo tim.' : 'Tambahkan lokasi penyimpanan dan master barang untuk mulai mencatat stok.'}</p></div><div class="actions">${ready ? button('Catat barang masuk', 'stock-in', 'arrow-down-to-line', 'primary') + button('Barang keluar', 'stock-out', 'arrow-up-from-line') : next}</div></section>
    <div class="metric-grid">${metric('SKU terdaftar', data.items.length, 'boxes')}${metric('Lokasi penyimpanan', data.locations.length, 'warehouse')}${metric('Pesanan tertunda', data.orders.length, 'truck')}${metric('SKU pada / di bawah batas', low, 'triangle-alert')}</div>
    <div class="two-panel">${panel('Aktivitas terkini', 'Jejak transaksi terbaru dari seluruh lokasi.', movementTable(data.recent.slice(0, 8), context), button('Buka kartu stok', 'navigate', '', 'secondary', 'movement'))}${panel('Pantauan kedaluwarsa', 'Lot yang perlu diperiksa dalam 30 hari ke depan.', expiration(data, context))}</div>`
}

function inventory(data, context, state) {
  const items = data.items.filter((item) => [item.sku, item.name, item.category].some((field) => field.toLowerCase().includes(state.itemQuery.trim().toLowerCase())))
  return table(['Barang / SKU', 'Kategori', 'Stok terkini', 'Batas minimum', 'Status', 'Tindakan'], items.map((item) => {
    const quantity = context.totals.get(item.id) ?? 0
    const usable = context.usable.get(item.id) ?? 0
    return [nameCell(item.name, item.sku), esc(item.category), `${num(quantity)} ${esc(item.unit)}${usable !== quantity ? `<small>${num(usable)} layak kirim</small>` : ''}`, num(item.minimum), usable <= item.minimum ? pill('Stok rendah', 'pending') : pill('Tersedia', 'in'), `<div class="actions">${button('Lot', 'item-stock', '', 'secondary', item.id)}${state.account.admin ? button('Edit', 'item', 'pencil', 'secondary', item.id) : ''}</div>`]
  }), empty(data.items.length ? 'Barang tidak ditemukan' : 'Belum ada master barang', data.items.length ? 'Coba kata kunci lain.' : 'Daftarkan SKU sebelum mencatat transaksi.', data.items.length ? '' : itemAction(state.account.admin), 'boxes'))
}

function locationView(data, context, state) {
  const tiles = data.locations.map((location) => `<article class="location-tile"><div class="location-meta"><span class="metric-icon">${icon('warehouse')}</span><div><h2>${esc(location.name)}</h2><small>${esc(location.code)}${location.zone ? ` · ${esc(location.zone)}` : ''}</small></div></div><p class="subtle">${num(context.itemCounts.get(location.id)?.size ?? 0)} SKU dengan saldo</p><div class="actions">${button('Stok', 'location-stock', '', 'secondary', location.id)}${button('Label', 'label', 'barcode', 'secondary', location.id)}${state.account.admin ? button('Edit', 'location', 'pencil', 'secondary', location.id) : ''}</div></article>`)
  return `${intro('Lokasi & barcode', 'Kelola kontainer atau rak, lihat saldo per lokasi, dan cetak label.', locationAction(state.account.admin))}${tiles.length ? `<div class="tiles">${tiles.join('')}</div>` : panel('Daftar lokasi', '', empty('Belum ada lokasi', 'Tambahkan kontainer atau rak untuk mulai mencatat saldo.', locationAction(state.account.admin), 'warehouse'))}`
}

export function historyContent(data, context) {
  if (data.loading) return '<div class="loading-block" role="status" aria-label="Memuat kartu stok"></div>'
  if (data.error) return `<p class="form-message error" role="status">${esc(data.error)}</p>`
  return `${movementTable(data.rows, context, true)}<div class="pagination">${button('Sebelumnya', 'history-prev', 'arrow-left', 'secondary', '', data.page === 0)}<span class="pager-label">Halaman ${data.page + 1}</span>${button('Berikutnya', 'history-next', 'arrow-right', 'secondary', '', !data.more)}</div>`
}

function movementView(data, context, state) {
  const actions = button('Barang masuk', 'stock-in', 'arrow-down-to-line', 'primary') + button('Barang keluar', 'stock-out', 'arrow-up-from-line') + (state.account.admin ? button('Opname', 'stock-count', 'clipboard-check') : '')
  const filters = `<form id="history-filters" class="filters"><label>Barang<select name="item"><option value="">Semua barang</option>${itemOptions(data.items, state.historyItem)}</select></label><label>Lokasi<select name="location"><option value="">Semua lokasi</option>${locationOptions(data.locations, state.historyLocation)}</select></label><button type="submit" class="button secondary">${icon('search')} Terapkan</button></form>`
  return `${intro('Kartu stok', 'Catat barang masuk, barang keluar, dan hasil hitung fisik per lot.', actions)}${panel('Riwayat mutasi', 'Saring transaksi menurut barang dan lokasi.', `${filters}<div id="history-content">${historyContent(state.history, context)}</div>`, button('Ekspor halaman', 'export-history', 'download', 'secondary', '', !state.history.rows.length))}`
}

function orderView(data, context, state) {
  const orderRows = (rows, closed) => rows.map((row) => {
    const item = context.itemById.get(row.itemId)
    const last = closed ? pill(row.status === 'cancelled' ? 'Dibatalkan' : 'Direalisasi', row.status === 'cancelled' ? 'alert' : 'in') : `<div class="actions">${button('Realisasi', 'order-realize', 'circle-check', 'secondary', row.id)}${state.account.admin ? button('Batalkan', 'order-cancel', '', 'danger', row.id) : ''}</div>`
    return [nameCell(row.partner, row.reference), kind(row.direction), nameCell(item?.name, context.locationById.get(row.locationId)?.code), `${num(row.quantity)} ${esc(item?.unit)}`, date(closed ? row.closedAt : row.dueDate), last]
  })
  return `${intro('Pesanan tertunda', 'Pantau rencana terima dan kirim; saldo hanya berubah saat direalisasi.', button('Catat pesanan', 'order', 'plus', 'primary'))}${panel('Belum direalisasi', '', table(['Mitra / referensi', 'Arus', 'Barang / lokasi', 'Jumlah', 'Jatuh tempo', 'Tindakan'], orderRows(data.orders, false), empty('Tidak ada pesanan tertunda', 'Catat pesanan masuk atau keluar sebelum jadwal realisasi.', '', 'truck')))}${panel('Pesanan yang ditutup', '20 pesanan terakhir yang direalisasi atau dibatalkan.', table(['Mitra / referensi', 'Arus', 'Barang / lokasi', 'Jumlah', 'Tanggal', 'Status'], orderRows(data.closedOrders, true), empty('Belum ada pesanan ditutup', 'Riwayat akan muncul di sini.')))}`
}

function assetView(data, state) {
  const assetById = new Map(data.assets.map((asset) => [asset.id, asset]))
  const balances = data.assets.map((asset) => [nameCell(asset.name, asset.vendor), `${num(asset.quantity)} ${esc(asset.unit)}`, button('Catat mutasi', 'asset-move', 'arrow-down-up', 'secondary', asset.id)])
  const history = data.assetHistory.map((row) => [date(row.createdAt), nameCell(assetById.get(row.assetId)?.name, assetById.get(row.assetId)?.vendor), formatDelta(row.delta), num(row.balance), nameCell(row.actor, row.note)])
  return `${intro('Aset vendor', 'Catat titipan dan pengembalian tabung, palet, atau keranjang vendor.', state.account.admin ? button('Tambah jenis aset', 'asset', 'plus', 'primary') : '')}${panel('Saldo titipan', 'Jumlah aset vendor yang masih ada pada gudang.', table(['Aset / vendor', 'Saldo', 'Tindakan'], balances, empty('Belum ada aset vendor', 'Daftarkan jenis aset sebelum mencatat titipan.', '', 'package-check')))}${panel('Mutasi aset terbaru', '', table(['Tanggal', 'Aset', 'Perubahan', 'Saldo', 'Petugas / catatan'], history, empty('Belum ada mutasi aset', 'Penerimaan dan pengembalian aset akan tampil di sini.')))}`
}

function reportView(data, context) {
  const demand = new Map(data.demand.map((row) => [row.itemId, Number(row.units)]))
  const recommendations = data.items.map((item) => {
    const onHand = context.usable.get(item.id) ?? 0
    const used = demand.get(item.id) ?? 0
    const target = Math.ceil(used / 30 * item.leadDays) + item.minimum
    return { item, onHand, used, target, recommend: Math.max(0, target - onHand) }
  }).sort((left, right) => right.recommend - left.recommend)
  const flowMax = Math.max(1, ...data.flow.map((row) => Number(row.units)))
  const flow = new Map(data.flow.map((row) => [`${row.day}-${row.kind}`, Number(row.units)]))
  const flowRows = Array.from({ length: 7 }, (_, index) => wibDay(Date.now() - (6 - index) * 86400000)).map((day) => [
    date(day), ...['in', 'out'].map((direction) => {
      const quantity = flow.get(`${day}-${direction}`) ?? 0
      return `<div class="chart-line"><span>${num(quantity)}</span><meter min="0" max="${flowMax}" value="${quantity}" aria-label="${direction === 'in' ? 'Masuk' : 'Keluar'}"></meter></div>`
    }),
  ])
  return `${intro('Laporan operasional', 'Lihat arus barang, lot mendekati kedaluwarsa, dan kebutuhan pemesanan ulang.', button('Ekspor saldo stok', 'export-stock', 'download'))}<div class="two-panel">${panel('Arus 7 hari terakhir', 'Total kuantitas tercatat, seluruh SKU dan satuan gabungan.', table(['Tanggal (WIB)', 'Masuk', 'Keluar'], flowRows, ''))}${panel('Pantauan FEFO', 'Lot yang perlu diperiksa, diurutkan dari kedaluwarsa terdekat.', expiration(data, context))}</div>${panel('Saran pemesanan ulang', 'Target = konsumsi harian rata-rata 30 hari × waktu tunggu, dibulatkan ke atas, ditambah stok minimum.', table(['Barang / SKU', 'Keluar 30 hari', 'Saldo layak kirim', 'Target', 'Disarankan'], recommendations.map(({ item, onHand, used, target, recommend }) => [nameCell(item.name, item.sku), num(used), `${num(onHand)} ${esc(item.unit)}`, num(target), recommend ? pill(`${num(recommend)} ${item.unit}`, 'pending') : '—']), empty('Belum ada barang untuk dianalisis', 'Daftarkan master dan catat mutasi untuk melihat saran pemesanan.', '', 'chart-no-axes-combined')))}`
}

export function renderView(state) {
  const { data } = state
  if (!data) return `${intro('Ruang kerja gudang', 'Persediaan dan aktivitas tim.')}${state.loadError ? panel('Gagal memuat data', '', `<p class="form-message error" role="status">${esc(state.loadError)}</p>`, button('Coba lagi', 'refresh', 'refresh-cw')) : '<div class="loading-block" role="status" aria-label="Memuat data gudang"></div>'}`
  const context = indexes(data)
  switch (state.view) {
    case 'overview': return overview(data, context, state)
    case 'inventory': return `${intro('Persediaan', 'Kelola master SKU dan pantau stok menurut barang, lot, dan lokasi.', state.account.admin ? button('Impor CSV', 'import', 'upload') + itemAction(true) : '')}${panel('Master barang', '', `<div class="filters"><label>Cari barang<input id="item-search" type="search" placeholder="Nama, SKU, atau kategori" value="${esc(state.itemQuery)}"></label></div><div id="inventory-results">${inventory(data, context, state)}</div>`, button('Ekspor saldo', 'export-stock', 'download'))}`
    case 'locations': return locationView(data, context, state)
    case 'movement': return movementView(data, context, state)
    case 'orders': return orderView(data, context, state)
    case 'assets': return assetView(data, state)
    case 'reports': return reportView(data, context)
  }
}

export function inventoryResults(state) { return inventory(state.data, indexes(state.data), state) }

export function detailStock(data, type, value) {
  const context = indexes(data)
  const rows = data.stock.filter((row) => row[type] === value).sort((left, right) => (left.expiry || '9999').localeCompare(right.expiry || '9999'))
  return stockTable(rows, context)
}
