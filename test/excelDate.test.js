// 指示書 CAL-05 の受入条件をテスト化したもの。
// 「存在しない日付は確定不可。うるう年の2月29日は受理し、非うるう年では拒否」
//
// 取込で実際に使う src/lib/excelDate.js をそのまま検証する。

import test from 'node:test'
import assert from 'node:assert/strict'
import { excelDate } from '../src/lib/excelDate.js'

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

test('ExcelJS（.xlsx）の日時は、時刻に関係なくExcel上の日付で取り込む', () => {
  const utc = { utcDates: true }
  // ExcelJS は「2026/8/14 16:30」を 2026-08-14T16:30:00Z の Date で返す。日本時間に換算すると翌日になってしまう
  assert.equal(excelDate(new Date('2026-08-14T00:00:00Z'), utc), '2026-08-14')
  assert.equal(excelDate(new Date('2026-08-14T09:00:00Z'), utc), '2026-08-14')
  assert.equal(excelDate(new Date('2026-08-14T16:30:00Z'), utc), '2026-08-14')
  // 月末の夜の訪問が翌月に計上されない
  assert.equal(excelDate(new Date('2026-08-31T23:00:00Z'), utc), '2026-08-31')
})

test('シリアル値に時刻（小数部）があっても日付は変わらない', () => {
  assert.equal(excelDate(46248.6875), '2026-08-14') // 2026/8/14 16:30
  assert.equal(excelDate(46265.9583), '2026-08-31') // 2026/8/31 23:00
})
