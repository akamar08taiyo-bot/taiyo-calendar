import React, { useMemo, useState } from 'react'
import { Icon } from './Icon'
import {
  MONTH_KEYS, MONTH_LABELS, fiscalCalendarYear,
  VISIT_FIELDS, emptyVisit, sumVisits, visitTotal,
  emptySalesFigures, sumSalesFigures,
  HANBAI_ITEMS, emptyHanbaiUchiwake, sumHanbaiUchiwake,
  emptyTarget,
  getOfficeReport, updateOfficeReport, updateRepEntry, addRep, removeRep,
  applyImportedSalesFigures, applyImportedSalesFiguresMultiMonth, applyImportedHanbaiFigures, applyImportedVisitFigures, pickOfficeData, getYearMonths, listFiscalYears, DEFAULT_FISCAL_YEAR,
} from '../salesReportData'
import { parseSalesWorkbookAuto } from '../salesReportExcelImport'
import { parseVisitLogWorkbook } from '../visitLogImport'
import { parseProviderSalesWorkbook } from '../providerSalesExcelImport'
import { applyImportedProviderSales } from '../providerSalesData'
import { downloadElementPdf } from '../pdf-export'

const yen = (n) => `${Math.round(Number(n) || 0).toLocaleString('ja-JP')}`
const num = (n) => `${Math.round(Number(n) || 0).toLocaleString('ja-JP')}`
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')

function NumberCell({ value, onChange, width = 64 }) {
  return (
    <input
      type="number"
      value={value === 0 ? 0 : value || ''}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="srv-num-input"
      style={{ width }}
    />
  )
}

/* ============================== 月報タブ ============================== */
// 入力欄をグループ分けして、1画面あたりの情報量を抑えつつ大きく表示する。
const VISIT_GROUPS = [
  ['訪問先', [['houkatsu', '包括（統括）'], ['kyotaku', '居宅'], ['shisetsu', '施設等'], ['kojin', '個人宅'], ['yakusho', '役所']]],
  ['レンタル', [['rentalSoudan', '相談'], ['rentalKaigo', '介護保険納品'], ['rentalJihi', '自費（特価）納品'], ['rentalKaishu', '回収'], ['rentalKoukan', '交換']]],
  ['商品販売', [['hanbaiSoudan', '相談'], ['hanbaiNouhin', '納品']]],
  ['住宅改修', [['kaishuSoudan', '相談'], ['kaishuGenba', '現場調査'], ['kaishuKouji', '工事立ち合い']]],
  ['顧客対応', [['keikakusho', '福祉用具サービス計画書'], ['monitoring', 'モニタリング'], ['tantousha', '担当者会議'], ['claim', 'クレーム対応等'], ['shukin', '集金']]],
  ['その他', [['doukou', '同行・応援'], ['sonota', 'その他'], ['kadou', '稼働日数']]],
]

function BigField({ label, value, onChange, suffix }) {
  return (
    <label className="srv-big-field">
      <span className="srv-big-label">{label}</span>
      <span className="srv-big-input-wrap">
        <input
          type="number"
          value={value === 0 ? 0 : value || ''}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="srv-big-input"
        />
        {suffix && <em className="srv-big-suffix">{suffix}</em>}
      </span>
    </label>
  )
}

// 実績／予算／予算差を縦に3段並べた列。列見出し（実績値）と予算差だけ色付けする。
function BudgetCell({ label, jisseki, yosan }) {
  const diff = (jisseki || 0) - (yosan || 0)
  return (
    <div className="srv-budget-cell">
      <div className="srv-budget-line srv-budget-actual"><span>{label}</span><b>{yen(jisseki)}<em>千円</em></b></div>
      <div className="srv-budget-line"><span>予算</span><b>{yen(yosan)}<em>千円</em></b></div>
      <div className={`srv-budget-line srv-budget-diff ${diff >= 0 ? 'srv-plus' : 'srv-minus'}`}><span>予算差</span><b>{yen(diff)}<em>千円</em></b></div>
    </div>
  )
}

// 単月の金額を表示する1マス。editableならその場で修正できる数値入力、そうでなければ読み取り専用表示。
function ThreerowCell({ label, value, onChange, editable }) {
  return (
    <div className="srv-threerow-cell">
      <span>{label}</span>
      {editable ? (
        <span className="srv-threerow-input-wrap">
          <input type="number" className="srv-threerow-input" value={value === 0 ? 0 : value || ''} onChange={(e) => onChange(Number(e.target.value) || 0)} />
          <em>千円</em>
        </span>
      ) : (
        <strong>{yen(value)}<em>千円</em></strong>
      )}
    </div>
  )
}

// 月報タブの数字ブロック：レンタル（実績値・累計・新規納品/前月回収/当月回収/目標/目標差）と、
// 住宅改修／商品販売／物販合計（単月・年度累計）を色分けして表示する。営業所合計・個人ページ共通。
// 個人ページ（editable=true）では新規納品・前月回収・当月回収・目標値をここで直接修正できる
// （担当者タブ下部の「月間売上・年度累計」欄との重複表示を避けるため、入力箇所はここに一本化している）。
function SalesSummaryBlock({ sales, monthLabel, fiscalYear, editable, onChangeSales }) {
  const hanbaiYosanKei = (sales.hanbaiYosan || 0) + (sales.kaishuuYosan || 0)
  const hanbaiUriageKei = (sales.hanbaiUriage || 0) + (sales.kaishuuUriage || 0)
  const hanbaiYosanKeiAtsumu = (sales.hanbaiYosanAtsumu || 0) + (sales.kaishuuYosanAtsumu || 0)
  const hanbaiUriageKeiAtsumu = (sales.hanbaiUriageAtsumu || 0) + (sales.kaishuuUriageAtsumu || 0)
  const mokuhyouZa = (sales.rentalNouhinKeikei || 0) - (sales.mokuhyou || 0)

  return (
    <div className="srv-sales-summary">
      <div className="srv-sales-group srv-sales-group-rental">
        <div className="srv-budget-row-3">
          <BudgetCell label={`${monthLabel}レンタル実績値`} jisseki={sales.rentalJissekiTanki} yosan={sales.rentalYosanTanki} />
          <BudgetCell label={`${fiscalYear}年度累計レンタル実績値`} jisseki={sales.rentalJissekiAtsumu} yosan={sales.rentalYosanAtsumu} />
        </div>
        <div className="srv-threerow srv-threerow-5">
          <ThreerowCell label={`${monthLabel}新規納品金額`} value={sales.rentalNouhinKeikei} editable={editable} onChange={(v) => onChangeSales?.('rentalNouhinKeikei', v)} />
          <ThreerowCell label="前月回収金額" value={sales.zenGetsuKaishu} editable={editable} onChange={(v) => onChangeSales?.('zenGetsuKaishu', v)} />
          <ThreerowCell label="当月回収金額" value={sales.touGetsuKaishu} editable={editable} onChange={(v) => onChangeSales?.('touGetsuKaishu', v)} />
          <ThreerowCell label="新規レンタル納品目標額" value={sales.mokuhyou} editable={editable} onChange={(v) => onChangeSales?.('mokuhyou', v)} />
          <div className="srv-threerow-cell"><span>売上目標差</span><strong className={mokuhyouZa >= 0 ? 'srv-plus' : 'srv-minus'}>{yen(mokuhyouZa)}<em>千円</em></strong></div>
        </div>
      </div>
      <div className="srv-sales-group srv-sales-group-other">
        <div className="srv-budget-row-3">
          <BudgetCell label={`${monthLabel}住宅改修実績`} jisseki={sales.kaishuuUriage} yosan={sales.kaishuuYosan} />
          <BudgetCell label={`${monthLabel}商品販売実績`} jisseki={sales.hanbaiUriage} yosan={sales.hanbaiYosan} />
          <BudgetCell label={`${monthLabel}物販合計`} jisseki={hanbaiUriageKei} yosan={hanbaiYosanKei} />
        </div>
        <div className="srv-budget-row-3">
          <BudgetCell label={`住宅改修${fiscalYear}年度累計金額`} jisseki={sales.kaishuuUriageAtsumu} yosan={sales.kaishuuYosanAtsumu} />
          <BudgetCell label={`商品販売${fiscalYear}年度累計金額`} jisseki={sales.hanbaiUriageAtsumu} yosan={sales.hanbaiYosanAtsumu} />
          <BudgetCell label={`物販${fiscalYear}年度累計金額`} jisseki={hanbaiUriageKeiAtsumu} yosan={hanbaiYosanKeiAtsumu} />
        </div>
      </div>
    </div>
  )
}

// 訪問実績：元のExcel（項目を横に並べた一覧表）に似せた、横長・大きな文字の1行入力表。
function VisitTable({ visit, onChange }) {
  return (
    <div className="srv-table-scroll">
      <table className="srv-visit-table">
        <thead>
          <tr>
            {VISIT_GROUPS.map(([groupName, fields]) => (
              <th key={groupName} colSpan={fields.length} className="srv-visit-group-th">{groupName}</th>
            ))}
          </tr>
          <tr>
            {VISIT_GROUPS.flatMap(([, fields]) => fields.map(([k, label]) => <th key={k}>{label}</th>))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {VISIT_GROUPS.flatMap(([, fields]) => fields.map(([k]) => (
              <td key={k}>
                <input
                  type="number"
                  className="srv-visit-input"
                  value={visit[k] === 0 ? 0 : visit[k] || ''}
                  onChange={(e) => onChange(k, Number(e.target.value) || 0)}
                />
              </td>
            )))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function StatCard({ label, value, unit, tone }) {
  return (
    <div className={`srv-stat ${tone || ''}`}>
      <span>{label}</span>
      <strong>{value}<em>{unit}</em></strong>
    </div>
  )
}

/* ---------- 営業所合計ビュー（読み取り専用・自動集計） ---------- */
function OfficeSummaryView({ report, fiscalYear, monthKey }) {
  const monthData = getYearMonths(report, fiscalYear)[monthKey] || { reps: {} }
  const reps = report.repNames

  const officeVisit = useMemo(() => sumVisits(reps.map((n) => monthData.reps[n]?.visit || emptyVisit())), [reps, monthData])
  const officeSales = useMemo(() => sumSalesFigures(reps.map((n) => monthData.reps[n]?.sales || emptySalesFigures())), [reps, monthData])
  const officeHanbai = useMemo(() => sumHanbaiUchiwake(reps.map((n) => monthData.reps[n]?.hanbai || emptyHanbaiUchiwake())), [reps, monthData])

  const kaigoKei = reps.reduce((s, n) => s + (monthData.reps[n]?.kaigoRentalJisseki?.houkatsu || 0) + (monthData.reps[n]?.kaigoRentalJisseki?.kyotaku || 0), 0)
  const tokkaKei = reps.reduce((s, n) => s + (monthData.reps[n]?.tokkaBedJisseki?.houkatsu || 0) + (monthData.reps[n]?.tokkaBedJisseki?.kyotaku || 0), 0)
  const houmonHou = reps.reduce((s, n) => s + (monthData.reps[n]?.houmonJisseki?.houkatsu || 0), 0)
  const houmonKyo = reps.reduce((s, n) => s + (monthData.reps[n]?.houmonJisseki?.kyotaku || 0), 0)

  return (
    <div className="srv-panel">
      <SalesSummaryBlock sales={officeSales} monthLabel={MONTH_LABELS[monthKey]} fiscalYear={fiscalYear} />

      <div className="srv-card">
        <b>訪問実績（担当者別・営業所計）</b>
        <div className="srv-table-scroll">
          <table className="srv-table srv-table-lg">
            <thead>
              <tr>
                <th className="srv-sticky">担当者</th>
                {VISIT_FIELDS.slice(0, 5).map(([k, label]) => <th key={k}>{label}</th>)}
                <th className="srv-visit-total-col">訪問合計</th>
                {VISIT_FIELDS.slice(5).map(([k, label]) => <th key={k}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {reps.map((name) => {
                const v = monthData.reps[name]?.visit || emptyVisit()
                return (
                  <tr key={name}>
                    <th className="srv-sticky">{name}</th>
                    {VISIT_FIELDS.slice(0, 5).map(([k]) => <td key={k}>{num(v[k])}</td>)}
                    <td className="srv-calc srv-visit-total-col">{num(visitTotal(v))}</td>
                    {VISIT_FIELDS.slice(5).map(([k]) => <td key={k}>{num(v[k])}</td>)}
                  </tr>
                )
              })}
              {reps.length === 0 && <tr><td colSpan={VISIT_FIELDS.length + 2} className="srv-empty">担当者が登録されていません</td></tr>}
              <tr className="srv-total-row">
                <th className="srv-sticky">営業所計</th>
                {VISIT_FIELDS.slice(0, 5).map(([k]) => <td key={k}>{num(officeVisit[k])}</td>)}
                <td className="srv-calc srv-visit-total-col">{num(visitTotal(officeVisit))}</td>
                {VISIT_FIELDS.slice(5).map(([k]) => <td key={k}>{num(officeVisit[k])}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="srv-card">
        <b>販売内訳（営業所計・千円）</b>
        <table className="srv-mini-table srv-mini-lg">
          <thead><tr><th>項目</th><th>予算件数</th><th>予算売上</th><th>実績件数</th><th>実績売上</th><th>差</th></tr></thead>
          <tbody>
            {HANBAI_ITEMS.map((item) => {
              const h = officeHanbai[item]
              const diff = h.jissekiUriage - h.yosanUriage
              return (
                <tr key={item}>
                  <td>{item}</td><td>{num(h.yosanKensu)}</td><td>{yen(h.yosanUriage)}</td>
                  <td>{num(h.jissekiKensu)}</td><td>{yen(h.jissekiUriage)}</td>
                  <td className={diff >= 0 ? 'srv-plus' : 'srv-minus'}>{yen(diff)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="srv-card">
        <b>目標達成状況（営業所計）</b>
        <div className="srv-stat-row">
          <StatCard label={`介護保険レンタル新規（目標 ${report.goals.kaigoRental.mokuhyou * reps.length}件）`} value={num(kaigoKei)} unit="件" tone={kaigoKei >= report.goals.kaigoRental.mokuhyou * reps.length ? 'plus' : ''} />
          <StatCard label={`特価ベッド新規（目標 ${report.goals.tokkaBed.mokuhyou * reps.length}台）`} value={num(tokkaKei)} unit="台" tone={tokkaKei >= report.goals.tokkaBed.mokuhyou * reps.length ? 'plus' : ''} />
          <StatCard label={`包括訪問（目標 ${report.goals.houmon.houkatsu * reps.length}件）`} value={num(houmonHou)} unit="件" tone={houmonHou >= report.goals.houmon.houkatsu * reps.length ? 'plus' : ''} />
          <StatCard label={`居宅訪問（目標 ${report.goals.houmon.kyotaku * reps.length}件）`} value={num(houmonKyo)} unit="件" tone={houmonKyo >= report.goals.houmon.kyotaku * reps.length ? 'plus' : ''} />
        </div>
      </div>

      <div className="srv-note">※ これらの数値は各担当者タブで入力した内容を自動集計しています。修正は担当者タブから行ってください。</div>
    </div>
  )
}

/* ---------- 担当者ビュー（大きな入力欄） ---------- */
function RepEditView({ repName, entry, onChange, goals, monthKeyOfEntry, fiscalYearOfEntry }) {
  const visit = entry.visit || emptyVisit()
  const sales = entry.sales || emptySalesFigures()
  const hanbai = entry.hanbai || emptyHanbaiUchiwake()
  const targets = entry.targets || {}
  const [newTarget, setNewTarget] = useState('')

  const setVisit = (k, v) => onChange({ visit: { ...visit, [k]: v } })
  const setSales = (k, v) => onChange({ sales: { ...sales, [k]: v } })
  const setHanbai = (item, k, v) => onChange({ hanbai: { ...hanbai, [item]: { ...hanbai[item], [k]: v } } })

  const hanbaiKei = HANBAI_ITEMS.reduce((acc, item) => {
    acc.yosan += hanbai[item].yosanUriage || 0
    acc.jisseki += hanbai[item].jissekiUriage || 0
    return acc
  }, { yosan: 0, jisseki: 0 })

  return (
    <div className="srv-panel">
      <SalesSummaryBlock sales={sales} monthLabel={MONTH_LABELS[monthKeyOfEntry]} fiscalYear={fiscalYearOfEntry} editable onChangeSales={setSales} />

      <div className="srv-card">
        <b>訪問実績</b>
        <VisitTable visit={visit} onChange={setVisit} />
      </div>

      <div className="srv-card srv-print-hide">
        <b>月間売上・年度累計（千円・手入力）</b>
        <div className="srv-note" style={{ marginTop: 4 }}>※ 新規納品金額・前月回収金額・当月回収金額・新規レンタル納品目標額は、上部の集計欄で直接修正できます。</div>
        <div className="srv-group">
          <div className="srv-group-title">レンタル（担当別売上実績）</div>
          <div className="srv-big-grid">
            <BigField label="レンタル予算（単月）" value={sales.rentalYosanTanki} onChange={(v) => setSales('rentalYosanTanki', v)} suffix="千円" />
            <BigField label="レンタル実績値（単月）" value={sales.rentalJissekiTanki} onChange={(v) => setSales('rentalJissekiTanki', v)} suffix="千円" />
            <BigField label="レンタル予算（年度累計）" value={sales.rentalYosanAtsumu} onChange={(v) => setSales('rentalYosanAtsumu', v)} suffix="千円" />
            <BigField label="レンタル実績（年度累計）" value={sales.rentalJissekiAtsumu} onChange={(v) => setSales('rentalJissekiAtsumu', v)} suffix="千円" />
          </div>
        </div>
        <div className="srv-group">
          <div className="srv-group-title">住宅改修（担当別売上実績）</div>
          <div className="srv-big-grid">
            <BigField label="予算（単月）" value={sales.kaishuuYosan} onChange={(v) => setSales('kaishuuYosan', v)} suffix="千円" />
            <BigField label="実績（単月）" value={sales.kaishuuUriage} onChange={(v) => setSales('kaishuuUriage', v)} suffix="千円" />
            <BigField label="予算（年度累計）" value={sales.kaishuuYosanAtsumu} onChange={(v) => setSales('kaishuuYosanAtsumu', v)} suffix="千円" />
            <BigField label="実績（年度累計）" value={sales.kaishuuUriageAtsumu} onChange={(v) => setSales('kaishuuUriageAtsumu', v)} suffix="千円" />
          </div>
        </div>
        <div className="srv-group">
          <div className="srv-group-title">商品販売（担当別売上実績）</div>
          <div className="srv-big-grid">
            <BigField label="予算（単月）" value={sales.hanbaiYosan} onChange={(v) => setSales('hanbaiYosan', v)} suffix="千円" />
            <BigField label="実績（単月）" value={sales.hanbaiUriage} onChange={(v) => setSales('hanbaiUriage', v)} suffix="千円" />
            <BigField label="予算（年度累計）" value={sales.hanbaiYosanAtsumu} onChange={(v) => setSales('hanbaiYosanAtsumu', v)} suffix="千円" />
            <BigField label="実績（年度累計）" value={sales.hanbaiUriageAtsumu} onChange={(v) => setSales('hanbaiUriageAtsumu', v)} suffix="千円" />
          </div>
        </div>
      </div>

      <div className="srv-print-onepage">
      <div className="srv-card">
        <b>販売内訳（千円）</b>
        <div className="srv-table-scroll">
          <table className="srv-mini-table srv-mini-lg srv-input-table">
            <thead><tr><th>項目</th><th>予算件数</th><th>予算売上</th><th>実績件数</th><th>実績売上</th><th>予算差</th></tr></thead>
            <tbody>
              {HANBAI_ITEMS.map((item) => {
                const h = hanbai[item]
                const diff = (h.jissekiUriage || 0) - (h.yosanUriage || 0)
                return (
                  <tr key={item}>
                    <td>{item}</td>
                    <td><input type="number" className="srv-big-input" value={h.yosanKensu === 0 ? 0 : h.yosanKensu || ''} onChange={(e) => setHanbai(item, 'yosanKensu', Number(e.target.value) || 0)} /></td>
                    <td><input type="number" className="srv-big-input" value={h.yosanUriage === 0 ? 0 : h.yosanUriage || ''} onChange={(e) => setHanbai(item, 'yosanUriage', Number(e.target.value) || 0)} /></td>
                    <td><input type="number" className="srv-big-input" value={h.jissekiKensu === 0 ? 0 : h.jissekiKensu || ''} onChange={(e) => setHanbai(item, 'jissekiKensu', Number(e.target.value) || 0)} /></td>
                    <td><input type="number" className="srv-big-input" value={h.jissekiUriage === 0 ? 0 : h.jissekiUriage || ''} onChange={(e) => setHanbai(item, 'jissekiUriage', Number(e.target.value) || 0)} /></td>
                    <td className={diff >= 0 ? 'srv-plus' : 'srv-minus'}>{yen(diff)}</td>
                  </tr>
                )
              })}
              <tr className="srv-total-row">
                <th>合計</th><td>—</td><td>{yen(hanbaiKei.yosan)}</td><td>—</td><td>{yen(hanbaiKei.jisseki)}</td>
                <td className={hanbaiKei.jisseki - hanbaiKei.yosan >= 0 ? 'srv-plus' : 'srv-minus'}>{yen(hanbaiKei.jisseki - hanbaiKei.yosan)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="srv-card">
        <b>ターゲット包括・居宅</b>
        <div className="srv-add-rep">
          <input value={newTarget} onChange={(e) => setNewTarget(e.target.value)} placeholder="施設名を追加" />
          <button onClick={() => { if (newTarget.trim()) { onChange({ targets: { ...targets, [newTarget.trim()]: emptyTarget() } }); setNewTarget('') } }}>＋追加</button>
        </div>
        <div className="srv-table-scroll">
          <table className="srv-mini-table srv-mini-lg srv-input-table">
            <thead><tr><th>ターゲット包括・居宅</th><th>昨年度3月末 契約数</th><th>昨年度3月末 売上</th><th>今月末 契約数</th><th>今月末 売上</th><th>進捗</th><th></th></tr></thead>
            <tbody>
              {Object.entries(targets).map(([name, t]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td><input type="number" className="srv-big-input" value={t.lastMar.count === 0 ? 0 : t.lastMar.count || ''} onChange={(e) => onChange({ targets: { ...targets, [name]: { ...t, lastMar: { ...t.lastMar, count: Number(e.target.value) || 0 } } } })} /></td>
                  <td><input type="number" className="srv-big-input" value={t.lastMar.sales === 0 ? 0 : t.lastMar.sales || ''} onChange={(e) => onChange({ targets: { ...targets, [name]: { ...t, lastMar: { ...t.lastMar, sales: Number(e.target.value) || 0 } } } })} /></td>
                  <td><input type="number" className="srv-big-input" value={t.thisMonth.count === 0 ? 0 : t.thisMonth.count || ''} onChange={(e) => onChange({ targets: { ...targets, [name]: { ...t, thisMonth: { ...t.thisMonth, count: Number(e.target.value) || 0 } } } })} /></td>
                  <td><input type="number" className="srv-big-input" value={t.thisMonth.sales === 0 ? 0 : t.thisMonth.sales || ''} onChange={(e) => onChange({ targets: { ...targets, [name]: { ...t, thisMonth: { ...t.thisMonth, sales: Number(e.target.value) || 0 } } } })} /></td>
                  <td className={t.thisMonth.count - t.lastMar.count >= 0 ? 'srv-plus' : 'srv-minus'}>{t.thisMonth.count - t.lastMar.count >= 0 ? '+' : ''}{num(t.thisMonth.count - t.lastMar.count)}</td>
                  <td><button className="srv-rep-remove" onClick={() => { const n = { ...targets }; delete n[name]; onChange({ targets: n }) }}>×</button></td>
                </tr>
              ))}
              {Object.keys(targets).length === 0 && <tr><td colSpan={7} className="srv-empty">「＋追加」でターゲット施設を登録してください</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="srv-card">
        <b>目標・実績</b>
        <div className="srv-group">
          <div className="srv-group-title">●介護保険レンタル 新規獲得件数（目標 {goals.kaigoRental.mokuhyou}件/月）</div>
          <div className="srv-big-grid">
            <BigField label="包括" value={entry.kaigoRentalJisseki?.houkatsu} onChange={(v) => onChange({ kaigoRentalJisseki: { ...entry.kaigoRentalJisseki, houkatsu: v } })} suffix="件" />
            <BigField label="居宅" value={entry.kaigoRentalJisseki?.kyotaku} onChange={(v) => onChange({ kaigoRentalJisseki: { ...entry.kaigoRentalJisseki, kyotaku: v } })} suffix="件" />
          </div>
          <div className="srv-inline-calc">合計 <b>{num((entry.kaigoRentalJisseki?.houkatsu || 0) + (entry.kaigoRentalJisseki?.kyotaku || 0))}件</b>／達成率 <b>{pct((entry.kaigoRentalJisseki?.houkatsu || 0) + (entry.kaigoRentalJisseki?.kyotaku || 0), goals.kaigoRental.mokuhyou)}</b></div>
        </div>
        <div className="srv-group">
          <div className="srv-group-title">●特価ベッドレンタル 新規獲得件数（目標 {goals.tokkaBed.mokuhyou}台/月）</div>
          <div className="srv-big-grid">
            <BigField label="包括" value={entry.tokkaBedJisseki?.houkatsu} onChange={(v) => onChange({ tokkaBedJisseki: { ...entry.tokkaBedJisseki, houkatsu: v } })} suffix="台" />
            <BigField label="居宅" value={entry.tokkaBedJisseki?.kyotaku} onChange={(v) => onChange({ tokkaBedJisseki: { ...entry.tokkaBedJisseki, kyotaku: v } })} suffix="台" />
          </div>
          <div className="srv-inline-calc">合計 <b>{num((entry.tokkaBedJisseki?.houkatsu || 0) + (entry.tokkaBedJisseki?.kyotaku || 0))}台</b>／達成率 <b>{pct((entry.tokkaBedJisseki?.houkatsu || 0) + (entry.tokkaBedJisseki?.kyotaku || 0), goals.tokkaBed.mokuhyou)}</b></div>
        </div>
        <div className="srv-group">
          <div className="srv-group-title">●包括・居宅訪問件数（目標 包括{goals.houmon.houkatsu}件／居宅{goals.houmon.kyotaku}件）</div>
          <div className="srv-big-grid">
            <BigField label="包括" value={entry.houmonJisseki?.houkatsu} onChange={(v) => onChange({ houmonJisseki: { ...entry.houmonJisseki, houkatsu: v } })} suffix="件" />
            <BigField label="居宅" value={entry.houmonJisseki?.kyotaku} onChange={(v) => onChange({ houmonJisseki: { ...entry.houmonJisseki, kyotaku: v } })} suffix="件" />
          </div>
          <div className="srv-inline-calc">
            合計 <b>{num((entry.houmonJisseki?.houkatsu || 0) + (entry.houmonJisseki?.kyotaku || 0))}件</b>
            ／達成率 <b>{pct((entry.houmonJisseki?.houkatsu || 0) + (entry.houmonJisseki?.kyotaku || 0), goals.houmon.houkatsu + goals.houmon.kyotaku)}</b>
          </div>
        </div>
      </div>

      <div className="srv-grid-2">
        <div className="srv-card">
          <b>●総括</b>
          <textarea className="srv-big-textarea" rows={6} value={entry.soukatsu} onChange={(e) => onChange({ soukatsu: e.target.value })} placeholder="今月の総括を入力してください" />
        </div>
        <div className="srv-card">
          <b>●次月対策</b>
          <textarea className="srv-big-textarea" rows={6} value={entry.jigetsuTaisaku} onChange={(e) => onChange({ jigetsuTaisaku: e.target.value })} placeholder="次月の対策を入力してください" />
        </div>
      </div>
      </div>
    </div>
  )
}

function MonthlyReportTab({ officeName, report, fiscalYear, setFiscalYear, monthKey, setMonthKey, refresh }) {
  const [activeRep, setActiveRep] = useState('__office__')
  const [newRepName, setNewRepName] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importMessage, setImportMessage] = useState(null) // { type: 'ok'|'error', text }
  const monthData = getYearMonths(report, fiscalYear)[monthKey] || { reps: {} }
  const reps = report.repNames
  const calendarYear = fiscalCalendarYear(fiscalYear, monthKey)
  const availableYears = listFiscalYears(report, fiscalYear)

  function patchRep(repName, patch) {
    updateRepEntry(officeName, fiscalYear, monthKey, repName, patch)
    refresh()
  }

  async function importOneFile(file) {
    if (/\.(xlsx|xlsm)$/i.test(file.name)) {
      let result
      try { result = await parseSalesWorkbookAuto(file) }
      catch (firstError) {
        if (/アプリが更新されたため/.test(firstError.message)) throw firstError
        // 売上状況報告書／担当別売上実績／商品分類別販売売上のいずれでもなければ、居宅別売上推移表として試す。
        const trend = await parseProviderSalesWorkbook(file)
        const officeEntry = pickOfficeData(trend.offices, officeName)[officeName]
        const summary = applyImportedProviderSales(officeName, officeEntry)
        return `居宅別売上推移表：${trend.fiscalYear}年度分を${summary.providerCount}件の居宅に反映（居宅カレンダー・実績分析に表示されます）`
      }
      if (result.type === 'status') {
        const targetYear = result.fiscalYear ?? fiscalYear
        const targetMonth = result.monthKey ?? monthKey
        const summary = applyImportedSalesFigures(targetYear, targetMonth, pickOfficeData(result.data, officeName))
        const total = summary.updated.length + summary.created.length
        const note = summary.created.length ? `（新規追加：${summary.created.join('、')}）` : ''
        return `売上状況報告書：${targetYear}年度${MONTH_LABELS[targetMonth]}分を${total}件の担当者に反映${note}`
      }
      if (result.type === 'hanbaiBunrui') {
        const targetYear = result.fiscalYear ?? fiscalYear
        const targetMonth = result.monthKey ?? monthKey
        const summary = applyImportedHanbaiFigures(targetYear, targetMonth, pickOfficeData(result.data, officeName))
        const total = summary.updated.length + summary.created.length
        const note = summary.created.length ? `（新規追加：${summary.created.join('、')}）` : ''
        return `商品分類別販売売上：${targetYear}年度${MONTH_LABELS[targetMonth]}分を${total}件の担当者に反映${note}`
      }
      const targetYear = result.fiscalYear ?? fiscalYear
      const summary = applyImportedSalesFiguresMultiMonth(targetYear, pickOfficeData(result.data, officeName))
      const total = summary.updated.length + summary.created.length
      const note = summary.created.length ? `（新規追加：${summary.created.join('、')}）` : ''
      return `担当別売上実績：${targetYear}年度${summary.months.map((k) => MONTH_LABELS[k]).join('・')}分を${total}件の担当者に反映${note}`
    }
    const result = await parseVisitLogWorkbook(file)
    const summary = applyImportedVisitFigures(pickOfficeData(result.offices, officeName))
    const total = summary.updated.length + summary.created.length
    const note = summary.created.length ? `（新規追加：${summary.created.join('、')}）` : ''
    return `訪問ログ：${result.matchedRows}/${result.totalRows}件を${total}件の担当者に反映${note}`
  }

  async function handleImportFile(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setImportBusy(true)
    setImportMessage(null)
    const results = []
    const errors = []
    for (const file of files) {
      try {
        results.push(await importOneFile(file))
      } catch (err) {
        errors.push(`${file.name}：${err.message || '取り込みに失敗しました。'}`)
      }
    }
    refresh()
    setImportBusy(false)
    if (results.length && !errors.length) setImportMessage({ type: 'ok', text: results.join('／') })
    else if (results.length && errors.length) setImportMessage({ type: 'ok', text: `${results.join('／')}\n（一部失敗：${errors.join('、')}）` })
    else setImportMessage({ type: 'error', text: errors.join('、') })
  }

  const currentEntry = activeRep !== '__office__' ? (monthData.reps[activeRep] || null) : null

  return (
    <div className="srv-panel">
      <div className="srv-year-switch">
        {availableYears.map((y) => (
          <button key={y} className={y === fiscalYear ? 'active' : ''} onClick={() => setFiscalYear(y)}>{y}年度</button>
        ))}
      </div>
      <div className="srv-month-switch">
        {MONTH_KEYS.map((k) => (
          <button key={k} className={k === monthKey ? 'active' : ''} onClick={() => setMonthKey(k)}>{MONTH_LABELS[k]}</button>
        ))}
      </div>
      <div className="srv-month-title">{calendarYear}年{MONTH_LABELS[monthKey]}　【{officeName}】</div>

      <div className="srv-import-card">
        <label className="srv-import-card-btn">
          <Icon name="upload" size={24} />
          <span>{importBusy ? '取り込み中…' : 'Excelを取り込む'}</span>
          <input type="file" accept=".xlsx,.xlsm,.xls,.csv" multiple disabled={importBusy} onChange={handleImportFile} hidden />
        </label>
        <div className="srv-import-card-body">
          <div className="srv-import-card-title">取り込めるファイル（複数まとめて選択できます）</div>
          <ul className="srv-import-list">
            <li>売上状況報告書（新規納品・前月回収・当月回収・目標額）</li>
            <li>営業所／担当別売上実績（レンタル・住宅改修・商品販売の予算と実績）</li>
            <li>販売区分・商品分類別 販売売上（住宅改修／福祉用具／紙おむつ／消耗品の件数・売上）</li>
            <li>居宅別売上推移表（居宅ごとの月次売上。居宅カレンダー・実績分析に反映）</li>
            <li>訪問ログ（担当者別の訪問実績・全月分に自動反映）</li>
          </ul>
          <span className="srv-import-hint">年度・月・営業所はファイルの中身から自動判定し、「{officeName}」のデータだけを反映します。同じ月を取り込み直すと上書きされます。</span>
        </div>
      </div>
      {importMessage && <div className={`srv-import-msg ${importMessage.type}`}>{importMessage.text}</div>}

      <div className="srv-rep-tabs">
        <button className={activeRep === '__office__' ? 'active office' : 'office'} onClick={() => setActiveRep('__office__')}>営業所合計</button>
        {reps.map((name) => (
          <button key={name} className={activeRep === name ? 'active' : ''} onClick={() => setActiveRep(name)}>{name}</button>
        ))}
        <div className="srv-add-rep srv-add-rep-inline">
          <input value={newRepName} onChange={(e) => setNewRepName(e.target.value)} placeholder="担当者を追加" />
          <button onClick={() => { const n = newRepName.trim(); if (n) { addRep(officeName, fiscalYear, n); setNewRepName(''); refresh(); setActiveRep(n) } }}>＋</button>
        </div>
      </div>

      {activeRep === '__office__' ? (
        <OfficeSummaryView report={report} fiscalYear={fiscalYear} monthKey={monthKey} />
      ) : currentEntry ? (
        <>
          <div className="srv-rep-head">
            <span>{activeRep} の入力</span>
            <button className="srv-rep-delete-btn" onClick={() => { if (window.confirm(activeRep + 'を削除しますか？（全ての年度・月の入力データも消えます）')) { removeRep(officeName, activeRep); setActiveRep('__office__'); refresh() } }}>この担当者を削除</button>
          </div>
          <RepEditView repName={activeRep} entry={currentEntry} onChange={(patch) => patchRep(activeRep, patch)} goals={report.goals} monthKeyOfEntry={monthKey} fiscalYearOfEntry={fiscalYear} />
        </>
      ) : (
        <div className="srv-card"><div className="srv-empty">担当者データがありません</div></div>
      )}
    </div>
  )
}

/* ============================== 目標設定シート ============================== */
function GoalSettingTab({ officeName, report, refresh }) {
  const g = report.kamiTermGoals
  function patch(next) { updateOfficeReport(officeName, (r) => ({ ...r, kamiTermGoals: { ...r.kamiTermGoals, ...next } })); refresh() }
  function patchItem(listKey, index, next) {
    const items = [...g[listKey]]
    items[index] = { ...items[index], ...next }
    patch({ [listKey]: items })
  }
  return (
    <div className="srv-panel">
      <div className="srv-card">
        <b>目標設定シート</b>
        <div className="srv-field-grid" style={{ marginTop: 8 }}>
          <label>事業所名<input value={g.officeName} onChange={(e) => patch({ officeName: e.target.value })} className="srv-text-input" /></label>
          <label>氏名<input value={g.personName} onChange={(e) => patch({ personName: e.target.value })} className="srv-text-input" /></label>
        </div>
        {[['items', '①個別設定目標'], ['kadaiItems', '②個別重点課題']].map(([key, title]) => (
          <div key={key} className="srv-goal-block">
            <div className="srv-detail-title">{title}</div>
            {g[key].map((item, i) => (
              <div key={i} className="srv-goal-item">
                <div className="srv-goal-item-head">
                  <label>ウェイト<NumberCell value={item.weight} onChange={(v) => patchItem(key, i, { weight: v })} width={40} /></label>
                  <button className="srv-rep-remove" onClick={() => patch({ [key]: g[key].filter((_, idx) => idx !== i) })}>×削除</button>
                </div>
                <textarea rows={2} value={item.title} placeholder="目標設定" onChange={(e) => patchItem(key, i, { title: e.target.value })} />
                <div className="srv-eval-grid">
                  {['s', 'a', 'b', 'c', 'd'].map((rank) => (
                    <label key={rank}>{rank.toUpperCase()}<textarea rows={2} value={item[rank]} onChange={(e) => patchItem(key, i, { [rank]: e.target.value })} /></label>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={() => patch({ [key]: [...g[key], { weight: 1, title: '', s: '', a: '', b: '', c: '', d: '' }] })}>＋項目を追加</button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============================== 売上予算表 ============================== */
function BudgetTableTab({ officeName, report, refresh }) {
  const b = report.budget
  function patchOffice(next) { updateOfficeReport(officeName, (r) => ({ ...r, budget: { ...r.budget, office: { ...r.budget.office, ...next } } })); refresh() }
  function patchRepBudget(name, next) {
    updateOfficeReport(officeName, (r) => ({ ...r, budget: { ...r.budget, reps: { ...r.budget.reps, [name]: { ...(r.budget.reps[name] || {}), ...next } } } }))
    refresh()
  }
  function MonthlyRow({ label, values, onChange }) {
    return (
      <tr>
        <th>{label}</th>
        {values.map((v, i) => (
          <td key={i}><NumberCell value={v} onChange={(val) => { const next = [...values]; next[i] = val; onChange(next) }} width={68} /></td>
        ))}
        <td className="srv-calc">{yen(values.reduce((s, v) => s + Number(v || 0), 0))}</td>
      </tr>
    )
  }
  function BudgetBlock({ title, data, onChange }) {
    return (
      <div className="srv-card">
        <b>{title}</b>
        <div className="srv-table-scroll">
          <table className="srv-table srv-table-lg">
            <thead><tr><th></th>{MONTH_KEYS.map((k) => <th key={k}>{MONTH_LABELS[k]}</th>)}<th>計</th></tr></thead>
            <tbody>
              <MonthlyRow label="レンタル売上予算" values={data.rentalMonthly} onChange={(v) => onChange({ rentalMonthly: v })} />
              <MonthlyRow label="住宅改修売上予算" values={data.kaishuuMonthly} onChange={(v) => onChange({ kaishuuMonthly: v })} />
              <MonthlyRow label="商品販売売上予算" values={data.hanbaiMonthly} onChange={(v) => onChange({ hanbaiMonthly: v })} />
              <MonthlyRow label="特価ベッド目標台数" values={data.tokkaBedMonthly} onChange={(v) => onChange({ tokkaBedMonthly: v })} />
            </tbody>
          </table>
        </div>
        <div className="srv-field-grid" style={{ marginTop: 8 }}>
          <label>前年度消耗品売上実績（月平均）<NumberCell value={data.shouhinhinLastYearAvg} onChange={(v) => onChange({ shouhinhinLastYearAvg: v })} width={100} /></label>
          <label>本年度消耗品売上目標（月平均）<NumberCell value={data.shouhinhinTargetAvg} onChange={(v) => onChange({ shouhinhinTargetAvg: v })} width={100} /></label>
        </div>
      </div>
    )
  }
  return (
    <div className="srv-panel">
      <div className="srv-month-title">売上予算表</div>
      <BudgetBlock title={`営業所計（${officeName}）`} data={b.office} onChange={patchOffice} />
      {report.repNames.map((name) => (
        <BudgetBlock key={name} title={`担当：${name}`} data={b.reps[name] || { rentalMonthly: Array(12).fill(0), kaishuuMonthly: Array(12).fill(0), hanbaiMonthly: Array(12).fill(0), tokkaBedMonthly: Array(12).fill(0), shouhinhinLastYearAvg: 0, shouhinhinTargetAvg: 0 }} onChange={(next) => patchRepBudget(name, next)} />
      ))}
    </div>
  )
}

/* ============================== フィードバック面談記録 ============================== */
function InterviewTab({ officeName, report, refresh }) {
  function patch(next) { updateOfficeReport(officeName, (r) => ({ ...r, interviews: { ...r.interviews, ...next } })); refresh() }
  return (
    <div className="srv-panel">
      <div className="srv-card">
        <div className="srv-detail-title">■前年度下期面談記録</div>
        <textarea className="srv-big-textarea" rows={10} value={report.interviews.shimoki} onChange={(e) => patch({ shimoki: e.target.value })} />
      </div>
      <div className="srv-card">
        <div className="srv-detail-title">■上期面談記録</div>
        <textarea className="srv-big-textarea" rows={10} value={report.interviews.kamiki} onChange={(e) => patch({ kamiki: e.target.value })} />
      </div>
    </div>
  )
}

/* ============================== 年間目標進捗（自動集計） ============================== */
function AnnualProgressTab({ officeName, report, fiscalYear }) {
  const upperMonths = ['04', '05', '06', '07', '08', '09']
  const lowerMonths = ['10', '11', '12', '01', '02', '03']
  const months = getYearMonths(report, fiscalYear)

  const allEntries = useMemo(() => {
    const list = []
    for (const k of MONTH_KEYS) for (const name of report.repNames) list.push(months[k]?.reps?.[name])
    return list.filter(Boolean)
  }, [months, report.repNames])

  function sumOver(monthKeys, pick) {
    let total = 0
    for (const k of monthKeys) for (const name of report.repNames) {
      const e = months[k]?.reps?.[name]
      if (e) total += pick(e) || 0
    }
    return total
  }

  const rentalUpperJisseki = sumOver(upperMonths, (e) => e.sales.touGetsuKaishu)
  const rentalUpperYosan = report.budget.office.rentalMonthly.slice(0, 6).reduce((s, v) => s + v, 0)
  const rentalLowerYosan = report.budget.office.rentalMonthly.slice(6, 12).reduce((s, v) => s + v, 0)
  const rentalLowerJisseki = sumOver(lowerMonths, (e) => e.sales.touGetsuKaishu)

  const kaigoUpper = sumOver(upperMonths, (e) => (e.kaigoRentalJisseki?.houkatsu || 0) + (e.kaigoRentalJisseki?.kyotaku || 0))
  const kaigoLower = sumOver(lowerMonths, (e) => (e.kaigoRentalJisseki?.houkatsu || 0) + (e.kaigoRentalJisseki?.kyotaku || 0))
  const kaigoMokuhyouMonth = report.goals.kaigoRental.mokuhyou * report.repNames.length
  const tokkaUpper = sumOver(upperMonths, (e) => (e.tokkaBedJisseki?.houkatsu || 0) + (e.tokkaBedJisseki?.kyotaku || 0))
  const tokkaLower = sumOver(lowerMonths, (e) => (e.tokkaBedJisseki?.houkatsu || 0) + (e.tokkaBedJisseki?.kyotaku || 0))
  const tokkaMokuhyouMonth = report.goals.tokkaBed.mokuhyou * report.repNames.length

  const houmonHoukatsuJisseki = sumOver(MONTH_KEYS, (e) => e.houmonJisseki?.houkatsu || 0)
  const houmonKyotakuJisseki = sumOver(MONTH_KEYS, (e) => e.houmonJisseki?.kyotaku || 0)
  const houmonHoukatsuMokuhyou = report.goals.houmon.houkatsu * report.repNames.length
  const houmonKyotakuMokuhyou = report.goals.houmon.kyotaku * report.repNames.length

  // ターゲット包括・居宅：全担当者の該当月のtargetsを名寄せして合算
  const targetTotals = useMemo(() => {
    const acc = {}
    for (const k of MONTH_KEYS) for (const name of report.repNames) {
      const targets = months[k]?.reps?.[name]?.targets || {}
      for (const [facName, t] of Object.entries(targets)) {
        if (!acc[facName]) acc[facName] = { lastMar: { count: 0, sales: 0 }, latest: { count: 0, sales: 0 } }
        acc[facName].latest = t.thisMonth
        if (k === '04') acc[facName].lastMar = t.lastMar
      }
    }
    return acc
  }, [months, report.repNames])

  const hanbaiAnnual = useMemo(() => {
    const acc = {}
    for (const item of HANBAI_ITEMS) acc[item] = { yosan: 0, jisseki: 0 }
    for (const k of MONTH_KEYS) for (const name of report.repNames) {
      const h = months[k]?.reps?.[name]?.hanbai
      if (!h) continue
      for (const item of HANBAI_ITEMS) { acc[item].yosan += h[item].yosanUriage || 0; acc[item].jisseki += h[item].jissekiUriage || 0 }
    }
    return acc
  }, [months, report.repNames])

  return (
    <div className="srv-panel">
      <div className="srv-month-title">{fiscalYear}年度　年間目標進捗と対応策　【{officeName}】</div>

      <div className="srv-grid-3">
        <div className="srv-card">
          <b>■レンタル予算（単位：千円）</b>
          <div className="srv-kv-grid">
            <span>上期予算</span><b>{yen(rentalUpperYosan)}</b>
            <span>上期実績</span><b>{yen(rentalUpperJisseki)}</b>
            <span>達成率</span><b>{pct(rentalUpperJisseki, rentalUpperYosan)}</b>
            <span>下期予算</span><b>{yen(rentalLowerYosan)}</b>
            <span>下期実績</span><b>{yen(rentalLowerJisseki)}</b>
            <span>達成率</span><b>{pct(rentalLowerJisseki, rentalLowerYosan)}</b>
          </div>
        </div>
        <div className="srv-card">
          <b>■レンタル新規獲得件数（目標{report.goals.kaigoRental.mokuhyou}件/月・人）</b>
          <div className="srv-kv-grid">
            <span>上期目標</span><b>{num(kaigoMokuhyouMonth * 6)}</b>
            <span>上期実績</span><b>{num(kaigoUpper)}</b>
            <span>達成率</span><b>{pct(kaigoUpper, kaigoMokuhyouMonth * 6)}</b>
            <span>下期目標</span><b>{num(kaigoMokuhyouMonth * 6)}</b>
            <span>下期実績</span><b>{num(kaigoLower)}</b>
            <span>達成率</span><b>{pct(kaigoLower, kaigoMokuhyouMonth * 6)}</b>
          </div>
        </div>
        <div className="srv-card">
          <b>■特価ベッド獲得件数（目標{report.goals.tokkaBed.mokuhyou}台/月・人）</b>
          <div className="srv-kv-grid">
            <span>上期目標</span><b>{num(tokkaMokuhyouMonth * 6)}</b>
            <span>上期実績</span><b>{num(tokkaUpper)}</b>
            <span>達成率</span><b>{pct(tokkaUpper, tokkaMokuhyouMonth * 6)}</b>
            <span>下期目標</span><b>{num(tokkaMokuhyouMonth * 6)}</b>
            <span>下期実績</span><b>{num(tokkaLower)}</b>
            <span>達成率</span><b>{pct(tokkaLower, tokkaMokuhyouMonth * 6)}</b>
          </div>
        </div>
      </div>

      <div className="srv-card">
        <b>■包括・居宅訪問件数（年間累計・目標　包括{report.goals.houmon.houkatsu}件／居宅{report.goals.houmon.kyotaku}件　月・人）</b>
        <div className="srv-kv-grid">
          <span>包括 目標（年間）</span><b>{num(houmonHoukatsuMokuhyou * 12)}</b>
          <span>包括 実績</span><b>{num(houmonHoukatsuJisseki)}</b>
          <span>達成率</span><b>{pct(houmonHoukatsuJisseki, houmonHoukatsuMokuhyou * 12)}</b>
          <span>居宅 目標（年間）</span><b>{num(houmonKyotakuMokuhyou * 12)}</b>
          <span>居宅 実績</span><b>{num(houmonKyotakuJisseki)}</b>
          <span>達成率</span><b>{pct(houmonKyotakuJisseki, houmonKyotakuMokuhyou * 12)}</b>
        </div>
      </div>

      <div className="srv-card">
        <b>■ターゲット包括・居宅</b>
        <table className="srv-mini-table">
          <thead><tr><th>施設</th><th>昨年度3月 契約数</th><th>売上</th><th>直近 契約数</th><th>売上</th><th>進捗（契約数）</th></tr></thead>
          <tbody>
            {Object.entries(targetTotals).map(([name, t]) => (
              <tr key={name}>
                <td>{name}</td><td>{num(t.lastMar.count)}</td><td>{yen(t.lastMar.sales)}</td>
                <td>{num(t.latest.count)}</td><td>{yen(t.latest.sales)}</td>
                <td>{t.latest.count - t.lastMar.count >= 0 ? '+' : ''}{num(t.latest.count - t.lastMar.count)}</td>
              </tr>
            ))}
            {Object.keys(targetTotals).length === 0 && <tr><td colSpan={6} className="srv-empty">月報タブでターゲット施設を登録すると、ここに反映されます</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="srv-card">
        <b>■販売予算　項目別年間売上（実績）</b>
        <table className="srv-mini-table">
          <thead><tr><th>項目</th><th>年間予算</th><th>年間実績</th><th>差</th></tr></thead>
          <tbody>
            {HANBAI_ITEMS.map((item) => (
              <tr key={item}>
                <td>{item}</td><td>{yen(hanbaiAnnual[item].yosan)}</td><td>{yen(hanbaiAnnual[item].jisseki)}</td>
                <td className={hanbaiAnnual[item].jisseki - hanbaiAnnual[item].yosan >= 0 ? 'srv-plus' : 'srv-minus'}>{yen(hanbaiAnnual[item].jisseki - hanbaiAnnual[item].yosan)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="srv-grid-2">
        <div className="srv-card"><div className="srv-detail-title">■本年度対策</div><p className="srv-readonly-text">{report.honnendoTaisaku.honnendo || '（未入力）'}</p></div>
        <div className="srv-card"><div className="srv-detail-title">■本年度総括</div><textarea rows={4} defaultValue={report.honnendoTaisaku.honnendoSoukatsu} onBlur={(e) => updateOfficeReport(officeName, (r) => ({ ...r, honnendoTaisaku: { ...r.honnendoTaisaku, honnendoSoukatsu: e.target.value } }))} /></div>
      </div>
      <div className="srv-note">※ 各数値は月報タブで入力した実績・売上予算表の予算を自動集計しています。手入力欄は入力後に自動保存されます。</div>
    </div>
  )
}

/* ============================== メイン ============================== */
const SUB_TABS = [
  ['monthly', '月報'],
  ['goals', '目標設定シート'],
  ['budget', '売上予算表'],
  ['interview', 'フィードバック面談記録'],
  ['annual', '年間目標進捗'],
]

export function SalesReportView({ officeName, fiscalYear: appFiscalYear }) {
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)
  const report = useMemo(() => getOfficeReport(officeName), [officeName, tick])
  const [subTab, setSubTab] = useState('monthly')
  const [fiscalYear, setFiscalYear] = useState(appFiscalYear || DEFAULT_FISCAL_YEAR)
  const [monthKey, setMonthKey] = useState('04')
  const [pdfBusy, setPdfBusy] = useState(false)

  function handlePrint() {
    document.body.classList.add('srv-printing')
    // 訪問実績の横長表が収まるよう、印刷時だけA4横向きにする（他画面の印刷には影響させない）。
    const pageStyle = document.createElement('style')
    pageStyle.id = 'srv-print-page-style'
    pageStyle.textContent = '@page { size: A4 landscape; margin: 10mm; }'
    document.head.appendChild(pageStyle)
    const cleanup = () => {
      document.body.classList.remove('srv-printing')
      pageStyle.remove()
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  async function handlePdf() {
    setPdfBusy(true)
    document.body.classList.add('srv-printing')
    try {
      await downloadElementPdf({ selector: '#srv-print-area', fileName: `${officeName}_営業月報_${MONTH_LABELS[monthKey]}.pdf` })
    } catch (err) {
      window.alert(err.message || 'PDFの作成に失敗しました。')
    } finally {
      document.body.classList.remove('srv-printing')
      setPdfBusy(false)
    }
  }

  return (
    <div className="srv-root" id="srv-print-area">
      <div className="page-header">
        <div><h1>営業月報</h1><p>担当者ごとに入力すると、営業所全体の数字が自動で集計されます</p></div>
      </div>
      <div className="srv-print-bar">
        <button onClick={handlePrint}>印刷</button>
        <button onClick={handlePdf} disabled={pdfBusy}>{pdfBusy ? 'PDF作成中…' : 'PDFで保存'}</button>
      </div>
      <div className="srv-sub-tabs">
        {SUB_TABS.map(([key, label]) => (
          <button key={key} className={subTab === key ? 'active' : ''} onClick={() => setSubTab(key)}>{label}</button>
        ))}
      </div>
      {subTab === 'monthly' && <MonthlyReportTab officeName={officeName} report={report} fiscalYear={fiscalYear} setFiscalYear={setFiscalYear} monthKey={monthKey} setMonthKey={setMonthKey} refresh={refresh} />}
      {subTab === 'goals' && <GoalSettingTab officeName={officeName} report={report} refresh={refresh} />}
      {subTab === 'budget' && <BudgetTableTab officeName={officeName} report={report} refresh={refresh} />}
      {subTab === 'interview' && <InterviewTab officeName={officeName} report={report} refresh={refresh} />}
      {subTab === 'annual' && <AnnualProgressTab officeName={officeName} report={report} fiscalYear={fiscalYear} />}
    </div>
  )
}
