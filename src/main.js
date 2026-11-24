import { acceptInvite, getUser, handleAuthCallback, login, logout, requestPasswordRecovery, updateUser } from '@netlify/identity'
import {
  ArrowDownToLine, ArrowDownUp, ArrowLeft, ArrowRight, ArrowUpFromLine, Barcode, Box, Boxes, CalendarClock,
  ChartNoAxesCombined, CircleCheck, ClipboardCheck, ClipboardList, Download, Eye, EyeOff, Globe2, Layers3,
  LayoutDashboard, LockKeyhole, LogOut, Menu, PackageCheck, Pencil, Plus, Printer, RefreshCw, ScanBarcode,
  Search, ShieldCheck, TriangleAlert, Truck, Upload, Warehouse, X, createIcons,
} from 'lucide'
import { button, csvDownload, date, esc, icon, indexes, num, readMasterCsv, views, wibDay } from './presentation.js'
import { detailStock, historyContent, inventoryResults, itemOptions, locationOptions, renderView } from './views.js'
import './style.css'

const icons = { ArrowDownToLine, ArrowDownUp, ArrowLeft, ArrowRight, ArrowUpFromLine, Barcode, Box, Boxes, CalendarClock, ChartNoAxesCombined, CircleCheck, ClipboardCheck, ClipboardList, Download, Eye, EyeOff, Globe2, Layers3, LayoutDashboard, LockKeyhole, LogOut, Menu, PackageCheck, Pencil, Plus, Printer, RefreshCw, ScanBarcode, Search, ShieldCheck, TriangleAlert, Truck, Upload, Warehouse, X }
const drawIcons = () => createIcons({ icons })
const byId = (value) => document.getElementById(value)
const workspace = byId('workspace')
const authForm = byId('auth-form')
const dialog = byId('dialog')
const dialogContent = byId('dialog-content')
const state = { account: null, view: 'overview', data: null, loadError: '', stale: false, lastSync: null, itemQuery: '', history: { rows: [], page: 0 }, historyItem: '', historyLocation: '' }
let authMode = 'login'
let inviteToken
let toastTimer
let loadVersion = 0
let historyVersion = 0
let dialogVersion = 0
let scanner
let scanStarting = false

function message(element, value = '', isError = false) {
  element.hidden = !value
  element.textContent = value
  element.classList.toggle('error', isError)
}

function toast(value, isError = false) {
  const element = byId('toast')
  clearTimeout(toastTimer)
  element.hidden = false
  element.textContent = value
  element.classList.toggle('is-error', isError)
  toastTimer = setTimeout(() => { element.hidden = true }, 5000)
}

function authView(mode, status = '', isError = false) {
  const labels = {
    login: ['Masuk ke gudang', 'Gunakan akun yang diberikan pengelola gudang untuk melanjutkan.', 'Masuk ke aplikasi'],
    forgot: ['Lupa kata sandi', 'Masukkan alamat akun untuk menerima tautan pengaturan ulang.', 'Kirim tautan pemulihan'],
    invite: ['Aktifkan akun', 'Buat kata sandi baru untuk menerima undangan tim gudang.', 'Aktifkan akun'],
    reset: ['Atur ulang kata sandi', 'Buat kata sandi baru untuk akun gudang Anda.', 'Simpan kata sandi baru'],
  }
  authMode = mode
  const [title, copy, submit] = labels[mode]
  byId('auth-title').textContent = title
  byId('auth-copy').textContent = copy
  byId('auth-submit-text').textContent = submit
  byId('auth-switch').textContent = mode === 'login' ? 'Lupa kata sandi?' : 'Kembali ke halaman masuk'
  byId('email-field').hidden = !['login', 'forgot'].includes(mode)
  byId('email').required = !byId('email-field').hidden
  byId('password-field').hidden = mode === 'forgot'
  const password = byId('password')
  password.value = ''
  password.required = mode !== 'forgot'
  password.minLength = ['invite', 'reset'].includes(mode) ? 8 : 0
  password.autocomplete = ['invite', 'reset'].includes(mode) ? 'new-password' : 'current-password'
  message(byId('auth-message'), status, isError)
}

async function api(path, data) {
  const options = data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
  const response = await fetch(`/api/${path}`, { ...options, cache: 'no-store' })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) {
    const problem = new Error(result?.error || 'Aplikasi tidak dapat terhubung. Periksa koneksi dan coba lagi.')
    problem.status = response.status
    throw problem
  }
  return result
}

function enterAuth(status = '', isError = false) {
  state.account = null
  state.data = null
  state.history = { rows: [], page: 0 }
  state.historyItem = ''
  state.historyLocation = ''
  state.itemQuery = ''
  state.loadError = ''
  loadVersion++
  historyVersion++
  if (dialog.open) dialog.close()
  dialogContent.replaceChildren()
  workspace.replaceChildren()
  byId('account-name').textContent = ''
  byId('avatar').textContent = ''
  byId('app').hidden = true
  byId('auth').hidden = false
  authView('login', status, isError)
}

function presentWorkspace() {
  workspace.innerHTML = renderView(state)
  drawIcons()
}

function updateHistory() {
  const output = byId('history-content')
  if (!output || !state.data) return
  output.innerHTML = historyContent(state.history, indexes(state.data))
  const exportButton = workspace.querySelector('[data-action="export-history"]')
  exportButton.disabled = state.history.loading || !state.history.rows.length
  drawIcons()
}

async function loadHistory(page = 0) {
  if (!state.data) return
  const version = ++historyVersion
  state.history = { rows: [], page, loading: true }
  updateHistory()
  try {
    const query = new URLSearchParams({ item: state.historyItem, location: state.historyLocation, page: String(page) })
    const result = await api(`history?${query}`)
    if (version !== historyVersion) return
    state.history = result
  } catch (error) {
    if (version !== historyVersion) return
    if (error.status === 401 || error.status === 403) return enterAuth(error.message, true)
    state.history = { rows: [], page, error: error.message }
  }
  updateHistory()
}

async function loadWarehouse({ quiet = false } = {}) {
  const version = ++loadVersion
  try {
    const data = await api('warehouse')
    if (version !== loadVersion) return
    state.data = data
    state.stale = false
    state.lastSync = Date.now()
    state.loadError = ''
    if (!quiet || state.view === 'overview') presentWorkspace()
    if (state.view === 'movement' && !quiet) await loadHistory(state.history.page)
  } catch (error) {
    if (version !== loadVersion) return
    if (error.status === 401 || error.status === 403) return enterAuth(error.message, true)
    state.stale = true
    state.loadError = error.message
    if (!state.data || state.view === 'overview') presentWorkspace()
    if (!quiet) toast(error.message, true)
  }
}

function leaveMenu() {
  byId('sidebar').classList.remove('open')
  byId('menu').setAttribute('aria-expanded', 'false')
}

function navigate(view, shouldFocus = false) {
  if (!Object.hasOwn(views, view)) return
  state.view = view
  byId('navigation').innerHTML = Object.entries(views).map(([key, [label, symbol]]) => `<button class="nav-button" type="button" data-view="${key}"${key === view ? ' aria-current="page"' : ''}>${icon(symbol)}${label}</button>`).join('')
  byId('breadcrumb').textContent = `Operasional / ${views[view][0]}`
  leaveMenu()
  presentWorkspace()
  if (shouldFocus) {
    const heading = workspace.querySelector('h1')
    if (heading) { heading.tabIndex = -1; heading.focus() }
  }
  if (view === 'movement') void loadHistory(0)
}

async function openWorkspace() {
  state.account = await api('session')
  byId('account-name').textContent = state.account.name
  byId('avatar').textContent = state.account.name.trim().charAt(0).toUpperCase() || 'G'
  byId('sidebar-role').textContent = state.account.admin ? 'Admin' : 'Petugas'
  byId('auth').hidden = true
  byId('app').hidden = false
  navigate('overview')
  await loadWarehouse()
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const submit = authForm.querySelector('[type=submit]')
  const mode = authMode
  const email = byId('email').value.trim()
  const password = byId('password').value
  message(byId('auth-message'))
  submit.disabled = true
  try {
    if (mode === 'forgot') {
      await requestPasswordRecovery(email)
      authView('login', 'Jika alamat email terdaftar, tautan pemulihan akan dikirim ke kotak masuk.')
    } else {
      if (mode === 'invite') {
        await acceptInvite(inviteToken, password)
        inviteToken = undefined
      } else if (mode === 'reset') await updateUser({ password })
      else await login(email, password)
      byId('password').value = ''
      await openWorkspace()
    }
  } catch (error) {
    if (error.status === 403 && mode !== 'forgot') authView('login', 'Akun belum memiliki akses gudang. Hubungi admin untuk mengaktifkan peran akun.', true)
    else if (mode === 'login' && error.status === 401) message(byId('auth-message'), 'Email atau kata sandi tidak cocok.', true)
    else message(byId('auth-message'), mode === 'forgot' && error.status === 404 ? 'Jika alamat email terdaftar, tautan pemulihan akan dikirim ke kotak masuk.' : 'Permintaan tidak berhasil. Periksa koneksi atau gunakan tautan undangan/pemulihan yang terbaru.', !(mode === 'forgot' && error.status === 404))
  } finally { submit.disabled = false }
})

byId('auth-switch').addEventListener('click', async () => {
  if (authMode === 'reset') await logout().catch(() => {})
  authView(authMode === 'login' ? 'forgot' : 'login')
  byId('email').focus()
})
byId('password-toggle').addEventListener('click', (event) => {
  const password = byId('password')
  const showing = password.type === 'password'
  password.type = showing ? 'text' : 'password'
  event.currentTarget.setAttribute('aria-pressed', String(showing))
  event.currentTarget.setAttribute('aria-label', showing ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi')
  event.currentTarget.innerHTML = icon(showing ? 'eye-off' : 'eye')
  drawIcons()
})
byId('logout').addEventListener('click', async (event) => {
  const control = event.currentTarget
  control.disabled = true
  try { await logout(); enterAuth('Anda sudah keluar dari aplikasi.') }
  catch { toast('Tidak dapat keluar. Coba lagi.', true) }
  finally { control.disabled = false }
})
byId('menu').addEventListener('click', (event) => event.currentTarget.setAttribute('aria-expanded', String(byId('sidebar').classList.toggle('open'))))
byId('navigation').addEventListener('click', (event) => {
  const target = event.target.closest('[data-view]')
  if (target) navigate(target.dataset.view, true)
})
byId('refresh').addEventListener('click', () => void loadWarehouse())

const input = (label, field, value = '', { type = 'text', required = true, max = 120, min = 0, placeholder = '' } = {}) => `<label>${esc(label)}<input name="${field}" type="${type}" value="${esc(value)}"${required ? ' required' : ''}${type === 'text' ? ` maxlength="${max}"` : ''}${type === 'number' ? ` min="${min}" max="${max}" step="1"` : ''}${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}></label>`
const select = (label, field, options, placeholder = 'Pilih…') => `<label>${esc(label)}<select name="${field}" required>${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}${options}</select></label>`
const options = (entries) => entries.map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('')
const noteField = (mandatory = false) => `<label>Catatan${mandatory ? '' : ' (opsional)'}<textarea name="note" rows="2" maxlength="240"${mandatory ? ' required' : ''}></textarea></label>`
const group = (...children) => `<div class="form-grid">${children.join('')}</div>`
const lotFields = () => group(input('Nomor lot (opsional)', 'lot', '', { required: false, max: 60 }), input('Kedaluwarsa (opsional)', 'expiry', '', { type: 'date', required: false }))

function openDialog(title, content) {
  if (dialog.open) dialog.close()
  dialogVersion++
  byId('dialog-title').textContent = title
  dialogContent.innerHTML = content
  dialog.showModal()
  drawIcons()
}

function openForm(title, fields, save, { label = 'Simpan', style = 'primary', success = 'Perubahan tersimpan.' } = {}) {
  openDialog(title, `<form class="dialog-form">${fields}<p class="form-message" role="status" hidden></p><div class="dialog-actions">${button('Tutup', 'dialog-close')}<button type="submit" class="button ${style}">${esc(label)}</button></div></form>`)
  const form = dialogContent.querySelector('form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const version = dialogVersion
    const submit = form.querySelector('[type=submit]')
    const status = form.querySelector('.form-message')
    message(status)
    submit.disabled = true
    try {
      const result = await save(Object.fromEntries(new FormData(form)), form)
      if (version === dialogVersion && dialog.open) dialog.close()
      toast(typeof success === 'function' ? success(result) : success)
      await loadWarehouse()
    } catch (error) {
      if (error.status === 401) enterAuth(error.message, true)
      else if (form.isConnected && dialog.open) message(status, error.message, true)
      else toast(error.message, true)
    } finally { submit.disabled = false }
  })
  return form
}

function formItem(rowId) {
  const item = state.data.items.find((entry) => entry.id === rowId) ?? {}
  openForm(item.id ? 'Edit barang' : 'Tambah master barang', group(input('Kode SKU', 'sku', item.sku, { max: 40 }), input('Nama barang', 'name', item.name)) +
    group(input('Kategori', 'category', item.category, { max: 60 }), input('Satuan', 'unit', item.unit, { max: 30, placeholder: 'dus, kg, pak' })) +
    group(input('Stok minimum', 'minimum', item.minimum ?? 0, { type: 'number', max: 1e9 }), input('Waktu tunggu (hari)', 'leadDays', item.leadDays ?? 7, { type: 'number', max: 365 })), (data) => api('items', { ...data, id: item.id }))
}

function formLocation(rowId) {
  const location = state.data.locations.find((entry) => entry.id === rowId) ?? {}
  openForm(location.id ? 'Edit lokasi' : 'Tambah kontainer atau rak', group(input('Kode lokasi / barcode', 'code', location.code, { max: 40, placeholder: 'RAK-A01' }), input('Nama lokasi', 'name', location.name)) + input('Zona (opsional)', 'zone', location.zone, { required: false, max: 80 }), (data) => api('locations', { ...data, id: location.id }))
}

function hasMaster() {
  if (state.data?.items.length && state.data?.locations.length) return true
  toast('Diperlukan minimal satu master barang dan satu lokasi.', true)
  return false
}

const pickItem = () => select('Barang', 'itemId', itemOptions(state.data.items))
const pickLocation = () => select('Lokasi tujuan / asal', 'locationId', locationOptions(state.data.locations))

function formStock(flow) {
  if (!hasMaster()) return
  const variation = { in: ['Barang masuk', 'Isi nomor lot dan tanggal kedaluwarsa bila diketahui.'], out: ['Barang keluar', 'Jika lot dikosongkan, stok layak kirim diambil dari kedaluwarsa terdekat (FEFO). Lot kedaluwarsa tidak bisa dikirim.'], count: ['Opname fisik', 'Masukkan saldo fisik untuk satu lot. Nomor lot dan tanggal harus sama persis dengan saldo yang diperiksa.'] }
  const [title, help] = variation[flow]
  const scanTools = `<label for="location-barcode">Kode lokasi / barcode</label><div class="barcode-tools"><input id="location-barcode" autocomplete="off" placeholder="Ketik kode atau gunakan pemindai" maxlength="40">${button('Cocokkan', 'match-code')}${button('Kamera', 'scan', 'scan-barcode')}</div><p id="scan-status" role="status" class="subtle"></p><div id="reader" class="scanner-area" hidden></div>`
  const form = openForm(title, `<p class="subtle">${help}</p>${pickItem()}${pickLocation()}${scanTools}${lotFields()}${input(flow === 'count' ? 'Saldo fisik' : 'Jumlah', 'quantity', '', { type: 'number', min: flow === 'count' ? 0 : 1, max: 1e9 })}${noteField(flow === 'count')}`, (data) => api('stock', { ...data, kind: flow }), { label: 'Catat transaksi', success: 'Transaksi tercatat. Saldo gudang diperbarui.' })
  const barField = form.querySelector('#location-barcode')
  barField.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); matchCode() } })
}

function matchCode(value = byId('location-barcode')?.value) {
  const status = byId('scan-status')
  const location = state.data?.locations.find((entry) => entry.code === value?.trim().toUpperCase())
  if (!status) return false
  status.textContent = location ? `Lokasi dipilih: ${location.name}` : 'Kode tidak ditemukan. Periksa kode atau pilih lokasi secara manual.'
  if (location) dialogContent.querySelector('[name=locationId]').value = location.id
  return Boolean(location)
}

async function stopScan() {
  const active = scanner
  scanner = undefined
  if (active?.isScanning) await active.stop().catch(() => {})
  if (active) { try { active.clear() } catch {} }
}

async function startScan() {
  if (scanStarting || scanner) return
  const version = dialogVersion
  const target = byId('reader')
  const status = byId('scan-status')
  if (!target || !status) return
  scanStarting = true
  status.textContent = 'Membuka kamera…'
  try {
    const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
    if (version !== dialogVersion || !dialog.open) return
    target.hidden = false
    scanner = new Html5Qrcode('reader', { formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.EAN_13], verbose: false })
    await scanner.start({ facingMode: 'environment' }, { fps: 8 }, (value) => {
      if (!dialog.open || version !== dialogVersion) return
      if (value.length <= 40 && matchCode(value)) {
        byId('location-barcode').value = value
        void stopScan().then(() => { target.hidden = true })
      }
    })
    if (version !== dialogVersion || !dialog.open) await stopScan()
    else status.textContent = 'Arahkan kamera ke barcode lokasi.'
  } catch {
    await stopScan()
    target.hidden = true
    if (version === dialogVersion && dialog.open) status.textContent = 'Kamera tidak dapat dibuka. Izinkan akses kamera atau masukkan kode lokasi.'
  } finally { scanStarting = false }
}

function formOrder() {
  if (!hasMaster()) return
  openForm('Catat pesanan tertunda', select('Arus barang', 'direction', options([['in', 'Penerimaan barang'], ['out', 'Pengiriman barang']]), '') + group(pickItem(), pickLocation()) +
    group(input('Jumlah', 'quantity', '', { type: 'number', min: 1, max: 1e9 }), input('Jatuh tempo', 'dueDate', '', { type: 'date', required: false })) +
    group(input('Nama mitra', 'partner'), input('Nomor referensi (opsional)', 'reference', '', { required: false, max: 100 })), (data) => api('orders', data))
}

function confirmOrder(rowId, action) {
  const order = state.data.orders.find((entry) => entry.id === rowId)
  if (!order) return
  const cancel = action === 'cancel'
  const item = state.data.items.find((entry) => entry.id === order.itemId)
  openForm(cancel ? 'Batalkan pesanan' : 'Realisasi pesanan', `<p class="subtle">${esc(order.reference || order.partner)} · ${num(order.quantity)} ${esc(item?.unit)} ${esc(item?.name)}.</p><p class="subtle">${cancel ? 'Pesanan ditutup tanpa mengubah stok.' : order.direction === 'out' ? 'Saldo akan berkurang. Kosongkan lot untuk mengikuti urutan FEFO.' : 'Saldo akan ditambahkan ke lokasi pesanan.'}</p>${cancel ? '' : lotFields()}`, (data) => api(`orders/${rowId}`, { ...data, action }), { label: cancel ? 'Batalkan pesanan' : 'Realisasikan', style: cancel ? 'danger' : 'primary' })
}

function formAsset(rowId) {
  const asset = state.data.assets.find((entry) => entry.id === rowId)
  if (!asset) {
    openForm('Tambah jenis aset vendor', input('Nama aset', 'name') + group(input('Nama vendor', 'vendor'), input('Satuan', 'unit', '', { max: 30 })), (data) => api('assets', data))
    return
  }
  openForm('Catat mutasi aset', `<p class="subtle">${esc(asset.name)} · ${esc(asset.vendor)} · saldo ${num(asset.quantity)} ${esc(asset.unit)}</p>${select('Arus aset', 'direction', options([['in', 'Terima titipan'], ['out', 'Kembalikan ke vendor']]), '')}${input('Jumlah', 'quantity', '', { type: 'number', min: 1, max: 1e9 })}${noteField()}`, (data) => api('assets/move', { ...data, assetId: rowId }))
}

function exportStock() {
  const context = indexes(state.data)
  const rows = state.data.stock.map((row) => [context.itemById.get(row.itemId)?.sku, context.itemById.get(row.itemId)?.name, context.locationById.get(row.locationId)?.code, row.lot, row.expiry, row.quantity, context.itemById.get(row.itemId)?.unit])
  csvDownload(`saldo-stok-${wibDay()}`, ['sku', 'nama', 'lokasi', 'lot', 'kedaluwarsa', 'saldo', 'satuan'], rows)
}

function exportHistory() {
  const context = indexes(state.data)
  const rows = state.history.rows.map((row) => [row.createdAt, context.itemById.get(row.itemId)?.sku, context.locationById.get(row.locationId)?.code, row.kind, row.delta, row.balance, row.lot, row.expiry, row.actor, row.note])
  csvDownload(`kartu-stok-${wibDay()}-${state.history.page + 1}`, ['waktu', 'sku', 'lokasi', 'jenis', 'perubahan', 'saldo_lot', 'lot', 'kedaluwarsa', 'petugas', 'catatan'], rows)
}

async function showLabel(rowId) {
  const location = state.data.locations.find((entry) => entry.id === rowId)
  if (!location) return
  openDialog('Label barcode lokasi', `<div class="barcode-label"><strong>${esc(location.name)}</strong><svg id="location-label" role="img" aria-label="Kode ${esc(location.code)}"></svg><span>${esc(location.zone)}</span></div><div class="dialog-actions">${button('Cetak label', 'print', 'printer', 'primary', '', true)}</div>`)
  const target = byId('location-label')
  try {
    const { default: JsBarcode } = await import('jsbarcode')
    if (!target.isConnected || !dialog.open) return
    JsBarcode(target, location.code, { format: 'CODE128', width: 1.45, height: 55, fontSize: 15, margin: 8 })
    dialogContent.querySelector('[data-action=print]').disabled = false
  } catch { toast('Barcode gagal digambar. Buka kembali label untuk mencoba lagi.', true) }
}

function formImport() {
  openForm('Impor master barang', `<p class="subtle">Impor hingga 500 baris dari CSV (bisa disimpan dari Excel). SKU yang sudah terdaftar dilewati tanpa ditimpa.</p>${button('Unduh contoh CSV', 'template', 'download')}<label>File CSV<input type="file" name="file" accept=".csv,text/csv" required></label>`, async ({ file }) => {
    if (!(file instanceof File) || file.size > 240000) throw new Error('Pilih file CSV dengan ukuran di bawah 240 KB.')
    return api('items/import', { items: readMasterCsv(await file.text()) })
  }, { label: 'Impor barang', success: (result) => `${result.inserted} barang ditambahkan, ${result.skipped} SKU dilewati.` })
}

const actions = {
  refresh: () => loadWarehouse(), navigate, item: formItem, location: formLocation,
  'item-stock': (rowId) => openDialog('Stok per lot barang', detailStock(state.data, 'itemId', rowId)),
  'location-stock': (rowId) => openDialog('Saldo di lokasi', detailStock(state.data, 'locationId', rowId)),
  label: showLabel, 'stock-in': () => formStock('in'), 'stock-out': () => formStock('out'), 'stock-count': () => formStock('count'),
  order: formOrder, 'order-realize': (rowId) => confirmOrder(rowId, 'realize'), 'order-cancel': (rowId) => confirmOrder(rowId, 'cancel'),
  asset: formAsset, 'asset-move': formAsset, import: formImport, 'export-stock': exportStock, 'export-history': exportHistory,
  'history-prev': () => loadHistory(Math.max(0, state.history.page - 1)), 'history-next': () => loadHistory(state.history.page + 1),
  'dialog-close': () => dialog.close(), 'match-code': () => matchCode(), scan: startScan, print: () => window.print(),
  template: () => csvDownload('contoh-master-barang', ['sku', 'nama', 'kategori', 'satuan', 'stok_minimum', 'waktu_tunggu'], [['BR-001', 'Beras 5 kg', 'Beras', 'karung', 10, 7]]),
}
for (const container of [workspace, dialogContent]) {
  container.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]')
    if (target && Object.hasOwn(actions, target.dataset.action)) void actions[target.dataset.action](target.dataset.id)
  })
}
workspace.addEventListener('input', (event) => {
  if (event.target.id !== 'item-search') return
  state.itemQuery = event.target.value
  byId('inventory-results').innerHTML = inventoryResults(state)
  drawIcons()
})
workspace.addEventListener('submit', (event) => {
  if (event.target.id !== 'history-filters') return
  event.preventDefault()
  const fields = new FormData(event.target)
  state.historyItem = fields.get('item')
  state.historyLocation = fields.get('location')
  void loadHistory(0)
})
byId('close-dialog').addEventListener('click', () => dialog.close())
dialog.addEventListener('close', () => { if (!scanStarting) void stopScan() })

async function initialize() {
  drawIcons()
  try {
    const callback = await handleAuthCallback()
    if (callback?.type === 'invite') return authView('invite', (inviteToken = callback.token) ? '' : 'Tautan undangan tidak valid.', !inviteToken)
    if (callback?.type === 'recovery') return authView('reset')
    if (await getUser()) await openWorkspace()
  } catch (error) {
    if (error.status !== 401) message(byId('auth-message'), error.status === 403 ? 'Akun belum memiliki akses gudang. Hubungi admin untuk mengaktifkan peran akun.' : 'Sesi tidak dapat dipulihkan. Silakan masuk lagi.', true)
  }
}

setInterval(() => {
  if (state.account && !document.hidden && !dialog.open && state.view === 'overview') void loadWarehouse({ quiet: true })
}, 45_000)
void initialize()
