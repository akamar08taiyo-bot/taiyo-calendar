const STORE_KEY = 'kyotaku-calendar-offline-v2'
const SESSION_KEY = 'kyotaku-calendar-offline-session-v2'
const now = () => new Date().toISOString()
const monthNow = () => now().slice(0, 7)

function seed() {
  const offices = Array.from({ length: 19 }, (_, index) => ({
    id: `office-${String(index + 1).padStart(2, '0')}`,
    name: index === 0 ? '行橋営業所' : `営業所${String(index + 2).padStart(2, '0')}`,
  }))
  const staff = [
    { id: 'staff-miyamura', officeId: 'office-01', name: '宮村 茉梨香', role: 'staff', active: true },
    { id: 'staff-kubo', officeId: 'office-01', name: '久保 匠史', role: 'staff', active: true },
    { id: 'staff-admin', officeId: 'office-01', name: '営業所管理者', role: 'system_admin', active: true },
  ]
  const providers = [
    ['provider-01', '4000000001', 'みやこ居宅介護支援事業所', 'staff-miyamura'],
    ['provider-02', '4000000002', '行橋ケアプランセンター', 'staff-miyamura'],
    ['provider-03', '4000000003', 'つばさ居宅介護支援', 'staff-miyamura'],
    ['provider-04', '4000000004', 'さくらケアプラン', 'staff-kubo'],
    ['provider-05', '4000000005', 'あおぞら居宅支援', 'staff-kubo'],
  ].map(([id, code, name, staffId]) => ({ id, officeId: 'office-01', code, name, staffId, totalHomes: 1, hiddenAt: null, visits: {} }))
  providers[0].visits[`${monthNow()}-02`] = { count: 1, version: 1, updatedAt: now() }
  return { offices, staff, providers, imports: {}, attendanceDays: {}, retentionYears: 5, audit: [] }
}

function cellText(cell) {
  const value = cell?.value
  if (value == null) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('result' in value) return value.result
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
    if ('text' in value) return value.text
  }
  return String(cell.text || value).trim()
}

function excelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && value > 30000 && value < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10)
  }
  const match = String(value || '').match(/(20\d{2})[年/-](\d{1,2})[月/-](\d{1,2})/)
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null
}

function visitCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value))
  const text = String(value || '').trim()
  if (!text) return 0
  if (/^[✓✔○●]$/.test(text)) return 1
  const number = Number(text)
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
}

function normalizedHeader(value) {
  return String(value || '').replace(/[\s　:：・]/g, '').toLowerCase()
}

function findColumn(sheet, rowNumber, aliases) {
  const normalizedAliases = aliases.map(normalizedHeader)
  for (let column = 1; column <= Math.min(100, sheet.columnCount); column += 1) {
    const header = normalizedHeader(cellText(sheet.getRow(rowNumber).getCell(column)))
    if (header && normalizedAliases.some((alias) => header === alias || header.includes(alias))) return column
  }
  return null
}

function parseCalendarSheet(sheet) {
  const header4 = normalizedHeader(cellText(sheet.getCell('B4')))
  const header5 = normalizedHeader(cellText(sheet.getCell('B5')))
  if (![header4, header5].some((header) => ['居宅名', '事業者名', '居宅名称'].some((alias) => header.includes(alias)))) return []

  const officeName = String(cellText(sheet.getCell('B3')) || '営業所').trim()
  const staffName = String(cellText(sheet.getCell('C3')) || sheet.name)
    .replace(/^(営業担当|担当者|営業員)\s*[:：]\s*/, '')
    .trim()
    .replace(/\s+/g, ' ')
  const dateColumns = []
  for (let column = 8; column <= Math.min(45, sheet.columnCount); column += 1) {
    const date = excelDate(cellText(sheet.getRow(4).getCell(column))) || excelDate(cellText(sheet.getRow(5).getCell(column)))
    if (date) dateColumns.push({ column, date })
  }

  const rows = []
  for (let rowNumber = 6; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const sequence = Number(cellText(sheet.getRow(rowNumber).getCell(1)))
    const name = String(cellText(sheet.getRow(rowNumber).getCell(2)) || '').trim()
    if (!Number.isFinite(sequence) || sequence <= 0 || !name) continue
    const visits = {}
    for (const { column, date } of dateColumns) {
      const count = visitCount(cellText(sheet.getRow(rowNumber).getCell(column)))
      if (count > 0) visits[date] = { count, version: 1, updatedAt: now() }
    }
    rows.push({
      code: `${sheet.name}:${sequence}:${name}`,
      name,
      officeName,
      staffName,
      totalHomes: 1,
      visits,
    })
  }
  return rows
}

function parseVisitHistorySheet(sheet) {
  let headerRow = null
  let columns = null
  for (let rowNumber = 1; rowNumber <= Math.min(30, sheet.rowCount); rowNumber += 1) {
    const candidate = {
      office: findColumn(sheet, rowNumber, ['部門名', '営業所名', '営業所']),
      staff: findColumn(sheet, rowNumber, ['担当名', '担当者名', '営業員名', '営業担当']),
      code: findColumn(sheet, rowNumber, ['居宅コード', '事業者コード', '居宅cd']),
      provider: findColumn(sheet, rowNumber, ['事業者名', '居宅名', '居宅名称']),
      date: findColumn(sheet, rowNumber, ['日報日付', '訪問日付', '訪問日', '日付']),
      count: findColumn(sheet, rowNumber, ['訪問回数', '回数']),
    }
    if (candidate.provider && candidate.staff && candidate.date) {
      headerRow = rowNumber
      columns = candidate
      break
    }
  }
  if (!headerRow) return []

  const grouped = new Map()
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const name = String(cellText(row.getCell(columns.provider)) || '').trim()
    const staffName = String(cellText(row.getCell(columns.staff)) || '').trim().replace(/\s+/g, ' ')
    const date = excelDate(cellText(row.getCell(columns.date)))
    if (!name || !staffName || !date) continue
    const officeName = String(columns.office ? cellText(row.getCell(columns.office)) : '').trim() || '営業所'
    const externalCode = String(columns.code ? cellText(row.getCell(columns.code)) : '').trim()
    const key = `${officeName}\u0000${staffName}\u0000${externalCode || name}`
    if (!grouped.has(key)) {
      grouped.set(key, {
        code: `history:${externalCode || name}`,
        name,
        officeName,
        staffName,
        totalHomes: 1,
        visits: {},
      })
    }
    const provider = grouped.get(key)
    const count = columns.count ? visitCount(cellText(row.getCell(columns.count))) : 1
    if (count <= 0) continue
    const current = provider.visits[date]?.count || 0
    provider.visits[date] = { count: current + count, version: 1, updatedAt: now() }
  }
  return [...grouped.values()]
}

function splitTabDelimitedLine(line) {
  const cells = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1 }
      else quoted = !quoted
    } else if (character === '\t' && !quoted) {
      cells.push(value)
      value = ''
    } else value += character
  }
  cells.push(value)
  return cells
}

function decodeTabDelimitedXls(buffer) {
  const bytes = new Uint8Array(buffer)
  const oleHeader = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  if (oleHeader.every((value, index) => bytes[index] === value)) return null
  for (const encoding of ['utf-8', 'shift_jis']) {
    try {
      const text = new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, '')
      const header = text.slice(0, 4000)
      if (header.includes('\t') && /(事業者名|居宅名)/.test(header) && /(担当名|担当者名|営業員名)/.test(header)) return text
    } catch { /* try the next supported encoding */ }
  }
  return null
}

function parseTabDelimitedVisitHistory(text) {
  const lines = text.replace(/\u0000/g, '').split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length || lines.length > 2001) throw new Error('訪問履歴の行数は2000行以下にしてください。')
  const table = lines.map(splitTabDelimitedLine)
  if (table.some((row) => row.length > 100)) throw new Error('訪問履歴の列数は100列以下にしてください。')
  const headers = table[0].map(normalizedHeader)
  const findIndex = (aliases) => {
    const normalizedAliases = aliases.map(normalizedHeader)
    return headers.findIndex((header) => header && normalizedAliases.some((alias) => header === alias || header.includes(alias)))
  }
  const columns = {
    office: findIndex(['部門名', '営業所名', '営業所']),
    staff: findIndex(['担当名', '担当者名', '営業員名', '営業担当']),
    code: findIndex(['居宅コード', '事業者コード', '居宅cd']),
    provider: findIndex(['事業者名', '居宅名', '居宅名称']),
    date: findIndex(['日報日付', '訪問日付', '訪問日', '日付']),
    count: findIndex(['訪問回数', '回数']),
  }
  if (columns.provider < 0 || columns.staff < 0 || columns.date < 0) return []

  const grouped = new Map()
  for (const row of table.slice(1)) {
    const name = String(row[columns.provider] || '').trim()
    const staffName = String(row[columns.staff] || '').trim().replace(/\s+/g, ' ')
    const date = excelDate(row[columns.date])
    if (!name || !staffName || !date) continue
    const officeName = String(columns.office >= 0 ? row[columns.office] : '').trim() || '営業所'
    const externalCode = String(columns.code >= 0 ? row[columns.code] : '').trim()
    const key = `${officeName}\u0000${staffName}\u0000${externalCode || name}`
    if (!grouped.has(key)) grouped.set(key, {
      code: `history:${externalCode || name}`,
      name,
      officeName,
      staffName,
      totalHomes: 1,
      visits: {},
    })
    const provider = grouped.get(key)
    const count = columns.count >= 0 ? visitCount(row[columns.count]) : 1
    if (count <= 0) continue
    const current = provider.visits[date]?.count || 0
    provider.visits[date] = { count: current + count, version: 1, updatedAt: now() }
  }
  return [...grouped.values()]
}

export async function parseCalendarWorkbook(file) {
  if (!file || !/\.(xls|xlsx|xlsm)$/i.test(file.name)) throw new Error('取り込めるのは .xls、.xlsx、.xlsm 形式です。')
  if (file.size > 25 * 1024 * 1024) throw new Error('Excelファイルは25MB以下にしてください。')
  const buffer = await file.arrayBuffer()
  if (/\.xls$/i.test(file.name)) {
    const text = decodeTabDelimitedXls(buffer)
    if (!text) throw new Error('この .xls は旧式Excel形式です。Excelの「名前を付けて保存」で .xlsx に変換してください。')
    const parsed = parseTabDelimitedVisitHistory(text)
    if (!parsed.length) throw new Error('居宅データを読み取れませんでした。「事業者名・担当名・日報日付」の列を確認してください。')
    return parsed
  }
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  try { await workbook.xlsx.load(buffer) }
  catch { throw new Error('Excelファイルを読み取れませんでした。パスワード保護を解除し、.xlsx形式で保存し直してください。') }
  if (workbook.worksheets.length > 30) throw new Error('シート数は30以下にしてください。')

  const parsed = []
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > 2000 || sheet.columnCount > 100) throw new Error(`${sheet.name}シートの行数または列数が上限を超えています。`)
    const calendarRows = parseCalendarSheet(sheet)
    parsed.push(...(calendarRows.length ? calendarRows : parseVisitHistorySheet(sheet)))
  }
  if (!parsed.length) {
    throw new Error('居宅データを読み取れませんでした。「居宅カレンダー」または「事業者名・担当名・日報日付」の列がある訪問履歴Excelを選択してください。')
  }
  return parsed
}

function emptyData() {
  return { offices: [], staff: [], providers: [], imports: {}, attendanceDays: {}, retentionYears: 5, audit: [], initializedAt: now() }
}

function rowMonths(row) {
  return [...new Set(Object.keys(row.visits || {}).map((date) => date.slice(0, 7)))]
}

function mergeImportedRows(data, rows) {
  const incomingOfficeNames = [...new Set(rows.map((row) => row.officeName || '営業所'))]
  if (incomingOfficeNames.length > 19) throw new Error('1回に取り込める営業所は19営業所までです。')

  const officeByName = new Map(data.offices.map((office) => [office.name, office]))
  for (const officeName of incomingOfficeNames) {
    if (!officeByName.has(officeName)) {
      const office = { id: crypto.randomUUID(), name: officeName }
      data.offices.push(office)
      officeByName.set(officeName, office)
    }
  }

  const importedScopes = new Set()
  for (const row of rows) {
    const office = officeByName.get(row.officeName || '営業所')
    for (const month of rowMonths(row)) importedScopes.add(`${office.id}\u0000${month}`)
  }

  // A newer file for the same office/month replaces only that month's imported values.
  for (const scope of importedScopes) {
    const [officeId, month] = scope.split('\u0000')
    for (const provider of data.providers.filter((item) => item.officeId === officeId)) {
      for (const date of Object.keys(provider.visits || {})) if (date.startsWith(month)) delete provider.visits[date]
      if (provider.staffByMonth) delete provider.staffByMonth[month]
    }
  }

  const staffByOfficeAndName = new Map(data.staff.map((person) => [`${person.officeId}\u0000${person.name}`, person]))
  for (const officeName of incomingOfficeNames) {
    const office = officeByName.get(officeName)
    const adminKey = `${office.id}\u0000営業所管理者`
    if (!staffByOfficeAndName.has(adminKey)) {
      const admin = { id: crypto.randomUUID(), officeId: office.id, name: '営業所管理者', role: 'system_admin', active: true }
      data.staff.push(admin)
      staffByOfficeAndName.set(adminKey, admin)
    }
  }

  let visitTotal = 0
  for (const row of rows) {
    const office = officeByName.get(row.officeName || '営業所')
    const staffKey = `${office.id}\u0000${row.staffName}`
    let staff = staffByOfficeAndName.get(staffKey)
    if (!staff) {
      staff = { id: crypto.randomUUID(), officeId: office.id, name: row.staffName, role: 'staff', active: true }
      data.staff.push(staff)
      staffByOfficeAndName.set(staffKey, staff)
    }

    const canonicalCode = String(row.code || '').replace(/^(history:[^:]+):.*$/, '$1')
    let provider = data.providers.find((item) => item.officeId === office.id && item.code === canonicalCode)
      || data.providers.find((item) => item.officeId === office.id && item.name === row.name)
    if (!provider) {
      provider = { id: crypto.randomUUID(), officeId: office.id, code: canonicalCode, name: row.name, staffId: staff.id, staffByMonth: {}, totalHomes: row.totalHomes || 1, hiddenAt: null, visits: {} }
      data.providers.push(provider)
    }
    provider.code = canonicalCode
    provider.name = row.name
    provider.staffId = staff.id
    provider.staffByMonth ||= {}
    provider.visits ||= {}
    for (const month of rowMonths(row)) provider.staffByMonth[month] = staff.id
    for (const [date, visit] of Object.entries(row.visits || {})) {
      provider.visits[date] = visit
      visitTotal += visit.count
    }
  }

  data.imports ||= {}
  data.attendanceDays ||= {}
  return { data, visitTotal, importedScopes: [...importedScopes] }
}

function dataFromImport(rows) {
  return mergeImportedRows(emptyData(), rows).data
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY)) || seed()
    data.attendanceDays ||= {}
    data.imports ||= {}
    for (const provider of data.providers || []) provider.staffByMonth ||= {}
    return data
  } catch { return seed() }
}
function save(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)) }
function session() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) } catch { return null }
}
function currentStaff(data) { return data.staff.find((row) => row.id === session()?.user?.id) }
function staffForOffice(data, officeId) { return data.staff.filter((row) => row.officeId === officeId && row.active) }
function providerStaffId(provider, month) { return provider.staffByMonth?.[month] || provider.staffId }
function providerView(provider, data, month) {
  const visits = {}
  for (const [date, value] of Object.entries(provider.visits || {})) if (date.startsWith(month)) visits[String(Number(date.slice(-2)))] = value
  const visitTotal = Object.values(visits).reduce((sum, item) => sum + item.count, 0)
  const staffId = providerStaffId(provider, month)
  return { ...provider, staffId, externalCode: provider.code, homeId: null, staffName: data.staff.find((row) => row.id === staffId)?.name || '', sourceActive: true, visits, visitTotal, visitedEntityCount: visitTotal > 0 ? 1 : 0, visitRate: provider.totalHomes ? (visitTotal > 0 ? 100 : 0) : null }
}
function calendarResult(data, month, staffId, includeHidden) {
  const user = currentStaff(data)
  const scope = user?.role === 'staff' ? user.id : staffId
  const providers = data.providers.filter((row) => row.officeId === user.officeId && (!scope || providerStaffId(row, month) === scope) && (includeHidden || !row.hiddenAt)).map((row) => providerView(row, data, month)).filter((row) => row.visitTotal > 0)
  const totalHomes = providers.reduce((sum, row) => sum + row.totalHomes, 0)
  const visitTotal = providers.reduce((sum, row) => sum + row.visitTotal, 0)
  const visitedEntityCount = providers.reduce((sum, row) => sum + row.visitedEntityCount, 0)
  const scopedStaffIds = scope
    ? [scope]
    : staffForOffice(data, user.officeId).filter((row) => row.role === 'staff').map((row) => row.id)
  const attendanceDays = scopedStaffIds.reduce((sum, id) => sum + (Number(data.attendanceDays[`${user.officeId}:${id}:${month}`]) || 0), 0)
  return {
    month,
    providers,
    summary: {
      totalHomes,
      visitTotal,
      visitedEntityCount,
      attendanceDays,
      averageVisitCount: attendanceDays > 0 ? Math.round(visitTotal / attendanceDays * 10) / 10 : null,
      visitRate: totalHomes ? Math.round(visitedEntityCount / totalHomes * 1000) / 10 : null,
    },
  }
}

export function setCsrfToken() {}

export const api = {
  needsInitialImport() {
    return !localStorage.getItem(STORE_KEY)
  },
  async initialImport(file) {
    const rows = await parseCalendarWorkbook(file)
    const existing = localStorage.getItem(STORE_KEY) ? load() : null
    const data = existing ? mergeImportedRows(existing, rows).data : dataFromImport(rows)
    const importedMonth = [...new Set(rows.flatMap((row) => Object.keys(row.visits || {}).map((date) => date.slice(0, 7))))].sort().at(-1) || monthNow()
    save(data)
    sessionStorage.removeItem(SESSION_KEY)
    const officeName = rows[0]?.officeName || '営業所'
    const office = data.offices.find((row) => row.name === officeName)
    return {
      providerCount: rows.length,
      staffCount: new Set(rows.map((row) => row.staffName)).size,
      visitTotal: rows.reduce((sum, row) => sum + Object.values(row.visits).reduce((subtotal, visit) => subtotal + visit.count, 0), 0),
      officeId: office?.id,
      officeName,
      importedMonth,
    }
  },
  async publicOffices() {
    const data = load()
    return {
      offices: data.offices.filter((office) => data.staff.some((person) => person.officeId === office.id && person.role === 'staff')).map((office) => ({
        ...office,
        staff: [...staffForOffice(data, office.id)]
          .sort((left, right) => Number(left.role === 'staff') - Number(right.role === 'staff'))
          .map(({ id, name, role }) => ({ id, name, role })),
      })),
    }
  },
  async me() { return session() },
  async login(form) {
    const data = load()
    const office = data.offices.find((row) => row.id === form.officeId)
    const user = data.staff.find((row) => row.officeId === office?.id && row.role !== 'staff')
    if (!office || !user) throw new Error('営業所を選択してください。')
    const result = { user: { id: user.id, name: user.name, role: user.role }, office, csrfToken: '', permissions: { canViewOfficeAggregate: user.role !== 'staff', canViewStaffBreakdown: user.role !== 'staff', canImport: user.role !== 'staff', canManageSettings: user.role === 'system_admin', canDeletePermanently: user.role === 'system_admin' } }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(result)); return result
  },
  async logout() { sessionStorage.removeItem(SESSION_KEY) },
  async staff() { const data = load(); const user = currentStaff(data); return { staff: data.staff.filter((row) => row.officeId === user.officeId).map(({ id, name, role, active }) => ({ id, name, role, active })) } },
  async calendar({ month, staffId, includeHidden = false }) { return calendarResult(load(), month, staffId, includeHidden) },
  async updateAttendance({ month, staffId, days }) {
    const data = load()
    const user = currentStaff(data)
    const targetStaffId = user?.role === 'staff' ? user.id : staffId
    const target = data.staff.find((row) => row.id === targetStaffId && row.officeId === user?.officeId && row.role === 'staff')
    const normalizedDays = Math.trunc(Number(days))
    if (!target || !/^20\d{2}-\d{2}$/.test(month)) throw new Error('営業員と対象月を確認してください。')
    if (!Number.isFinite(normalizedDays) || normalizedDays < 0 || normalizedDays > 31) throw new Error('出勤日数は0日から31日の範囲で入力してください。')
    data.attendanceDays[`${user.officeId}:${target.id}:${month}`] = normalizedDays
    save(data)
    return { days: normalizedDays }
  },
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
    const rows = await parseCalendarWorkbook(file)
    const batchId = crypto.randomUUID(); const data = load(); data.imports[batchId] = { rows, archiveMissing, name: file.name }; save(data)
    const officesByName = new Map(data.offices.map((office) => [office.name, office.id]))
    const existing = new Set(data.providers.map((row) => `${row.officeId}\u0000${String(row.code || '').replace(/^(history:[^:]+):.*$/, '$1')}`))
    const added = rows.filter((row) => !existing.has(`${officesByName.get(row.officeName)}\u0000${String(row.code || '').replace(/^(history:[^:]+):.*$/, '$1')}`)).length
    const updated = rows.length - added
    const visitRows = rows.reduce((sum, row) => sum + Object.values(row.visits).reduce((subtotal, visit) => subtotal + visit.count, 0), 0)
    const months = [...new Set(rows.flatMap(rowMonths))].sort()
    const officeNames = [...new Set(rows.map((row) => row.officeName))]
    return { batchId, file: { name: file.name }, worksheetName: '訪問履歴', officeNames, months, diff: { added, updated, archived: 0, missing: 0, unchanged: 0, visitRows, uniqueVisits: visitRows, archiveMissing } }
  },
  async importConfirm(batchId) {
    const data = load(); const batch = data.imports[batchId]; if (!batch) throw new Error('取込データが見つかりません。')
    const { visitTotal: insertedVisits } = mergeImportedRows(data, batch.rows)
    const importedMonth = [...new Set(batch.rows.flatMap((row) => Object.keys(row.visits || {}).map((date) => date.slice(0, 7))))].sort().at(-1) || monthNow()
    const officeName = batch.rows[0]?.officeName || ''
    const officeId = data.offices.find((office) => office.name === officeName)?.id || ''
    delete data.imports[batchId]; save(data); return { insertedVisits, importedMonth, officeId, officeName }
  },
  async analytics({ fiscalYear, staffId, comparisonMonth }) {
    const data = load()
    const user = currentStaff(data)
    const officeStaff = staffForOffice(data, user.officeId).filter((person) => person.role === 'staff')
    const scopedStaffIds = user.role === 'staff' ? [user.id] : staffId ? [staffId] : officeStaff.map((person) => person.id)
    const round1 = (value) => Math.round(value * 10) / 10
    const months = Array.from({ length: 12 }, (_, index) => {
      const monthNumber = ((index + 3) % 12) + 1
      const year = index < 9 ? fiscalYear : fiscalYear + 1
      const key = `${year}-${String(monthNumber).padStart(2, '0')}`
      const calendar = calendarResult(data, key, staffId, false)
      return {
        month: key,
        label: `${monthNumber}月`,
        visitTotal: calendar.summary.visitTotal,
        visitedEntityCount: calendar.summary.visitedEntityCount,
        attendanceDays: calendar.summary.attendanceDays,
        averagePerProvider: calendar.summary.visitedEntityCount ? round1(calendar.summary.visitTotal / calendar.summary.visitedEntityCount) : null,
      }
    })
    const monthKeys = new Set(months.map((item) => item.month))
    // 今年度の月平均は常に12ではなく、実績が入力済みの月数で割る（例: 6,7,8月のみ入力済みなら3で割る）。
    const activeMonths = months.filter((item) => item.visitTotal > 0)
    const enteredMonthCount = activeMonths.length || 1
    const comparisonMonthKey = monthKeys.has(comparisonMonth)
      ? comparisonMonth
      : [...months].reverse().find((item) => item.visitTotal > 0)?.month || months[0].month
    const providerPerformance = data.providers.flatMap((provider) => {
      if (provider.officeId !== user.officeId || provider.hiddenAt) return []
      let visitTotal = 0
      const activeMonths = new Set()
      let latestMonth = ''
      let latestStaffId = provider.staffId
      for (const [date, visit] of Object.entries(provider.visits || {})) {
        const month = date.slice(0, 7)
        const assignedStaffId = providerStaffId(provider, month)
        if (!monthKeys.has(month) || !scopedStaffIds.includes(assignedStaffId)) continue
        visitTotal += visit.count
        if (visit.count > 0) activeMonths.add(month)
        if (month > latestMonth) { latestMonth = month; latestStaffId = assignedStaffId }
      }
      if (!visitTotal) return []
      const comparisonVisitTotal = Object.entries(provider.visits || {}).reduce((sum, [date, visit]) => {
        if (!date.startsWith(comparisonMonthKey) || !scopedStaffIds.includes(providerStaffId(provider, comparisonMonthKey))) return sum
        return sum + visit.count
      }, 0)
      const fiscalMonthlyAverage = round1(visitTotal / enteredMonthCount)
      return [{
        id: provider.id,
        name: provider.name,
        staffName: data.staff.find((person) => person.id === latestStaffId)?.name || '',
        visitTotal,
        monthsVisited: activeMonths.size,
        averagePerActiveMonth: round1(visitTotal / activeMonths.size),
        fiscalMonthlyAverage,
        comparisonVisitTotal,
        comparisonDifference: round1(comparisonVisitTotal - fiscalMonthlyAverage),
      }]
    }).sort((left, right) => right.visitTotal - left.visitTotal || left.name.localeCompare(right.name, 'ja'))

    const visitTotal = months.reduce((sum, item) => sum + item.visitTotal, 0)
    const monthlyVisitedEntityTotal = months.reduce((sum, item) => sum + item.visitedEntityCount, 0)
    const attendanceDays = months.reduce((sum, item) => sum + item.attendanceDays, 0)
    const attendanceEnteredStaffCount = scopedStaffIds.filter((id) => months.some((item) => Number(data.attendanceDays[`${user.officeId}:${id}:${item.month}`]) > 0)).length
    const attendanceComplete = scopedStaffIds.length > 0 && attendanceEnteredStaffCount === scopedStaffIds.length
    const latestRecordedIndex = months.reduce((latest, item, index) => item.visitTotal > 0 ? index : latest, -1)
    const latestMonth = latestRecordedIndex >= 0 ? months[latestRecordedIndex] : null
    const previousMonth = latestRecordedIndex > 0 ? months[latestRecordedIndex - 1] : null
    const topMonth = activeMonths.reduce((best, item) => !best || item.visitTotal > best.visitTotal ? item : best, null)
    const topFiveVisits = providerPerformance.slice(0, 5).reduce((sum, item) => sum + item.visitTotal, 0)
    const repeatProviderCount = providerPerformance.filter((item) => item.monthsVisited >= 2).length
    const frequencyBands = [
      { label: '1回', count: providerPerformance.filter((item) => item.visitTotal === 1).length },
      { label: '2〜3回', count: providerPerformance.filter((item) => item.visitTotal >= 2 && item.visitTotal <= 3).length },
      { label: '4〜5回', count: providerPerformance.filter((item) => item.visitTotal >= 4 && item.visitTotal <= 5).length },
      { label: '6回以上', count: providerPerformance.filter((item) => item.visitTotal >= 6).length },
    ]
    const staffBreakdown = officeStaff.filter((person) => scopedStaffIds.includes(person.id)).map((person) => {
      const staffMonths = months.map((item) => calendarResult(data, item.month, person.id, false))
      const personVisitTotal = staffMonths.reduce((sum, item) => sum + item.summary.visitTotal, 0)
      const personAttendance = staffMonths.reduce((sum, item) => sum + item.summary.attendanceDays, 0)
      const personProviders = data.providers.filter((provider) => provider.officeId === user.officeId && [...monthKeys].some((month) => providerStaffId(provider, month) === person.id && Object.entries(provider.visits || {}).some(([date, visit]) => date.startsWith(month) && visit.count > 0))).length
      return {
        id: person.id,
        name: person.name,
        visitTotal: personVisitTotal,
        providerCount: personProviders,
        activeMonths: staffMonths.filter((item) => item.summary.visitTotal > 0).length,
        attendanceDays: personAttendance,
        visitsPerAttendanceDay: personAttendance ? round1(personVisitTotal / personAttendance) : null,
        monthlyAverage: round1(personVisitTotal / enteredMonthCount),
        share: visitTotal ? round1(personVisitTotal / visitTotal * 100) : 0,
      }
    }).sort((left, right) => right.visitTotal - left.visitTotal)

    return {
      fiscalYear,
      months,
      summary: {
        visitTotal,
        visitedEntityCount: monthlyVisitedEntityTotal,
        uniqueProviderCount: providerPerformance.length,
        activeMonthCount: activeMonths.length,
        attendanceDays,
        attendanceEnteredStaffCount,
        attendanceTargetStaffCount: scopedStaffIds.length,
        attendanceComplete,
        staffAverage: scopedStaffIds.length ? round1(visitTotal / scopedStaffIds.length) : null,
        monthlyAverage: round1(visitTotal / enteredMonthCount),
        activeMonthAverage: activeMonths.length ? round1(visitTotal / activeMonths.length) : null,
        visitsPerAttendanceDay: attendanceDays && attendanceComplete ? round1(visitTotal / attendanceDays) : null,
        concentrationTopFive: visitTotal ? round1(topFiveVisits / visitTotal * 100) : null,
        repeatProviderRate: activeMonths.length >= 2 && providerPerformance.length ? round1(repeatProviderCount / providerPerformance.length * 100) : null,
      },
      movement: {
        latestMonth,
        previousMonth,
        change: latestMonth && previousMonth ? latestMonth.visitTotal - previousMonth.visitTotal : null,
        changeRate: latestMonth && previousMonth?.visitTotal ? round1((latestMonth.visitTotal - previousMonth.visitTotal) / previousMonth.visitTotal * 100) : null,
        topMonth,
      },
      frequencyBands,
      comparisonMonth: comparisonMonthKey,
      providerComparison: [...providerPerformance].sort((left, right) => right.comparisonVisitTotal - left.comparisonVisitTotal || right.visitTotal - left.visitTotal || left.name.localeCompare(right.name, 'ja')),
      providerRanking: providerPerformance.slice(0, 10),
      staffBreakdown,
    }
  },
  async settings() { const data = load(); return { retentionYears: data.retentionYears, storageMode: '端末内保存（通信APIなし）' } },
  async updateSettings(values) { const data = load(); data.retentionYears = Math.max(5, Number(values.retentionYears) || 5); save(data) },
  async updatePin() { return { ok: true } },
  async audit() { return { logs: load().audit } },
  async pdf() { throw new Error('印刷タブからブラウザーの「PDFとして保存」を使用してください。') },
}
