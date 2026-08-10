// 居宅（ケアマネ事業所）ごとの月次売上を保存するデータ層。
// 「居宅別売上推移表」Excelを取り込むと、事業所名で名寄せしてここに保存する。
// 居宅カレンダーの実訪問データ（api.js の providerPerformance/monthlyVisits）と組み合わせて、
// 訪問件数の増減と売上の増減を1つの居宅ごとに突き合わせて見える化するために使う（実績分析タブ）。
import { normalizeProviderName } from './api'

const STORE_KEY = 'taiyo-provider-sales-v1'

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const data = raw ? JSON.parse(raw) : {}
    data.offices = data.offices || {}
    return data
  } catch { return { offices: {} } }
}
function save(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)) }

// 取込結果（{ [officeName]: { providers: { [providerName]: { repName, lastMarSales, monthlySales: { 'YYYY-MM': 円 } } } } }）を、
// 営業所ごとに1回のload/saveでまとめて反映する。同じ事業所・同じ月を再取込すると上書きされる。
export function applyImportedProviderSales(officeName, entry) {
  const data = load()
  const current = data.offices[officeName] || { providers: {} }
  const nextProviders = { ...current.providers }
  for (const [name, patch] of Object.entries(entry.providers || {})) {
    const existing = nextProviders[name] || { repName: '', lastMarSales: 0, monthlySales: {} }
    nextProviders[name] = {
      repName: patch.repName || existing.repName,
      lastMarSales: patch.lastMarSales ?? existing.lastMarSales,
      monthlySales: { ...existing.monthlySales, ...(patch.monthlySales || {}) },
    }
  }
  data.offices[officeName] = { providers: nextProviders, importedAt: new Date().toISOString() }
  save(data)
  return { providerCount: Object.keys(entry.providers || {}).length }
}

export function getOfficeProviderSales(officeName) {
  return load().offices[officeName] || { providers: {} }
}

// 居宅カレンダー側の事業所名（表記ゆれあり）と、取り込んだ売上データの事業所名を正規化して突き合わせる。
export function findProviderSales(officeSales, providerName) {
  const providers = officeSales.providers || {}
  if (providers[providerName]) return providers[providerName]
  const target = normalizeProviderName(providerName)
  if (!target) return null
  for (const [name, entry] of Object.entries(providers)) {
    if (normalizeProviderName(name) === target) return entry
  }
  return null
}
