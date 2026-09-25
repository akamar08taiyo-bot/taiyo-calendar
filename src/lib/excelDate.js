import { formatDateInTokyo, formatDateString, isValidDateString } from './businessDate.js'

// Excelのセル値を業務日 'YYYY-MM-DD' に変換する。
// 実在しない日付（2026-02-31、非うるう年の2月29日など）は null を返して取り込まない。
//
// Excelの日付・日時はタイムゾーンを持たない（画面に見えている年月日・時刻そのもの）。
// - ExcelJS（.xlsx）はその年月日・時刻を「UTCの同じ時刻」の Date で返す。日本時間に換算すると
//   15:00以降の日時が翌日（月末なら翌月）になってしまうため、utcDates: true のときはUTCの年月日で読む。
// - SheetJS（旧形式の .xls）は実行環境の現地時刻で Date を作るため、従来どおり日本時間で読む。
// - シリアル値の小数部は時刻なので切り捨て、日付の部分だけを使う。
export function excelDate(value, { utcDates = false } = {}) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (utcDates) return formatDateString(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
    return formatDateInTokyo(value)
  }
  if (typeof value === 'number' && value > 30000 && value < 80000) {
    return formatDateInTokyo(new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000))
  }
  const match = String(value || '').match(/(20\d{2})[年/-](\d{1,2})[月/-](\d{1,2})/)
  if (!match) return null
  const candidate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  return isValidDateString(candidate) ? candidate : null
}
