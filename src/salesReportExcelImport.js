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

// グラフ（円グラフ・レーダーチャート等）を大量に含むExcel/xlsmは、ExcelJSがdrawing/chartパートの
// 相互参照を解決する際に例外を投げて読み込みごと失敗することがある（値を読むだけなら不要な情報のため、
// ZIPの段階でdrawing/chart関連パートを取り除いてから渡す）。セルの値・数式結果には影響しない。
async function stripDrawingsAndCharts(buffer) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  const names = Object.keys(zip.files)
  if (!names.some((name) => /^xl\/(drawings|charts)\//.test(name))) return buffer // 図・グラフがなければそのまま

  for (const name of names) {
    if (/^xl\/(drawings|charts)\//.test(name)) zip.remove(name)
  }
  for (const name of names) {
    if (!/^xl\/worksheets\/_rels\/.*\.xml\.rels$/.test(name)) continue
    const text = await zip.files[name]?.async('string')
    if (!text) continue
    const cleaned = text.replace(/<Relationship[^>]*Type="[^"]*\/(drawing|vmlDrawing)"[^>]*\/>/g, '')
    if (cleaned !== text) zip.file(name, cleaned)
  }
  for (const name of names) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue
    const text = await zip.files[name]?.async('string')
    if (!text) continue
    const cleaned = text.replace(/<drawing[^>]*\/>/g, '').replace(/<legacyDrawing[^>]*\/>/g, '')
    if (cleaned !== text) zip.file(name, cleaned)
  }
  const ctName = '[Content_Types].xml'
  if (zip.files[ctName]) {
    const text = await zip.files[ctName].async('string')
    const cleaned = text.replace(/<Override[^>]*PartName="\/xl\/(drawings|charts)\/[^"]*"[^>]*\/>/g, '')
    if (cleaned !== text) zip.file(ctName, cleaned)
  }
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function loadWorkbook(file) {
  if (!file) throw new Error('ファイルが選択されていません。')
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) throw new Error('取り込めるのは .xlsx または .xlsm 形式です。')
  if (file.size > 25 * 1024 * 1024) throw new Error('Excelファイルは25MB以下にしてください。')
  const rawBuffer = await file.arrayBuffer()
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  // 値しか使わないため、書式・ハイパーリンクの解析は省いて読み込みを軽くする。
  const loadOptions = { ignoreNodes: ['dataValidations', 'hyperlinks', 'conditionalFormatting'] }
  try {
    const buffer = await stripDrawingsAndCharts(rawBuffer)
    await workbook.xlsx.load(buffer, loadOptions)
  } catch {
    try { await workbook.xlsx.load(rawBuffer, loadOptions) }
    catch { throw new Error('Excelファイルを読み取れませんでした。パスワード保護を解除し、.xlsx形式で保存し直してください。') }
  }
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

/* ---------- ③販売区分・商品分類別 販売売上（住宅改修／福祉用具／紙おむつ／消耗品の件数・売上） ---------- */
// このファイルは営業所ごとに1シート（シート名は「行橋」のような略称で、営業所名はシート内のタイトルに
// 【　○○営業所　】として入っている）。1つのブックに全営業所分が入っていることも、1営業所分だけのことも
// あるため、シート名では判定せず、各シートの中身（タイトル行）を見て対象シートを判定する。

// シートの行見出し（①住宅改修売上 など）を、営業月報の販売内訳項目（HANBAI_ITEMS）へ対応させる。
const HANBAI_ROW_MAP = [
  [/^①.*住宅改修/, '①住宅改修'],
  [/^②.*特定福祉用具/, '②特定福祉用具'],
  [/^③.*一般福祉用具/, '③一般福祉用具'],
  [/^④.*紙おむつ/, '④紙おむつ販売'],
  [/^⑤.*消耗品/, '⑤消耗品販売'],
]

function parseHanbaiBunruiSheet(sheet) {
  // タイトル部分（例:「2026年度 7月　販売区分・商品分類別 販売売上　【 行橋営業所 】」、複数セルに分かれて重複格納されている）
  // から営業所・年度・月を読み取る。「商品分類別」「販売売上」の両方が現れないシートは対象外として扱う。
  let officeName = null, fiscalYear = null, monthKey = null, isTarget = false
  for (let r = 1; r <= Math.min(sheet.rowCount, 8) && (!officeName || !fiscalYear); r++) {
    const row = sheet.getRow(r)
    for (let c = 1; c <= sheet.columnCount; c++) {
      const text = cellText(row, c)
      if (!text) continue
      if (/商品分類別/.test(text) && /販売売上/.test(text)) isTarget = true
      const officeMatch = text.match(/【\s*(.+?)\s*】/)
      if (officeMatch && !officeName) officeName = /営業所$/.test(officeMatch[1]) ? officeMatch[1] : `${officeMatch[1]}営業所`
      const dateMatch = text.match(/(\d{4})年度\s*(\d{1,2})月/)
      if (dateMatch && fiscalYear == null) { fiscalYear = Number(dateMatch[1]); monthKey = dateMatch[2].padStart(2, '0') }
    }
  }
  if (!isTarget || !officeName) return null

  // 「営業所計」セルの位置を探し、その直下の行を担当者ブロックの「件数」見出し行とみなす。
  // シート右側には「商品分類別売上ランキング」など別表があり、そちらにも「件数」列があるため、
  // 営業所計の列を起点に、件数見出しが5列おきに連続する間だけを担当者ブロックとして数える。
  let officeStartCol = null, nameRowIdx = null
  for (let r = 1; r <= Math.min(sheet.rowCount, 15) && !officeStartCol; r++) {
    const row = sheet.getRow(r)
    for (let c = 1; c <= sheet.columnCount; c++) {
      if (cellText(row, c).replace(/[\s　]+/g, '') === '営業所計') { officeStartCol = c; nameRowIdx = r; break }
    }
  }
  if (!officeStartCol) return null
  const kensuRowIdx = nameRowIdx + 1
  const kensuRow = sheet.getRow(kensuRowIdx)
  const blockCols = []
  for (let c = officeStartCol; c <= sheet.columnCount; c += 5) {
    if (cellText(kensuRow, c) !== '件数') break
    blockCols.push(c)
  }
  if (blockCols.length < 2) return null // 営業所計ブロックのみで担当者ブロックがない

  // 各ブロックの担当者名は、名前行（営業所計と同じ行）の中でそのブロックの列範囲にある、
  // 数字だけ（担当者コード）でも「営業所計」「その他担当者」でもない最初の文字列。
  const nameRow = sheet.getRow(nameRowIdx)
  const blocks = []
  for (let i = 1; i < blockCols.length; i++) { // i=0（営業所計ブロック）は取り込み対象外（担当者ごとの数字だけ反映し、営業所計はアプリ側で自動集計する）
    const col = blockCols[i]
    const nextCol = blockCols[i + 1] || (col + 5)
    let name = null
    for (let c = col; c < nextCol; c++) {
      const t = cellText(nameRow, c).replace(/[\s　]+/g, '')
      if (!t || t === '営業所計' || t === 'その他担当者' || /^\d+$/.test(t)) continue
      name = t
      break
    }
    if (name) blocks.push({ col, name })
  }
  if (!blocks.length) return null

  const reps = {}
  for (let r = kensuRowIdx; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const label = cellText(row, 1) || cellText(row, 2) || cellText(row, 3)
    const matched = HANBAI_ROW_MAP.find(([re]) => re.test(label))
    if (!matched) continue
    const itemName = matched[1]
    for (const block of blocks) {
      if (!reps[block.name]) reps[block.name] = {}
      if (reps[block.name][itemName]) continue // 同名行が下にもう一度現れる別集計（利益額の内訳等）は無視し、最初の合計行だけ採用する
      const kensu = Math.round(cellNumber(row, block.col))
      // シート上の表示単位は千円だが、セルの生の値は円で入っているため、ここで換算する。
      const uriage = Math.round(cellNumber(row, block.col + 1) / 1000)
      reps[block.name][itemName] = { jissekiKensu: kensu, jissekiUriage: uriage }
    }
  }
  if (!Object.keys(reps).length) return null

  return { officeName, fiscalYear, monthKey, reps }
}

export async function parseHanbaiBunruiWorkbook(file) {
  return parseHanbaiBunruiFromWorkbook(await loadWorkbook(file))
}

function hasHanbaiBunruiSheet(workbook) {
  return workbook.worksheets.some((s) => !!parseHanbaiBunruiSheet(s))
}

function parseHanbaiBunruiFromWorkbook(workbook) {
  const offices = {}
  let fiscalYear = null, monthKey = null
  for (const sheet of workbook.worksheets) {
    const parsed = parseHanbaiBunruiSheet(sheet)
    if (!parsed) continue
    offices[parsed.officeName] = { reps: parsed.reps }
    if (fiscalYear == null) { fiscalYear = parsed.fiscalYear; monthKey = parsed.monthKey }
  }
  if (!Object.keys(offices).length) throw new Error('「販売区分・商品分類別 販売売上」の営業所別シートが見つかりませんでした。')
  return { fiscalYear, monthKey, offices }
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
  if (hasHanbaiBunruiSheet(workbook)) {
    const { fiscalYear, monthKey, offices } = parseHanbaiBunruiFromWorkbook(workbook)
    return { type: 'hanbaiBunrui', fiscalYear, monthKey, data: offices }
  }
  throw new Error('対応している売上状況報告書・担当別売上実績・商品分類別販売売上のシートが見つかりませんでした。')
}
