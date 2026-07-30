import ExcelJS from 'exceljs'

const STORE_KEY = 'smart-renta-offline-v1'
const SESSION_KEY = 'smart-renta-offline-session'
const now = () => new Date().toISOString()
const monthNow = () => now().slice(0, 7)

// 太陽シルバーサービス㈱ 全19営業所（taiyo-office-master と同一の名称・並び）
const REAL_OFFICE_NAMES = [
  '小倉営業所', '小倉南営業所', '八幡西営業所', '八幡東営業所', '行橋営業所', '田川営業所',
  '飯塚営業所', '福岡南営業所', '福岡西営業所', '福岡東営業所', '久留米営業所', '大牟田営業所',
  '佐賀営業所', '長崎営業所', '大村営業所', '壱岐営業所', '熊本営業所', '熊本北営業所', '大分営業所',
]

function seed() {
  const offices = REAL_OFFICE_NAMES.map((name, index) => ({
    id: `office-${String(index + 1).padStart(2, '0')}`,
    name,
  }))
  const yukuhashiId = offices.find((office) => office.name === '行橋営業所').id
  // デモ用の担当者・事業者データは行橋営業所のみ。他営業所は営業員登録が未実装（要API連携）。
  const staff = [
    { id: 'staff-miyamura', officeId: yukuhashiId, name: '宮村 茉梨香', role: 'staff', active: true },
    { id: 'staff-kubo', officeId: yukuhashiId, name: '久保 匠史', role: 'staff', active: true },
    { id: 'staff-admin', officeId: yukuhashiId, name: '営業所管理者', role: 'system_admin', active: true },
  ]
  const providers = [
    ['provider-01', '4000000001', 'みやこ居宅介護支援事業所', 'staff-miyamura'],
    ['provider-02', '4000000002', '行橋ケアプランセンター', 'staff-miyamura'],
    ['provider-03', '4000000003', 'つばさ居宅介護支援', 'staff-miyamura'],
    ['provider-04', '4000000004', 'さくらケアプラン', 'staff-kubo'],
    ['provider-05', '4000000005', 'あおぞら居宅支援', 'staff-kubo'],
  ].map(([id, code, name, staffId]) => ({ id, officeId: yukuhashiId, code, name, staffId, totalHomes: 1, hiddenAt: null, visits: {} }))
  providers[0].visits[`${monthNow()}-02`] = { count: 1, version: 1, updatedAt: now() }
  return { offices, staff, providers, imports: {}, retentionYears: 5, audit: [] }
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || seed() } catch { return seed() }
}
function save(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)) }
function session() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) } catch { return null }
}
function currentStaff(data) { return data.staff.find((row) => row.id === session()?.user?.id) }
function staffForOffice(data, officeId) { return data.staff.filter((row) => row.officeId === officeId && row.active) }
function providerView(provider, data, month) {
  const visits = {}
  for (const [date, value] of Object.entries(provider.visits || {})) if (date.startsWith(month)) visits[String(Number(date.slice(-2)))] = value
  const visitTotal = Object.values(visits).reduce((sum, item) => sum + item.count, 0)
  return { ...provider, externalCode: provider.code, homeId: null, staffName: data.staff.find((row) => row.id === provider.staffId)?.name || '', sourceActive: true, visits, visitTotal, visitedEntityCount: visitTotal > 0 ? 1 : 0, visitRate: provider.totalHomes ? (visitTotal > 0 ? 100 : 0) : null }
}
function calendarResult(data, month, staffId, includeHidden) {
  const user = currentStaff(data)
  const scope = user?.role === 'staff' ? user.id : staffId
  const providers = data.providers.filter((row) => row.officeId === user.officeId && (!scope || row.staffId === scope) && (includeHidden || !row.hiddenAt)).map((row) => providerView(row, data, month))
  const totalHomes = providers.reduce((sum, row) => sum + row.totalHomes, 0)
  const visitTotal = providers.reduce((sum, row) => sum + row.visitTotal, 0)
  const visitedEntityCount = providers.reduce((sum, row) => sum + row.visitedEntityCount, 0)
  return { month, providers, summary: { totalHomes, visitTotal, visitedEntityCount, visitRate: totalHomes ? Math.round(visitedEntityCount / totalHomes * 1000) / 10 : null } }
}

export function setCsrfToken() {}

export const api = {
  async publicOffices() {
    const data = load()
    return { offices: data.offices.map((office) => ({ ...office, staff: staffForOffice(data, office.id).map(({ id, name }) => ({ id, name })) })) }
  },
  async me() { return session() },
  async login(form) {
    const data = load()
    const office = data.offices.find((row) => row.id === form.officeId)
    const user = data.staff.find((row) => row.id === form.staffId && row.officeId === office?.id)
    if (!office || !user || !form.officePassword || !form.pin) throw new Error('営業所パスワードと個人PINを入力してください。')
    const result = { user: { id: user.id, name: user.name, role: user.role }, office, csrfToken: '', permissions: { canViewOfficeAggregate: user.role !== 'staff', canViewStaffBreakdown: user.role !== 'staff', canImport: user.role !== 'staff', canManageSettings: user.role === 'system_admin', canDeletePermanently: user.role === 'system_admin' } }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(result)); return result
  },
  async logout() { sessionStorage.removeItem(SESSION_KEY) },
  async staff() { const data = load(); const user = currentStaff(data); return { staff: data.staff.filter((row) => row.officeId === user.officeId).map(({ id, name, role, active }) => ({ id, name, role, active })) } },
  async calendar({ month, staffId, includeHidden = false }) { return calendarResult(load(), month, staffId, includeHidden) },
  async updateVisit(providerId, date, count, expectedVersion) {
    const data = load(); const provider = data.providers.find((row) => row.id === providerId)
    const current = provider.visits[date] || { count: 0, version: 0 }
    if (current.version !== expectedVersion) { const error = new Error('別の変更が保存されています。'); error.status = 409; throw error }
    provider.visits[date] = { count: Math.max(0, Number(count) || 0), version: current.version + 1, updatedAt: now() }; save(data)
    return provider.visits[date]
  },
  async updateProvider(providerId, body) { const data = load(); const row = data.providers.find((item) => item.id === providerId); if ('totalHomes' in body) row.totalHomes = Math.max(0, Math.trunc(body.totalHomes || 0)); if ('hidden' in body) row.hiddenAt = body.hidden ? now() : null; save(data); return row },
  async deleteChallenge(providerId) { return { challengeId: providerId, confirmationText: '完全削除', expiresAt: now() } },
  async deleteProvider(providerId) { const data = load(); data.providers = data.providers.filter((row) => row.id !== providerId); save(data) },
  async importPreview(file, archiveMissing = false) {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer())
    const sheet = workbook.worksheets.find((row) => row.actualRowCount)
    if (!sheet) throw new Error('Excelに読み取れるシートがありません。')
    const rows = []
    sheet.eachRow((row, number) => { if (number > 1) { const values = row.values.map((value) => String(value?.text || value || '').trim()); if (values.some(Boolean)) rows.push(values) } })
    const batchId = crypto.randomUUID(); const data = load(); data.imports[batchId] = { rows, archiveMissing, name: file.name }; save(data)
    return { batchId, file: { name: file.name }, worksheetName: sheet.name, diff: { added: rows.length, updated: 0, archived: 0, missing: 0, unchanged: 0, visitRows: rows.length, uniqueVisits: rows.length, archiveMissing } }
  },
  async importConfirm(batchId) {
    const data = load(); const batch = data.imports[batchId]; if (!batch) throw new Error('取込データが見つかりません。')
    const user = currentStaff(data); let insertedVisits = 0
    batch.rows.forEach((values, index) => { const name = values.find((value) => /居宅|ケア|支援|事業/.test(value)); if (!name) return; data.providers.push({ id: crypto.randomUUID(), officeId: user.officeId, code: `EXCEL-${Date.now()}-${index}`, name, staffId: user.id, totalHomes: 1, hiddenAt: null, visits: {} }); insertedVisits += 1 })
    delete data.imports[batchId]; save(data); return { insertedVisits }
  },
  async analytics({ fiscalYear, staffId }) {
    const data = load(); const months = Array.from({ length: 12 }, (_, index) => { const month = ((index + 3) % 12) + 1; const year = index < 9 ? fiscalYear : fiscalYear + 1; const key = `${year}-${String(month).padStart(2, '0')}`; const cal = calendarResult(data, key, staffId, false); return { month: key, label: `${month}月`, visitTotal: cal.summary.visitTotal, visitedEntityCount: cal.summary.visitedEntityCount, totalHomes: cal.summary.totalHomes, visitRate: cal.summary.visitRate } })
    const visitTotal = months.reduce((sum, row) => sum + row.visitTotal, 0); const activeStaffCount = staffForOffice(data, currentStaff(data).officeId).filter((row) => row.role === 'staff').length
    return { fiscalYear, months, summary: { visitTotal, visitedEntityCount: months.reduce((sum, row) => sum + row.visitedEntityCount, 0), averagePerStaff: activeStaffCount ? visitTotal / activeStaffCount : 0, monthlyAverage: visitTotal / 12 }, staffBreakdown: [] }
  },
  async settings() { const data = load(); return { retentionYears: data.retentionYears, storageMode: '端末内保存（通信APIなし）' } },
  async updateSettings(values) { const data = load(); data.retentionYears = Math.max(5, Number(values.retentionYears) || 5); save(data) },
  async updatePin() { return { ok: true } },
  async audit() { return { logs: load().audit } },
  async pdf() { throw new Error('印刷タブからブラウザーの「PDFとして保存」を使用してください。') },
}
