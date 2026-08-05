// 訪問ログ（担当者別スケジュール実績のCSV／旧形式Excel）を読み取り、
// 営業月報の訪問実績（VISIT_FIELDS 23項目）へ変換するパーサー。
// 対応形式:
//   ①UTF-8／Shift-JISのテキスト（CSV、またはこの形式で書き出された .xls）
//   ②旧形式バイナリExcel（OLEヘッダを持たないBIFF形式。SheetJS + codepage:932で読む）
// どちらも列見出しは「連番号,部門コード,部門名,...,担当名,...,実施内容,...,開始日,...」で共通。

const HEADER_LABELS = { office: '部門名', rep: '担当名', content: '実施内容', date: '開始日' }

function splitDelimitedLine(line, delimiter) {
  const cells = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1 }
      else quoted = !quoted
    } else if (character === delimiter && !quoted) {
      cells.push(value)
      value = ''
    } else value += character
  }
  cells.push(value)
  return cells
}

function headerIndex(header) {
  const idx = {}
  for (const [key, label] of Object.entries(HEADER_LABELS)) idx[key] = header.findIndex((h) => h.trim() === label)
  if (Object.values(idx).some((i) => i === -1)) return null
  return idx
}

function recordsFromRows(rows) {
  if (!rows.length) return null
  const idx = headerIndex(rows[0].map((v) => String(v || '')))
  if (!idx) return null
  const records = []
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i]
    records.push({ office: String(r[idx.office] || '').trim(), rep: String(r[idx.rep] || '').trim(), content: String(r[idx.content] || '').trim(), date: String(r[idx.date] || '').trim() })
  }
  return records
}

function decodeAsDelimitedText(buffer) {
  for (const encoding of ['utf-8', 'shift_jis']) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(buffer).replace(/^﻿/, '')
      const header = text.slice(0, 4000)
      if (/部門名/.test(header) && /担当名/.test(header) && /実施内容/.test(header)) return text
    } catch { /* 次のエンコーディングを試す */ }
  }
  return null
}

async function readRecords(file) {
  if (!file) throw new Error('ファイルが選択されていません。')
  if (file.size > 80 * 1024 * 1024) throw new Error('ファイルは80MB以下にしてください。')
  const buffer = await file.arrayBuffer()

  const text = decodeAsDelimitedText(buffer)
  if (text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim())
    const rows = lines.map((line) => splitDelimitedLine(line, ','))
    const records = recordsFromRows(rows)
    if (records) return records
  }

  const { default: XLSX } = await import('xlsx')
  let workbook
  try { workbook = XLSX.read(buffer, { type: 'array', codepage: 932 }) }
  catch { throw new Error('ファイルを読み取れませんでした。訪問ログのCSVまたはExcelを選択してください。') }
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
  const records = recordsFromRows(rows)
  if (!records) throw new Error('列の見出し（部門名・担当名・実施内容・開始日）が見つかりませんでした。')
  return records
}

// 実施内容タグ → 訪問実績フィールドの対応表。
const DEST_MAP = { '【訪問】包括': 'houkatsu', '【訪問】居宅': 'kyotaku', '【訪問】施設等': 'shisetsu', '【訪問】個人宅': 'kojin', '【訪問】役所': 'yakusho' }
const CONTENT_MAP = {
  '＜ﾚﾝﾀﾙ＞相談': ['rentalSoudan'],
  '＜ﾚﾝﾀﾙ＞介護保険納品': ['rentalKaigo'],
  '＜ﾚﾝﾀﾙ＞特価・自費納品': ['rentalJihi'],
  '＜ﾚﾝﾀﾙ＞回収': ['rentalKaishu'],
  '＜ﾚﾝﾀﾙ＞交換': ['rentalKoukan'],
  '＜販売＞相談': ['hanbaiSoudan'],
  '＜販売＞納品': ['hanbaiNouhin'],
  '＜住改＞相談・現地調査': ['kaishuSoudan', 'kaishuGenba'],
  '＜住改＞工事立ち合い': ['kaishuKouji'],
  '＜顧客＞契約・ｻｰﾋﾞｽ計画書': ['keikakusho'],
  '＜顧客＞ﾓﾆﾀﾘﾝｸﾞ': ['monitoring'],
  '＜顧客＞担当者会議': ['tantousha'],
  '＜顧客＞クレーム対応': ['claim'],
  '＜顧客＞集金': ['shukin'],
  '＜その他＞同行・応援': ['doukou'],
  '＜その他＞': ['sonota'],
}
const VISIT_KEYS = ['houkatsu', 'kyotaku', 'shisetsu', 'kojin', 'yakusho', 'rentalSoudan', 'rentalKaigo', 'rentalJihi', 'rentalKaishu', 'rentalKoukan', 'hanbaiSoudan', 'hanbaiNouhin', 'kaishuSoudan', 'kaishuGenba', 'kaishuKouji', 'keikakusho', 'monitoring', 'tantousha', 'claim', 'shukin', 'doukou', 'sonota', 'kadou']
function emptyVisit() { const v = {}; for (const k of VISIT_KEYS) v[k] = 0; return v }

function parseDate(s) {
  const m = String(s).match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/) || String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (!m) return null
  if (m[1].length === 4) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(2000 + Number(m[3]), Number(m[1]) - 1, Number(m[2]))
}
function monthKeyOf(dt) { return String(dt.getMonth() + 1).padStart(2, '0') }
function fiscalYearOf(dt) { const m = dt.getMonth() + 1; return m >= 4 ? dt.getFullYear() : dt.getFullYear() - 1 }

// 集計結果: { [officeName]: { [repName]: { [fiscalYear]: { [monthKey]: { visit, matchedRows, unmatchedRows } } } } }
export async function parseVisitLogWorkbook(file) {
  const records = await readRecords(file)
  const result = {}
  let matchedTotal = 0
  let unmatchedTotal = 0

  for (const rec of records) {
    const dt = parseDate(rec.date)
    if (!dt || !rec.office || !rec.rep) continue
    const officeName = /営業所$/.test(rec.office) ? rec.office : `${rec.office}営業所`
    const fiscalYear = fiscalYearOf(dt)
    const monthKey = monthKeyOf(dt)
    const dayKey = dt.toISOString().slice(0, 10)

    if (!result[officeName]) result[officeName] = {}
    if (!result[officeName][rec.rep]) result[officeName][rec.rep] = {}
    if (!result[officeName][rec.rep][fiscalYear]) result[officeName][rec.rep][fiscalYear] = {}
    if (!result[officeName][rec.rep][fiscalYear][monthKey]) {
      result[officeName][rec.rep][fiscalYear][monthKey] = { visit: emptyVisit(), workDays: new Set() }
    }
    const bucket = result[officeName][rec.rep][fiscalYear][monthKey]
    bucket.workDays.add(dayKey)

    const tags = rec.content.split(',').map((t) => t.trim()).filter(Boolean)
    let matchedAny = false
    for (const tag of tags) {
      if (DEST_MAP[tag]) { bucket.visit[DEST_MAP[tag]] += 1; matchedAny = true; continue }
      if (CONTENT_MAP[tag]) { for (const k of CONTENT_MAP[tag]) bucket.visit[k] += 1; matchedAny = true; continue }
    }
    if (matchedAny) matchedTotal += 1; else unmatchedTotal += 1
  }

  // kadou（稼働日数）＝訪問のあった日数、Setをそのまま持ち続けないよう数値に変換して返す。
  for (const rep of Object.values(result)) {
    for (const years of Object.values(rep)) {
      for (const months of Object.values(years)) {
        for (const bucket of Object.values(months)) {
          bucket.visit.kadou = bucket.workDays.size
          delete bucket.workDays
        }
      }
    }
  }

  return { offices: result, matchedRows: matchedTotal, unmatchedRows: unmatchedTotal, totalRows: records.length }
}
