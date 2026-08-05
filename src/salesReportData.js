// 営業月報：所長が使っていたExcel（年間予算進捗と対応策）を再現するデータ層。
// 4月分は実際のExcelの数字をそのまま初期値として入れている。5月以降は空欄から手入力していく想定。
const STORE_KEY = 'taiyo-sales-report-v1'

export const MONTH_KEYS = ['04', '05', '06', '07', '08', '09', '10', '11', '12', '01', '02', '03']
export const MONTH_LABELS = { '04': '4月', '05': '5月', '06': '6月', '07': '7月', '08': '8月', '09': '9月', '10': '10月', '11': '11月', '12': '12月', '01': '1月', '02': '2月', '03': '3月' }
// 会計年度: 4月始まり。'04'〜'12'はfiscalYear、'01'〜'03'はfiscalYear+1のカレンダー年。
export const fiscalCalendarYear = (fiscalYear, monthKey) => (Number(monthKey) >= 4 ? fiscalYear : fiscalYear + 1)

export const VISIT_FIELDS = [
  ['houkatsu', '包括（統括）'], ['kyotaku', '居宅'], ['shisetsu', '施設等'], ['kojin', '個人宅'], ['yakusho', '役所'],
  ['rentalSoudan', 'レンタル相談'], ['rentalKaigo', '介護保険納品'], ['rentalJihi', '自費（特価）納品'], ['rentalKaishu', '回収'], ['rentalKoukan', '交換'],
  ['hanbaiSoudan', '商品販売相談'], ['hanbaiNouhin', '商品販売納品'],
  ['kaishuSoudan', '住宅改修相談'], ['kaishuGenba', '現場調査'], ['kaishuKouji', '工事立ち合い'],
  ['keikakusho', '福祉用具サービス計画書'], ['monitoring', 'モニタリング'], ['tantousha', '担当者会議'], ['claim', 'クレーム対応等'], ['shukin', '集金'],
  ['doukou', '同行・応援'], ['sonota', 'その他'], ['kadou', '稼働日数'],
]

export function emptyVisit() {
  const v = {}
  for (const [key] of VISIT_FIELDS) v[key] = 0
  return v
}

export function visitTotal(v) {
  return (v.houkatsu || 0) + (v.kyotaku || 0) + (v.shisetsu || 0) + (v.kojin || 0) + (v.yakusho || 0)
}

export function sumVisits(list) {
  const out = emptyVisit()
  for (const v of list) for (const [key] of VISIT_FIELDS) out[key] += Number(v?.[key] || 0)
  return out
}

// 月間売上（売上状況報告書）＋累計売上（売上推移）の手入力欄
export function emptySalesFigures() {
  return {
    rentalNouhinKeikei: 0,       // レンタル納品合計
    zenGetsuKaishu: 0,           // 前月回収
    mokuhyou: 0,                 // 目標値
    touGetsuKaishu: 0,           // 当月回収
    hanbaiYosan: 0,              // 商品販売予算
    hanbaiUriage: 0,             // 商品販売売上
    kaishuuYosan: 0,             // 住宅改修予算
    kaishuuUriage: 0,            // 住宅改修売上
    // 累計側（レンタル）
    rentalYosanAtsumu: 0,        // レンタル予算（累計）
    rentalJissekiAtsumu: 0,      // レンタル実績（累計）
  }
}

export function sumSalesFigures(list) {
  const keys = Object.keys(emptySalesFigures())
  const out = emptySalesFigures()
  for (const s of list) for (const k of keys) out[k] += Number(s?.[k] || 0)
  return out
}

// 販売内訳（手入力）: 予算/実績 の 件数・売上
export const HANBAI_ITEMS = ['①住宅改修', '②特定福祉用具', '③一般福祉用具', '④紙おむつ販売', '⑤消耗品販売']
export function emptyHanbaiUchiwake() {
  const o = {}
  for (const name of HANBAI_ITEMS) o[name] = { yosanKensu: 0, yosanUriage: 0, jissekiKensu: 0, jissekiUriage: 0 }
  return o
}
export function sumHanbaiUchiwake(list) {
  const out = emptyHanbaiUchiwake()
  for (const h of list) for (const name of HANBAI_ITEMS) {
    if (!h?.[name]) continue
    out[name].yosanKensu += Number(h[name].yosanKensu || 0)
    out[name].yosanUriage += Number(h[name].yosanUriage || 0)
    out[name].jissekiKensu += Number(h[name].jissekiKensu || 0)
    out[name].jissekiUriage += Number(h[name].jissekiUriage || 0)
  }
  return out
}

// ターゲット包括・居宅（手入力の顧客数・売上一覧）
export function emptyTarget() { return { lastMar: { count: 0, sales: 0 }, thisMonth: { count: 0, sales: 0 } } }

// 介護保険レンタル／特価ベッドレンタル／包括・居宅訪問 の目標（設定から変更可、デフォルトはExcelの値）
export const DEFAULT_GOALS = {
  kaigoRental: { mokuhyou: 6 },        // 新規介護保険ご利用者獲得件数（月）
  tokkaBed: { mokuhyou: 2 },           // 新規特価ベッドご利用者獲得件数（月）
  houmon: { houkatsu: 22, kyotaku: 11 }, // 目標訪問件数（月・包括／居宅）
}

function defaultRepEntry(overrides = {}) {
  return {
    visit: overrides.visit || emptyVisit(),
    sales: overrides.sales || emptySalesFigures(),
    hanbai: overrides.hanbai || emptyHanbaiUchiwake(),
    targets: overrides.targets || {},   // { [targetName]: emptyTarget() }
    kaigoRentalJisseki: overrides.kaigoRentalJisseki ?? { houkatsu: 0, kyotaku: 0 },
    tokkaBedJisseki: overrides.tokkaBedJisseki ?? { houkatsu: 0, kyotaku: 0 },
    houmonJisseki: overrides.houmonJisseki ?? { houkatsu: 0, kyotaku: 0 },
    soukatsu: overrides.soukatsu || '',     // 総括（自由記述）
    jigetsuTaisaku: overrides.jigetsuTaisaku || '', // 次月対策（自由記述）
  }
}

// ============ 4月の実データ（行橋営業所・4名）をそのまま初期値に ============
const APR_SEED_REPS = {
  '久保匠史': defaultRepEntry({
    visit: { houkatsu: 22, kyotaku: 16, shisetsu: 13, kojin: 64, yakusho: 1, rentalSoudan: 12, rentalKaigo: 9, rentalJihi: 1, rentalKaishu: 6, rentalKoukan: 2, hanbaiSoudan: 12, hanbaiNouhin: 8, kaishuSoudan: 16, kaishuGenba: 5, kaishuKouji: 18, keikakusho: 10, monitoring: 20, tantousha: 6, claim: 0, shukin: 2, doukou: 0, sonota: 66, kadou: 20 },
    sales: { rentalNouhinKeikei: 187, zenGetsuKaishu: 177, mokuhyou: 185, touGetsuKaishu: 217, hanbaiYosan: 1050, hanbaiUriage: 1604, kaishuuYosan: 400, kaishuuUriage: 591, rentalYosanAtsumu: 2410, rentalJissekiAtsumu: 2499 },
    hanbai: {
      '①住宅改修': { yosanKensu: 4, yosanUriage: 400, jissekiKensu: 6, jissekiUriage: 591 },
      '②特定福祉用具': { yosanKensu: 3, yosanUriage: 100, jissekiKensu: 3, jissekiUriage: 112 },
      '③一般福祉用具': { yosanKensu: 0, yosanUriage: 300, jissekiKensu: 0, jissekiUriage: 442 },
      '④紙おむつ販売': { yosanKensu: 0, yosanUriage: 300, jissekiKensu: 0, jissekiUriage: 323 },
      '⑤消耗品販売': { yosanKensu: 0, yosanUriage: 350, jissekiKensu: 0, jissekiUriage: 727 },
    },
    targets: {
      '行橋高齢者': { lastMar: { count: 18, sales: 150 }, thisMonth: { count: 18, sales: 150 } },
      '長狭高齢者': { lastMar: { count: 22, sales: 184 }, thisMonth: { count: 22, sales: 184 } },
      '包括かんだ': { lastMar: { count: 22, sales: 173 }, thisMonth: { count: 22, sales: 173 } },
      '包括おばせ': { lastMar: { count: 33, sales: 304 }, thisMonth: { count: 33, sales: 304 } },
      '苅田社協': { lastMar: { count: 25, sales: 358 }, thisMonth: { count: 25, sales: 358 } },
    },
    kaigoRentalJisseki: { houkatsu: 6, kyotaku: 1 },
    tokkaBedJisseki: { houkatsu: 3, kyotaku: 0 },
    houmonJisseki: { houkatsu: 22, kyotaku: 11 },
    soukatsu: '年度始めとしては良いスタートをきることができました。特に包括については、依頼が重なり上手くベースアップに繋がることが出来ています。\nまた、消耗品販売については昨年度末に獲得した商材の売上やGW前の駆け込み、花王値上げ前の注文集中により、大きく予算を超過出来ました。',
    jigetsuTaisaku: '中東情勢の影響により、消耗品販売の売上に大きく影響が出てくる可能性があります。物価高騰助成金などを利用し、それ以外の売上を伸ばせるように、視点を変えた営業を行っていきたいと思います。',
  }),
  '土居翔太': defaultRepEntry({
    visit: { houkatsu: 40, kyotaku: 57, shisetsu: 43, kojin: 69, yakusho: 10, rentalSoudan: 11, rentalKaigo: 14, rentalJihi: 2, rentalKaishu: 9, rentalKoukan: 4, hanbaiSoudan: 4, hanbaiNouhin: 30, kaishuSoudan: 2, kaishuGenba: 2, kaishuKouji: 3, keikakusho: 29, monitoring: 12, tantousha: 22, claim: 0, shukin: 8, doukou: 0, sonota: 128, kadou: 21 },
    sales: { rentalNouhinKeikei: 0, zenGetsuKaishu: 0, mokuhyou: 0, touGetsuKaishu: 0, hanbaiYosan: 1150, hanbaiUriage: 1437, kaishuuYosan: 250, kaishuuUriage: 173, rentalYosanAtsumu: 1570, rentalJissekiAtsumu: 1609 },
  }),
  '宮村茉梨香': defaultRepEntry({
    visit: { houkatsu: 50, kyotaku: 111, shisetsu: 25, kojin: 54, yakusho: 10, rentalSoudan: 5, rentalKaigo: 16, rentalJihi: 3, rentalKaishu: 7, rentalKoukan: 6, hanbaiSoudan: 4, hanbaiNouhin: 12, kaishuSoudan: 0, kaishuGenba: 5, kaishuKouji: 1, keikakusho: 27, monitoring: 12, tantousha: 15, claim: 0, shukin: 7, doukou: 7, sonota: 180, kadou: 20 },
    sales: { rentalNouhinKeikei: 0, zenGetsuKaishu: 0, mokuhyou: 0, touGetsuKaishu: 0, hanbaiYosan: 800, hanbaiUriage: 1061, kaishuuYosan: 150, kaishuuUriage: 425, rentalYosanAtsumu: 1570, rentalJissekiAtsumu: 1616 },
  }),
  '信田裕太': defaultRepEntry({
    visit: { houkatsu: 0, kyotaku: 0, shisetsu: 60, kojin: 45, yakusho: 20, rentalSoudan: 0, rentalKaigo: 6, rentalJihi: 1, rentalKaishu: 12, rentalKoukan: 8, hanbaiSoudan: 0, hanbaiNouhin: 43, kaishuSoudan: 0, kaishuGenba: 0, kaishuKouji: 0, keikakusho: 15, monitoring: 4, tantousha: 6, claim: 0, shukin: 12, doukou: 8, sonota: 31, kadou: 21 },
    sales: { rentalNouhinKeikei: 0, zenGetsuKaishu: 0, mokuhyou: 0, touGetsuKaishu: 0, hanbaiYosan: 0, hanbaiUriage: 0, kaishuuYosan: 0, kaishuuUriage: 0, rentalYosanAtsumu: 0, rentalJissekiAtsumu: 0 },
  }),
}

// 売上予算表：営業所計＋担当者ごとの月別予算（レンタル/住宅改修/商品販売、特価ベッド目標台数）
// 4月の値は実データ、5月以降はExcelの「増加額」方式（前月＋増加額）をそのまま数値化。
const BUDGET_SEED = {
  office: {
    rentalMonthly: [5550, 5575, 5600, 5625, 5625, 5625, 5650, 5675, 5700, 5700, 5700, 5725],
    kaishuuMonthly: Array(12).fill(800),
    hanbaiMonthly: Array(12).fill(3000),
    tokkaBedMonthly: Array(12).fill(4),
    shouhinhinLastYearAvg: 2430,
    shouhinhinTargetAvg: 2600,
    ninzu: 4,
  },
  reps: {
    '久保匠史': { rentalMonthly: [2410, 2415, 2420, 2425, 2425, 2425, 2430, 2435, 2440, 2440, 2440, 2445], kaishuuMonthly: Array(12).fill(400), hanbaiMonthly: Array(12).fill(1050), tokkaBedMonthly: Array(12).fill(1), shouhinhinLastYearAvg: 778, shouhinhinTargetAvg: 828 },
    '土居翔太': { rentalMonthly: [1570, 1580, 1590, 1600, 1600, 1600, 1610, 1620, 1630, 1630, 1630, 1640], kaishuuMonthly: Array(12).fill(250), hanbaiMonthly: Array(12).fill(1150), tokkaBedMonthly: Array(12).fill(2), shouhinhinLastYearAvg: 1052, shouhinhinTargetAvg: 1102 },
    '宮村茉梨香': { rentalMonthly: [1570, 1580, 1590, 1600, 1600, 1600, 1610, 1620, 1630, 1630, 1630, 1640], kaishuuMonthly: Array(12).fill(150), hanbaiMonthly: Array(12).fill(800), tokkaBedMonthly: Array(12).fill(2), shouhinhinLastYearAvg: 0, shouhinhinTargetAvg: 0 },
    '信田裕太': { rentalMonthly: Array(12).fill(0), kaishuuMonthly: Array(12).fill(0), hanbaiMonthly: Array(12).fill(0), tokkaBedMonthly: Array(12).fill(0), shouhinhinLastYearAvg: 0, shouhinhinTargetAvg: 0 },
  },
}

function defaultOfficeSeed() {
  const months = {}
  for (const key of MONTH_KEYS) {
    const reps = {}
    for (const name of Object.keys(APR_SEED_REPS)) reps[name] = key === '04' ? APR_SEED_REPS[name] : defaultRepEntry()
    months[key] = { reps }
  }
  return {
    repNames: Object.keys(APR_SEED_REPS),
    months,
    budget: BUDGET_SEED,
    goals: DEFAULT_GOALS,
    kamiTermGoals: { officeName: '東九州営業部・行橋営業所', personName: '久保　匠史', items: [
      { weight: 1, title: 'レンタル・販売棚卸を2026年9月末に行い、2項目とも誤差を0にすることができる。', s: '', a: 'レンタル・販売棚卸を9月末に行い、2項目とも誤差を0にすることができた。', b: 'レンタル・販売棚卸を9月末に行い、1項目のみ誤差が0だった。', c: '両項目とも誤差があった。', d: '' },
      { weight: 1, title: '請求停止の福祉用具で毎月120日以上を0件にすることができる。（5月～10月までの所長会議資料で確認。回収遅延報告書を提出し承認されているご利用者は除外）', s: '', a: '90日以上が毎月0件だった。', b: '120日以上が毎月0件だった。', c: '120日以上が1件あった。', d: '120日以上が2件以上あった。' },
    ], kadaiItems: [
      { weight: 1, title: '福祉用具サービス計画書（レンタル、レンタル＋販売、販売のみ）を作成し、ご利用者宅へ訪問し署名をもらい、且つケアマネに報告することができる。（営業所全体の評価）', s: '', a: '100%', b: '90%以上', c: 'それ以下の場合', d: '' },
      { weight: 1, title: '人身・物損事故', s: '', a: '事故ゼロ', b: '物損事故　過失50%超　1件', c: '物損事故　過失50%超　2件以上／物損事故50%超1件かつ人身事故1件以上', d: '人身事故発生　1件／人身事故発生　2件以上' },
    ] },
    interviews: { shimoki: '', kamiki: '' },
    honnendoTaisaku: { honnendo: '　昨年度と同様に特価ベッド、消耗品を中心に営業をおこないます。行橋の６包括、苅田町３包括、みやこ町包括、築上町包括を中心に営業をおこなうことで、販売面の安定に繋げます。\n　消耗品については、ターゲット先を改めて絞り込み事、既存施設に対して定期的に追加商材の案内をおこなうことで、消耗品の上積みをおこないます。', kamiki: '', shimoki: '', honnendoSoukatsu: '', jinendo: '' },
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const data = raw ? JSON.parse(raw) : {}
    data.offices = data.offices || {}
    return data
  } catch { return { offices: {} } }
}

function save(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)) }

export function getOfficeReport(officeName) {
  const data = load()
  if (!data.offices[officeName]) {
    // 実データがあるのは行橋営業所のみ。他営業所は空の状態から開始する。
    data.offices[officeName] = officeName === '行橋営業所' ? defaultOfficeSeed() : emptyOfficeSeed()
    save(data)
  }
  return data.offices[officeName]
}

function emptyOfficeSeed() {
  return {
    repNames: [],
    months: Object.fromEntries(MONTH_KEYS.map((k) => [k, { reps: {} }])),
    budget: { office: { rentalMonthly: Array(12).fill(0), kaishuuMonthly: Array(12).fill(0), hanbaiMonthly: Array(12).fill(0), tokkaBedMonthly: Array(12).fill(0), shouhinhinLastYearAvg: 0, shouhinhinTargetAvg: 0, ninzu: 0 }, reps: {} },
    goals: DEFAULT_GOALS,
    kamiTermGoals: { officeName: '', personName: '', items: [], kadaiItems: [] },
    interviews: { shimoki: '', kamiki: '' },
    honnendoTaisaku: { honnendo: '', kamiki: '', shimoki: '', honnendoSoukatsu: '', jinendo: '' },
  }
}

export function updateOfficeReport(officeName, updater) {
  const data = load()
  const current = data.offices[officeName] || (officeName === '行橋営業所' ? defaultOfficeSeed() : emptyOfficeSeed())
  data.offices[officeName] = updater(current)
  save(data)
  return data.offices[officeName]
}

export function addRep(officeName, name) {
  return updateOfficeReport(officeName, (report) => {
    if (report.repNames.includes(name)) return report
    const repNames = [...report.repNames, name]
    const months = { ...report.months }
    for (const key of MONTH_KEYS) months[key] = { reps: { ...months[key].reps, [name]: defaultRepEntry() } }
    return { ...report, repNames, months }
  })
}

export function removeRep(officeName, name) {
  return updateOfficeReport(officeName, (report) => {
    const repNames = report.repNames.filter((n) => n !== name)
    const months = { ...report.months }
    for (const key of MONTH_KEYS) {
      const reps = { ...months[key].reps }
      delete reps[name]
      months[key] = { reps }
    }
    return { ...report, repNames, months }
  })
}

export function updateRepEntry(officeName, monthKey, repName, patch) {
  return updateOfficeReport(officeName, (report) => {
    const months = { ...report.months }
    const monthData = months[monthKey] || { reps: {} }
    const current = monthData.reps[repName] || defaultRepEntry()
    months[monthKey] = { reps: { ...monthData.reps, [repName]: { ...current, ...patch } } }
    return { ...report, months }
  })
}

// Excel取込結果（{ [officeName]: { reps: { [repName]: 部分的なsalesFigures } } }）を
// 選択中の月に反映する。担当者名はまず完全一致、なければ前方一致（姓のみのデータに対応）で照合し、
// どちらも該当しなければ新しい担当者として追加する。
export function applyImportedSalesFigures(monthKey, officeDataMap) {
  const summary = { updated: [], created: [] }
  for (const [officeName, entry] of Object.entries(officeDataMap)) {
    const reps = entry.reps || {}
    for (const [parsedName, patch] of Object.entries(reps)) {
      let report = getOfficeReport(officeName)
      let matched = report.repNames.find((n) => n === parsedName)
        || report.repNames.find((n) => n.startsWith(parsedName) || parsedName.startsWith(n))
      let created = false
      if (!matched) {
        addRep(officeName, parsedName)
        matched = parsedName
        created = true
      }
      report = getOfficeReport(officeName)
      const current = report.months[monthKey]?.reps?.[matched]?.sales || emptySalesFigures()
      updateRepEntry(officeName, monthKey, matched, { sales: { ...current, ...patch } })
      summary[created ? 'created' : 'updated'].push(`${officeName} / ${matched}`)
    }
  }
  return summary
}

// その月までの累計（4月からmonthKeyまでの各reps合算値）を計算する。
export function cumulativeSalesThrough(report, monthKey) {
  const idx = MONTH_KEYS.indexOf(monthKey)
  const upTo = MONTH_KEYS.slice(0, idx + 1)
  const totals = {}
  for (const repName of report.repNames) {
    const list = upTo.map((k) => report.months[k]?.reps?.[repName]?.sales).filter(Boolean)
    totals[repName] = sumSalesFigures(list)
  }
  return totals
}

export { defaultOfficeSeed, defaultRepEntry }
