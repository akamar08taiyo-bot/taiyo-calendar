// 「居宅別売上推移表」（担当者別・事業所別の月次売上推移）を読み取り、事業所ごとの月次売上に変換するパーサー。
// 営業所ごとに1シート（シート名は「行橋」のような略称）。行は居宅事業所、列は前年3月〜当年3月の月次売上。
// 「※※※※　担当者合計　※※※※」等の小計行（事業所コード 9999999999）は除外する。

function cellRaw(row, col) {
  const v = row.getCell(col).value
  if (v && typeof v === 'object' && 'result' in v) return v.result
  if (v && typeof v === 'object' && 'text' in v) return v.text
  return v
}
function cellText(row, col) {
  const v = cellRaw(row, col)
  return v == null ? '' : String(v).replace(/\r?\n/g, '').trim()
}
function cellNumber(row, col) {
  const v = cellRaw(row, col)
  if (v == null || v === '') return 0
  const s = String(v).trim().replace(/,/g, '')
  const neg = /^\(.*\)$/.test(s)
  const n = Number(s.replace(/[()]/g, ''))
  if (!Number.isFinite(n)) return 0
  return neg ? -n : n
}

async function loadWorkbook(file) {
  if (!file) throw new Error('ファイルが選択されていません。')
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) throw new Error('取り込めるのは .xlsx または .xlsm 形式です。')
  if (file.size > 25 * 1024 * 1024) throw new Error('Excelファイルは25MB以下にしてください。')
  const buffer = await file.arrayBuffer()
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  try { await workbook.xlsx.load(buffer, { ignoreNodes: ['dataValidations', 'hyperlinks', 'conditionalFormatting'] }) }
  catch { throw new Error('Excelファイルを読み取れませんでした。パスワード保護を解除し、.xlsx形式で保存し直してください。') }
  return workbook
}

// ファイル名（例：「居宅別売上推移表_2026年7月.xlsx」）から年度・当月を読み取る。
// シート内には年度・月を示すセルがないため、ファイル名の年月を基準に「前年3月〜当年3月」の12列を割り当てる。
function fiscalYearFromFileName(fileName) {
  const m = fileName.match(/(\d{4})年(\d{1,2})月/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  return month >= 4 ? year : year - 1
}

const NON_PROVIDER_MARK = /^※+/

function parseProviderSalesSheet(sheet, fiscalYear) {
  const headerRow = sheet.getRow(2)
  let nameCol = null, repCol = null, lastMarCol = null
  const monthCols = {} // '04'..'03' -> col
  for (let c = 1; c <= sheet.columnCount; c++) {
    const text = cellText(headerRow, c)
    if (!text) continue
    if (text === '事業所') nameCol = c
    else if (text === '現担当者') repCol = c
    else if (text === '前年3月') lastMarCol = c
    else {
      const m = text.match(/^(\d{1,2})月$/)
      if (m) monthCols[String(Number(m[1])).padStart(2, '0')] = c
    }
  }
  if (!nameCol || Object.keys(monthCols).length < 6) return null

  const providers = {}
  for (let r = 3; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const name = cellText(row, nameCol)
    if (!name || NON_PROVIDER_MARK.test(name)) continue
    const monthlySales = {}
    for (const [monthKey, col] of Object.entries(monthCols)) {
      const calendarYear = Number(monthKey) >= 4 ? fiscalYear : fiscalYear + 1
      monthlySales[`${calendarYear}-${monthKey}`] = Math.round(cellNumber(row, col))
    }
    providers[name] = {
      repName: repCol ? cellText(row, repCol).replace(/[\s　]+/g, '') : '',
      lastMarSales: lastMarCol ? Math.round(cellNumber(row, lastMarCol)) : 0,
      monthlySales,
    }
  }
  if (!Object.keys(providers).length) return null
  return { providers }
}

// 戻り値: { fiscalYear, offices: { [officeName]: { providers } } }
export async function parseProviderSalesWorkbook(file) {
  const workbook = await loadWorkbook(file)
  const fiscalYear = fiscalYearFromFileName(file.name)
  if (!fiscalYear) throw new Error('ファイル名から年度・月を読み取れませんでした（例：「居宅別売上推移表_2026年7月.xlsx」のような名前にしてください）。')

  const offices = {}
  for (const sheet of workbook.worksheets) {
    const parsed = parseProviderSalesSheet(sheet, fiscalYear)
    if (!parsed) continue
    const officeName = /営業所$/.test(sheet.name) ? sheet.name : `${sheet.name}営業所`
    offices[officeName] = parsed
  }
  if (!Object.keys(offices).length) throw new Error('「居宅別売上推移表」の営業所別シートが見つかりませんでした。')
  return { fiscalYear, offices }
}
