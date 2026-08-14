// 指示書 CAL-05 の受入条件をテスト化したもの。
// 「存在しない日付は確定不可。うるう年の2月29日は受理し、非うるう年では拒否」
//
// api.js は localStorage 等のブラウザAPIに依存するため、excelDate と同じ実装を
// ここに写して検証するのではなく、判定の中核である isValidDateString と
// formatDateInTokyo の組み合わせを、excelDate と同じ手順で確認する。

import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDateInTokyo, isValidDateString } from '../src/lib/businessDate.js'

// src/api.js の excelDate と同じ判定手順
function excelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateInTokyo(value)
  }
  if (typeof value === 'number' && value > 30000 && value < 80000) {
    return formatDateInTokyo(new Date(Date.UTC(1899, 11, 30) + value * 86400000))
  }
  const match = String(value || '').match(/(20\d{2})[年/-](\d{1,2})[月/-](\d{1,2})/)
  if (!match) return null
  const candidate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  return isValidDateString(candidate) ? candidate : null
}

test('存在しない日付を取り込まない', () => {
  assert.equal(excelDate('2026年2月31日'), null)
  assert.equal(excelDate('2026/2/30'), null)
  assert.equal(excelDate('2026-02-29'), null) // 2026年はうるう年ではない
  assert.equal(excelDate('2026/4/31'), null)
  assert.equal(excelDate('2026/13/1'), null)
})

test('実在する日付を取り込む', () => {
  assert.equal(excelDate('2028年2月29日'), '2028-02-29') // うるう年
  assert.equal(excelDate('2026/8/14'), '2026-08-14')
  assert.equal(excelDate('2026-8-1'), '2026-08-01')
  assert.equal(excelDate('2026年12月31日'), '2026-12-31')
})

test('Date型のセルを日本時間で解釈する', () => {
  // ExcelJS は UTC 深夜0時の Date を返すことが多い → 日本時間では同日9時
  assert.equal(excelDate(new Date('2026-08-14T00:00:00Z')), '2026-08-14')
  // ロケール依存で JST 深夜0時になっている場合も同じ日付になる
  assert.equal(excelDate(new Date('2026-08-13T15:00:00Z')), '2026-08-14')
})

test('Excelシリアル値を日付に変換する', () => {
  // Excelのシリアル値は 1899-12-30 を 0 とする通日
  assert.equal(excelDate(46248), '2026-08-14')
  assert.equal(excelDate(46249), '2026-08-15')
  // 範囲外（30000未満・80000以上）はシリアル値として扱わない
  assert.equal(excelDate(1), null)
  assert.equal(excelDate(90000), null)
})

test('日付として読めないものは null', () => {
  assert.equal(excelDate(''), null)
  assert.equal(excelDate(null), null)
  assert.equal(excelDate('未定'), null)
  assert.equal(excelDate('1999/1/1'), null) // 正規表現が 20xx 年のみ対象
})
