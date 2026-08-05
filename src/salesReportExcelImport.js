// 営業月報：既存の月次Excel資料を読み取り、担当者ごとの数字に変換するパーサー。
// 対応ファイル:
//   ①「売上状況報告書」… シート名「レンタル個人売上状況報告書（営業所名）」
//   ②「営業所／担当別売上実績」… シート名「担当別売上実績」（レンタル予算・実績の累計のみ）

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
  try { await workbook.xlsx.load(buffer) }
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

  let currentB = ''
  const rowsByKey = {}
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const a = cellText(row, 1)
    const b = cellText(row, 2)
    const c = cellText(row, 3)
    if (b) currentB = b
    // 「■販売売上状況報告」の商品販売／住宅改修 予算・売上は、後段の「販売売上　利益額」「販売利益」の
    // セクションにも同名ラベル（商品販売／予算金額 など）が再登場するため、最初に見つかった行のみを採用する。
    if (!rowsByKey.rentalNouhinKeikei && (a === '新規納品レンタル合計（ａ）' || b === '新規納品レンタル合計（ａ）')) rowsByKey.rentalNouhinKeikei = row
    else if (!rowsByKey.zenGetsuKaishu && (/^\d+月度回収レンタル計$/.test(a) || /^\d+月度回収レンタル計$/.test(b))) rowsByKey.zenGetsuKaishu = row
    else if (!rowsByKey.mokuhyou && (a === '新規レンタル納品額 月間目標' || b === '新規レンタル納品額 月間目標')) rowsByKey.mokuhyou = row
    else if (!rowsByKey.touGetsuKaishu && (a === '回収済みレンタル合計（ｂ）' || b === '回収済みレンタル合計（ｂ）')) rowsByKey.touGetsuKaishu = row
    else if (!rowsByKey.hanbaiYosan && currentB === '商品販売' && c === '予算金額') rowsByKey.hanbaiYosan = row
    else if (!rowsByKey.hanbaiUriage && currentB === '商品販売' && c === '売上金額') rowsByKey.hanbaiUriage = row
    else if (!rowsByKey.kaishuuYosan && currentB === '住宅改修' && c === '予算金額') rowsByKey.kaishuuYosan = row
    else if (!rowsByKey.kaishuuUriage && currentB === '住宅改修' && c === '売上金額') rowsByKey.kaishuuUriage = row
  }

  const reps_ = {}
  for (const rep of reps) {
    const fromAmountCol = (key) => {
      const row = rowsByKey[key]
      return row ? Math.round(cellNumber(row, rep.col + 1) / 1000) : 0
    }
    const fromDirectCol = (key) => {
      const row = rowsByKey[key]
      return row ? Math.round(cellNumber(row, rep.col) / 1000) : 0
    }
    reps_[rep.name] = {
      rentalNouhinKeikei: fromAmountCol('rentalNouhinKeikei'),
      zenGetsuKaishu: fromAmountCol('zenGetsuKaishu'),
      mokuhyou: fromAmountCol('mokuhyou'),
      touGetsuKaishu: fromAmountCol('touGetsuKaishu'),
      hanbaiYosan: fromDirectCol('hanbaiYosan'),
      hanbaiUriage: fromDirectCol('hanbaiUriage'),
      kaishuuYosan: fromDirectCol('kaishuuYosan'),
      kaishuuUriage: fromDirectCol('kaishuuUriage'),
    }
  }
  return reps_
}

export async function parseSalesStatusWorkbook(file) {
  const workbook = await loadWorkbook(file)
  const result = {}
  for (const sheet of workbook.worksheets) {
    const m = sheet.name.match(/^レンタル個人売上状況報告書（(.+)）$/)
    if (!m) continue
    const reps = parseSalesStatusSheet(sheet)
    if (reps && Object.keys(reps).length) result[`${m[1]}営業所`] = { reps }
  }
  if (!Object.keys(result).length) throw new Error('「レンタル個人売上状況報告書（営業所名）」という名前のシートが見つかりませんでした。')
  return result // { [officeName]: { reps: { [repName]: {8項目} } } }
}

/* ---------- ②営業所／担当別売上実績（担当別売上実績シート：レンタル予算・実績の累計） ---------- */
function findRepPerformanceSheet(workbook) {
  return workbook.worksheets.find((s) => s.name === '担当別売上実績') || null
}

export async function parseRepPerformanceWorkbook(file, monthKey) {
  const workbook = await loadWorkbook(file)
  const sheet = findRepPerformanceSheet(workbook)
  if (!sheet) throw new Error('「担当別売上実績」という名前のシートが見つかりませんでした。')

  const monthNum = Number(monthKey)
  const blockHeaderRow = sheet.getRow(3)
  let ruikeiBudgetCol = null, ruikeiJissekiCol = null
  for (let col = 4; col <= sheet.columnCount; col++) {
    const label = cellText(blockHeaderRow, col)
    if (new RegExp(`累計（${monthNum}月末時点）$`).test(label)) {
      ruikeiBudgetCol = col
      ruikeiJissekiCol = col + 1
      break
    }
  }
  if (ruikeiBudgetCol == null) throw new Error(`このファイルに${monthNum}月の累計データが見つかりませんでした。`)

  // 各営業所ブロックの末尾には「予備」担当（空枠）や「営業所合計」「営業部合計」「本社売上」「総合計」といった
  // 小計・全社集計の行が、担当者行と同じ列構成（項目＝レンタル売上）で続く。実在の担当者行ではないため除外する。
  const AGGREGATE_LABELS = /合計|^本社売上$/
  const PLACEHOLDER_REPS = new Set(['予備', 'その他'])

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
    if (itemCell !== 'レンタル売上') continue
    if (AGGREGATE_LABELS.test(currentOffice) || AGGREGATE_LABELS.test(currentRep) || PLACEHOLDER_REPS.has(currentRep)) continue
    const officeName = /営業所$/.test(currentOffice) ? currentOffice : `${currentOffice}営業所`
    if (!result[officeName]) result[officeName] = { reps: {} }
    result[officeName].reps[currentRep] = {
      // シートの表示単位は千円だが、セルの生の値は円で入っている（表示形式で1000分の1に見せている）ため、ここで換算する。
      rentalYosanAtsumu: Math.round(cellNumber(row, ruikeiBudgetCol) / 1000),
      rentalJissekiAtsumu: Math.round(cellNumber(row, ruikeiJissekiCol) / 1000),
    }
  }
  if (!Object.keys(result).length) throw new Error('担当者別のレンタル売上データが見つかりませんでした。')
  return result // { [officeName]: { reps: { [surnameOnly]: { rentalYosanAtsumu, rentalJissekiAtsumu } } } }
}

// ファイルの中身を見て、どちらの形式かを自動判定して読み込む。
export async function parseSalesWorkbookAuto(file, monthKey) {
  const workbook = await loadWorkbook(file)
  const hasStatusSheet = workbook.worksheets.some((s) => /^レンタル個人売上状況報告書（.+）$/.test(s.name))
  if (hasStatusSheet) {
    const result = {}
    for (const sheet of workbook.worksheets) {
      const m = sheet.name.match(/^レンタル個人売上状況報告書（(.+)）$/)
      if (!m) continue
      const reps = parseSalesStatusSheet(sheet)
      if (reps && Object.keys(reps).length) result[`${m[1]}営業所`] = { reps }
    }
    if (Object.keys(result).length) return { type: 'status', data: result }
  }
  const repSheet = findRepPerformanceSheet(workbook)
  if (repSheet) {
    const data = await parseRepPerformanceWorkbook(file, monthKey)
    return { type: 'performance', data }
  }
  throw new Error('対応している売上状況報告書・担当別売上実績のシートが見つかりませんでした。')
}
