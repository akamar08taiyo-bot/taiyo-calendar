// 営業月報：既存の月次Excel資料を読み取り、担当者ごとの数字に変換するパーサー。
// 対応ファイル:
//   ①「売上状況報告書」… シート名「レンタル個人売上状況報告書（営業所名）」（新規納品・前月回収・当月回収・目標値）
//   ②「営業所／担当別売上実績」… シート名「担当別売上実績」（レンタル／住宅改修／商品販売の単月・年度累計）

function cellRaw(row, col) {
  const v = row.getCell(col).value
  if (v && typeof v === 'object' && 'result' in v) return v.result
  if (v && typeof v === 'object' && 'text' in v) return v.text
  return v
}
function cellText(row, col) {
  const v = cellRaw(row, col)
  return v == null ? '' : String(v).trim()
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
  // 値しか使わないため、書式・画像・ハイパーリンクの解析は省いて読み込みを軽くする。
  try { await workbook.xlsx.load(buffer, { ignoreNodes: ['dataValidations', 'hyperlinks', 'drawing', 'picture', 'conditionalFormatting'] }) }
  catch { throw new Error('Excelファイルを読み取れませんでした。パスワード保護を解除し、.xlsx形式で保存し直してください。') }
  return workbook
}

/* ---------- ①売上状況報告書（レンタル個人売上状況報告書（営業所名）） ---------- */
function parseSalesStatusSheet(sheet) {
  const headerRow = sheet.getRow(4)
  const reps = []
  for (let col = 4; col <= 12; col += 2) {
    const name = cellText(headerRow, col)
    if (!name || name === '－－－－' || name === 'その他' || name === '合計') break
    reps.push({ name: name.replace(/[\s　]+/g, ''), col })
  }
  if (!reps.length) return null

  // このファイルからは新規納品・前月回収・当月回収・目標値のみを採用する。
  // 商品販売／住宅改修の予算・実績は「営業所／担当別売上実績」（②）を参照する。
  const rowsByKey = {}
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const a = cellText(row, 1)
    const b = cellText(row, 2)
    if (!rowsByKey.rentalNouhinKeikei && (a === '新規納品レンタル合計（ａ）' || b === '新規納品レンタル合計（ａ）')) rowsByKey.rentalNouhinKeikei = row
    else if (!rowsByKey.zenGetsuKaishu && (/^\d+月度回収レンタル計$/.test(a) || /^\d+月度回収レンタル計$/.test(b))) rowsByKey.zenGetsuKaishu = row
    else if (!rowsByKey.mokuhyou && (a === '新規レンタル納品額 月間目標' || b === '新規レンタル納品額 月間目標')) rowsByKey.mokuhyou = row
    else if (!rowsByKey.touGetsuKaishu && (a === '回収済みレンタル合計（ｂ）' || b === '回収済みレンタル合計（ｂ）')) rowsByKey.touGetsuKaishu = row
  }

  const reps_ = {}
  for (const rep of reps) {
    const fromAmountCol = (key) => {
      const row = rowsByKey[key]
      return row ? Math.round(cellNumber(row, rep.col + 1) / 1000) : 0
    }
    reps_[rep.name] = {
      rentalNouhinKeikei: fromAmountCol('rentalNouhinKeikei'),
      zenGetsuKaishu: fromAmountCol('zenGetsuKaishu'),
      mokuhyou: fromAmountCol('mokuhyou'),
      touGetsuKaishu: fromAmountCol('touGetsuKaishu'),
    }
  }

  // シート右上の「2026年7月1日～2026年7月31日　売上報告書」から年度・月を自動判定する。
  const fiscalYear = Number(cellRaw(sheet.getRow(1), 1)) || null
  const titleText = cellText(sheet.getRow(1), 4)
  const monthMatch = titleText.match(/年(\d{1,2})月(\d{1,2})日/)
  const monthKey = monthMatch ? String(Number(monthMatch[1])).padStart(2, '0') : null

  return { fiscalYear, monthKey, reps: reps_ }
}

export async function parseSalesStatusWorkbook(file) {
  return parseSalesStatusFromWorkbook(await loadWorkbook(file))
}

function parseSalesStatusFromWorkbook(workbook) {
  const result = {}
  let fiscalYear = null
  let monthKey = null
  for (const sheet of workbook.worksheets) {
    const m = sheet.name.match(/^レンタル個人売上状況報告書（(.+)）$/)
    if (!m) continue
    const parsed = parseSalesStatusSheet(sheet)
    if (parsed && Object.keys(parsed.reps).length) {
      result[`${m[1]}営業所`] = { reps: parsed.reps }
      if (fiscalYear == null) fiscalYear = parsed.fiscalYear
      if (monthKey == null) monthKey = parsed.monthKey
    }
  }
  if (!Object.keys(result).length) throw new Error('「レンタル個人売上状況報告書（営業所名）」という名前のシートが見つかりませんでした。')
  return { fiscalYear, monthKey, offices: result } // offices: { [officeName]: { reps: { [repName]: {4項目} } } }
}

/* ---------- ②営業所／担当別売上実績（担当別売上実績シート：レンタル予算・実績の累計） ---------- */
function findRepPerformanceSheet(workbook) {
  return workbook.worksheets.find((s) => s.name === '担当別売上実績') || null
}

// 担当別売上実績シートは4月〜3月の12ヶ月分が横に並んでいる（1つのファイルに全月分が入っている）ため、
// 選択中の月だけでなく、シートに存在する月をすべて一度に読み取る。
export async function parseRepPerformanceWorkbook(file) {
  return parseRepPerformanceFromWorkbook(await loadWorkbook(file))
}

function parseRepPerformanceFromWorkbook(workbook) {
  const sheet = findRepPerformanceSheet(workbook)
  if (!sheet) throw new Error('「担当別売上実績」という名前のシートが見つかりませんでした。')

  const fiscalYear = Number(cellRaw(sheet.getRow(1), 1)) || null
  const blockHeaderRow = sheet.getRow(3)
  // monthNum(1-12) -> { tankiYosan, tankiJisseki, ruikeiYosan, ruikeiJisseki }
  const monthCols = {}
  for (let col = 4; col <= sheet.columnCount; col++) {
    // 単月ブロックの見出しセルは「4月売上」という文字列ではなく、月の数値（4など）がそのまま入っており、
    // セルの表示形式（ユーザー定義書式）で「○月売上」に見せているだけ。同じ数値が予算/実績/予算差/達成率の
    // 4列にわたって入っているため、最初に見つかった列だけを採用する。
    const raw = cellRaw(blockHeaderRow, col)
    if (typeof raw === 'number' && raw >= 1 && raw <= 12) {
      if (!monthCols[raw]) monthCols[raw] = {}
      if (monthCols[raw].tankiYosan == null) { monthCols[raw].tankiYosan = col; monthCols[raw].tankiJisseki = col + 1 }
    }
    const label = cellText(blockHeaderRow, col)
    const m = label.match(/累計（(\d+)月末時点）$/)
    if (m) {
      const mn = Number(m[1])
      if (!monthCols[mn]) monthCols[mn] = {}
      if (monthCols[mn].ruikeiYosan == null) { monthCols[mn].ruikeiYosan = col; monthCols[mn].ruikeiJisseki = col + 1 }
    }
  }
  const months = Object.entries(monthCols).filter(([, c]) => c.tankiYosan != null && c.ruikeiYosan != null)
  if (!months.length) throw new Error('このファイルから月別データの列が見つかりませんでした。')

  // 各営業所ブロックの末尾には「予備」担当（空枠）や「営業所合計」「営業部合計」「本社売上」「総合計」といった
  // 小計・全社集計の行が、担当者行と同じ列構成で続く。実在の担当者行ではないため除外する。
  const AGGREGATE_LABELS = /合計|^本社売上$/
  const PLACEHOLDER_REPS = new Set(['予備', 'その他'])
  const ITEM_KEYS = { 'レンタル売上': 'rental', '住宅改修': 'kaishuu', '商品販売': 'hanbai' }

  const result = {}
  let currentOffice = ''
  let currentRep = ''
  for (let r = 5; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const officeCell = cellText(row, 1)
    const repCell = cellText(row, 2)
    const itemCell = cellText(row, 3)
    if (officeCell) currentOffice = officeCell
    if (repCell) currentRep = repCell
    if (!currentOffice || !currentRep) continue
    const itemKey = ITEM_KEYS[itemCell]
    if (!itemKey) continue
    if (AGGREGATE_LABELS.test(currentOffice) || AGGREGATE_LABELS.test(currentRep) || PLACEHOLDER_REPS.has(currentRep)) continue
    const officeName = /営業所$/.test(currentOffice) ? currentOffice : `${currentOffice}営業所`
    if (!result[officeName]) result[officeName] = { reps: {} }
    if (!result[officeName].reps[currentRep]) result[officeName].reps[currentRep] = {}
    const repByMonth = result[officeName].reps[currentRep]

    for (const [monthNumStr, c] of months) {
      const monthKey = monthNumStr.padStart(2, '0')
      if (!repByMonth[monthKey]) repByMonth[monthKey] = {}
      const rep = repByMonth[monthKey]
      // シートの表示単位は千円だが、セルの生の値は円で入っている（表示形式で1000分の1に見せている）ため、ここで換算する。
      const tankiYosan = Math.round(cellNumber(row, c.tankiYosan) / 1000)
      const tankiJisseki = Math.round(cellNumber(row, c.tankiJisseki) / 1000)
      const ruikeiYosan = Math.round(cellNumber(row, c.ruikeiYosan) / 1000)
      const ruikeiJisseki = Math.round(cellNumber(row, c.ruikeiJisseki) / 1000)
      if (itemKey === 'rental') {
        rep.rentalYosanTanki = tankiYosan
        rep.rentalJissekiTanki = tankiJisseki
        rep.rentalYosanAtsumu = ruikeiYosan
        rep.rentalJissekiAtsumu = ruikeiJisseki
      } else if (itemKey === 'kaishuu') {
        rep.kaishuuYosan = tankiYosan
        rep.kaishuuUriage = tankiJisseki
        rep.kaishuuYosanAtsumu = ruikeiYosan
        rep.kaishuuUriageAtsumu = ruikeiJisseki
      } else if (itemKey === 'hanbai') {
        rep.hanbaiYosan = tankiYosan
        rep.hanbaiUriage = tankiJisseki
        rep.hanbaiYosanAtsumu = ruikeiYosan
        rep.hanbaiUriageAtsumu = ruikeiJisseki
      }
    }
  }
  if (!Object.keys(result).length) throw new Error('担当者別の売上データが見つかりませんでした。')
  return { fiscalYear, offices: result } // offices: { [officeName]: { reps: { [repName]: { [monthKey]: {...} } } } }
}

// ファイルの中身を見て、どちらの形式かを自動判定して読み込む。
export async function parseSalesWorkbookAuto(file) {
  // Excelの解析は重いので、判定と読み取りで1回のロードを使い回す。
  const workbook = await loadWorkbook(file)
  const hasStatusSheet = workbook.worksheets.some((s) => /^レンタル個人売上状況報告書（.+）$/.test(s.name))
  if (hasStatusSheet) {
    const { fiscalYear, monthKey, offices } = parseSalesStatusFromWorkbook(workbook)
    return { type: 'status', fiscalYear, monthKey, data: offices }
  }
  if (findRepPerformanceSheet(workbook)) {
    const { fiscalYear, offices } = parseRepPerformanceFromWorkbook(workbook)
    return { type: 'performance', fiscalYear, data: offices }
  }
  throw new Error('対応している売上状況報告書・担当別売上実績のシートが見つかりませんでした。')
}
