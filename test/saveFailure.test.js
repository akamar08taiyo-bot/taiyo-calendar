// 指示書 CAL-06 / COMMON-06 の受入条件をテスト化したもの。
// 「破損時に自動初期化せず、直前正常版と破損copyを保全する」
// 「成功の誤表示なし。既存データとbackupを保全」
//
// api.js はブラウザの localStorage/sessionStorage に直接依存しているため、
// テスト用の簡易ストレージをグローバルに用意してから import する。

import test from 'node:test'
import assert from 'node:assert/strict'

function makeFakeStorage() {
  const store = new Map()
  let failNextSet = false
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (failNextSet) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e }
      store.set(k, String(v))
    },
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size },
    _store: store,
    _failNextSet(v) { failNextSet = v },
  }
}

globalThis.localStorage = makeFakeStorage()
globalThis.sessionStorage = makeFakeStorage()

const { api, onSaveIssue } = await import('../src/api.js')

function freshStorage() {
  globalThis.localStorage = makeFakeStorage()
  globalThis.sessionStorage = makeFakeStorage()
}

test('publicOfficesの読み込みでは通知されない（正常系）', async () => {
  freshStorage()
  const messages = []
  const off = onSaveIssue((m) => messages.push(m))
  await api.publicOffices()
  off()
  assert.deepEqual(messages, [])
})

test('保存データが破損していても自動初期化せず、破損データを別キーへ保全する', async () => {
  freshStorage()
  globalThis.localStorage.setItem('kyotaku-calendar-offline-v2', '{壊れたJSON')
  const messages = []
  const off = onSaveIssue((m) => messages.push(m))
  const result = await api.publicOffices()
  off()

  assert.ok(Array.isArray(result.offices))
  assert.equal(messages.length, 1)
  assert.match(messages[0], /読み込みに失敗/)

  const keys = [...globalThis.localStorage._store.keys()]
  const backupKey = keys.find((k) => k.startsWith('kyotaku-calendar-offline-v2_corrupted_'))
  assert.ok(backupKey, '破損データの退避キーが見つからない: ' + JSON.stringify(keys))
  assert.equal(globalThis.localStorage.getItem(backupKey), '{壊れたJSON')
})

test('保存に失敗したら通知され、成功したかのような結果を返さない', async () => {
  freshStorage()
  globalThis.localStorage._failNextSet(true)
  const messages = []
  const off = onSaveIssue((m) => messages.push(m))
  // updateSettingsはsave(data)を呼ぶだけの単純な経路。保存失敗時はPromiseが
  // rejectされ、「保存できた」という結果を呼び出し元へ返さないことを確認する。
  await assert.rejects(
    () => api.updateSettings({ retentionYears: 10 }),
    /QuotaExceededError/,
  )
  off()
  assert.equal(messages.length, 1)
  assert.match(messages[0], /保存に失敗/)
})
