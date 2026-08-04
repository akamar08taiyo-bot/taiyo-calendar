import React, { useMemo, useState } from 'react'
import { Icon } from './Icon'
import {
  MONTH_KEYS, MONTH_LABELS, fiscalCalendarYear,
  VISIT_FIELDS, emptyVisit, sumVisits, visitTotal,
  emptySalesFigures, sumSalesFigures,
  HANBAI_ITEMS, emptyHanbaiUchiwake, sumHanbaiUchiwake,
  emptyTarget,
  getOfficeReport, updateOfficeReport, updateRepEntry, addRep, removeRep,
  cumulativeSalesThrough,
} from '../salesReportData'

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
function MonthlyReportTab({ officeName, report, monthKey, setMonthKey, fiscalYear, refresh }) {
  const [openRep, setOpenRep] = useState(report.repNames[0] || null)
  const [newRepName, setNewRepName] = useState('')

  const monthData = report.months[monthKey] || { reps: {} }
  const reps = report.repNames

  const officeVisit = useMemo(() => sumVisits(reps.map((n) => monthData.reps[n]?.visit || emptyVisit())), [reps, monthData])
  const officeSales = useMemo(() => sumSalesFigures(reps.map((n) => monthData.reps[n]?.sales || emptySalesFigures())), [reps, monthData])
  const officeHanbai = useMemo(() => sumHanbaiUchiwake(reps.map((n) => monthData.reps[n]?.hanbai || emptyHanbaiUchiwake())), [reps, monthData])

  const cumAll = useMemo(() => cumulativeSalesThrough(report, monthKey), [report, monthKey])
  const officeCum = useMemo(() => sumSalesFigures(reps.map((n) => cumAll[n])), [reps, cumAll])

  function patchRep(repName, patch) {
    updateRepEntry(officeName, monthKey, repName, patch)
    refresh()
  }

  const calendarYear = fiscalCalendarYear(fiscalYear, monthKey)

  return (
    <div className="srv-panel">
      <div className="srv-month-switch">
        {MONTH_KEYS.map((k) => (
          <button key={k} className={k === monthKey ? 'active' : ''} onClick={() => setMonthKey(k)}>{MONTH_LABELS[k]}</button>
        ))}
      </div>
      <div className="srv-month-title">{calendarYear}年{MONTH_LABELS[monthKey]}　営業月報　【{officeName}】</div>

      {/* 訪問実績（担当者ごと＋営業所計） */}
      <div className="srv-card">
        <div className="srv-card-head">
          <b>訪問実績</b>
          <div className="srv-add-rep">
            <input value={newRepName} onChange={(e) => setNewRepName(e.target.value)} placeholder="担当者名を追加" />
            <button onClick={() => { if (newRepName.trim()) { addRep(officeName, newRepName.trim()); setNewRepName(''); refresh() } }}>＋追加</button>
          </div>
        </div>
        <div className="srv-table-scroll">
          <table className="srv-table">
            <thead>
              <tr>
                <th className="srv-sticky">担当者</th>
                {VISIT_FIELDS.map(([k, label]) => <th key={k}>{label}</th>)}
                <th>訪問合計</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((name) => {
                const v = monthData.reps[name]?.visit || emptyVisit()
                return (
                  <tr key={name}>
                    <th className="srv-sticky srv-rep-name">
                      {name}
                      <button className="srv-rep-remove" title="削除" onClick={() => { if (window.confirm(name + 'を削除しますか？（過去の入力データも消えます）')) { removeRep(officeName, name); refresh() } }}>×</button>
                    </th>
                    {VISIT_FIELDS.map(([k]) => (
                      <td key={k}><NumberCell value={v[k]} onChange={(val) => patchRep(name, { visit: { ...v, [k]: val } })} width={48} /></td>
                    ))}
                    <td className="srv-calc">{num(visitTotal(v))}</td>
                  </tr>
                )
              })}
              {reps.length === 0 && <tr><td colSpan={VISIT_FIELDS.length + 2} className="srv-empty">「＋追加」で担当者を登録してください</td></tr>}
              <tr className="srv-total-row">
                <th className="srv-sticky">営業所計</th>
                {VISIT_FIELDS.map(([k]) => <td key={k}>{num(officeVisit[k])}</td>)}
                <td className="srv-calc">{num(visitTotal(officeVisit))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 月間売上・累計売上（担当者ごと入力／営業所計は自動） */}
      <div className="srv-grid-2">
        <div className="srv-card">
          <b>月間売上（千円・手入力）</b>
          {reps.map((name) => {
            const s = monthData.reps[name]?.sales || emptySalesFigures()
            return (
              <details key={name} className="srv-rep-details" open={openRep === name} onToggle={(e) => setOpenRep(e.target.open ? name : null)}>
                <summary>{name}</summary>
                <div className="srv-field-grid">
                  <label>レンタル納品合計<NumberCell value={s.rentalNouhinKeikei} onChange={(v) => patchRep(name, { sales: { ...s, rentalNouhinKeikei: v } })} width={90} /></label>
                  <label>前月回収<NumberCell value={s.zenGetsuKaishu} onChange={(v) => patchRep(name, { sales: { ...s, zenGetsuKaishu: v } })} width={90} /></label>
                  <label>目標値<NumberCell value={s.mokuhyou} onChange={(v) => patchRep(name, { sales: { ...s, mokuhyou: v } })} width={90} /></label>
                  <label>当月回収<NumberCell value={s.touGetsuKaishu} onChange={(v) => patchRep(name, { sales: { ...s, touGetsuKaishu: v } })} width={90} /></label>
                  <label>商品販売予算<NumberCell value={s.hanbaiYosan} onChange={(v) => patchRep(name, { sales: { ...s, hanbaiYosan: v } })} width={90} /></label>
                  <label>商品販売売上<NumberCell value={s.hanbaiUriage} onChange={(v) => patchRep(name, { sales: { ...s, hanbaiUriage: v } })} width={90} /></label>
                  <label>住宅改修予算<NumberCell value={s.kaishuuYosan} onChange={(v) => patchRep(name, { sales: { ...s, kaishuuYosan: v } })} width={90} /></label>
                  <label>住宅改修売上<NumberCell value={s.kaishuuUriage} onChange={(v) => patchRep(name, { sales: { ...s, kaishuuUriage: v } })} width={90} /></label>
                  <label>レンタル予算（累計）<NumberCell value={s.rentalYosanAtsumu} onChange={(v) => patchRep(name, { sales: { ...s, rentalYosanAtsumu: v } })} width={90} /></label>
                  <label>レンタル実績（累計）<NumberCell value={s.rentalJissekiAtsumu} onChange={(v) => patchRep(name, { sales: { ...s, rentalJissekiAtsumu: v } })} width={90} /></label>
                </div>
              </details>
            )
          })}
          <div className="srv-office-summary">
            <div className="srv-office-summary-title">営業所計（自動集計）</div>
            <div className="srv-kv-grid">
              <span>販売予算</span><b>{yen((officeSales.hanbaiYosan) + (officeSales.kaishuuYosan))}</b>
              <span>販売合計（売上）</span><b>{yen(officeSales.hanbaiUriage + officeSales.kaishuuUriage)}</b>
              <span>予算差</span><b>{yen((officeSales.hanbaiUriage + officeSales.kaishuuUriage) - (officeSales.hanbaiYosan + officeSales.kaishuuYosan))}</b>
              <span>当月回収</span><b>{yen(officeSales.touGetsuKaishu)}</b>
              <span>レンタル実績（累計）</span><b>{yen(officeCum.rentalJissekiAtsumu)}</b>
              <span>レンタル予算（累計）</span><b>{yen(officeCum.rentalYosanAtsumu)}</b>
            </div>
          </div>
        </div>

        {/* 販売内訳 */}
        <div className="srv-card">
          <b>販売内訳（手入力・千円）</b>
          {reps.map((name) => {
            const h = monthData.reps[name]?.hanbai || emptyHanbaiUchiwake()
            return (
              <details key={name} className="srv-rep-details">
                <summary>{name}</summary>
                <table className="srv-mini-table">
                  <thead><tr><th>項目</th><th>予算件数</th><th>予算売上</th><th>実績件数</th><th>実績売上</th></tr></thead>
                  <tbody>
                    {HANBAI_ITEMS.map((item) => (
                      <tr key={item}>
                        <td>{item}</td>
                        <td><NumberCell value={h[item].yosanKensu} onChange={(v) => patchRep(name, { hanbai: { ...h, [item]: { ...h[item], yosanKensu: v } } })} width={48} /></td>
                        <td><NumberCell value={h[item].yosanUriage} onChange={(v) => patchRep(name, { hanbai: { ...h, [item]: { ...h[item], yosanUriage: v } } })} width={64} /></td>
                        <td><NumberCell value={h[item].jissekiKensu} onChange={(v) => patchRep(name, { hanbai: { ...h, [item]: { ...h[item], jissekiKensu: v } } })} width={48} /></td>
                        <td><NumberCell value={h[item].jissekiUriage} onChange={(v) => patchRep(name, { hanbai: { ...h, [item]: { ...h[item], jissekiUriage: v } } })} width={64} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )
          })}
          <div className="srv-office-summary">
            <div className="srv-office-summary-title">営業所計（自動集計）</div>
            <table className="srv-mini-table">
              <thead><tr><th>項目</th><th>予算件数</th><th>予算売上</th><th>実績件数</th><th>実績売上</th></tr></thead>
              <tbody>
                {HANBAI_ITEMS.map((item) => (
                  <tr key={item}>
                    <td>{item}</td><td>{num(officeHanbai[item].yosanKensu)}</td><td>{yen(officeHanbai[item].yosanUriage)}</td>
                    <td>{num(officeHanbai[item].jissekiKensu)}</td><td>{yen(officeHanbai[item].jissekiUriage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ターゲット包括・居宅／目標系／総括・次月対策 は担当者別に入力（開いている担当者のみ表示） */}
      {openRep && reps.includes(openRep) && (
        <div className="srv-card">
          <b>{openRep} の詳細入力</b>
          <RepDetailForm officeName={officeName} monthKey={monthKey} repName={openRep} entry={monthData.reps[openRep]} onChange={(patch) => patchRep(openRep, patch)} />
        </div>
      )}
    </div>
  )
}

function RepDetailForm({ entry, onChange }) {
  const targets = entry.targets || {}
  const [newTarget, setNewTarget] = useState('')
  return (
    <div className="srv-detail-form">
      <div className="srv-detail-block">
        <div className="srv-detail-title">ターゲット包括・居宅（手入力）</div>
        <div className="srv-add-rep">
          <input value={newTarget} onChange={(e) => setNewTarget(e.target.value)} placeholder="施設名を追加" />
          <button onClick={() => { if (newTarget.trim()) { onChange({ targets: { ...targets, [newTarget.trim()]: emptyTarget() } }); setNewTarget('') } }}>＋追加</button>
        </div>
        <table className="srv-mini-table">
          <thead><tr><th>ターゲット包括・居宅</th><th>昨年度3月末 契約数</th><th>売上</th><th>今月末 契約数</th><th>売上</th><th></th></tr></thead>
          <tbody>
            {Object.entries(targets).map(([name, t]) => (
              <tr key={name}>
                <td>{name}</td>
                <td><NumberCell value={t.lastMar.count} onChange={(v) => onChange({ targets: { ...targets, [name]: { ...t, lastMar: { ...t.lastMar, count: v } } } })} width={50} /></td>
                <td><NumberCell value={t.lastMar.sales} onChange={(v) => onChange({ targets: { ...targets, [name]: { ...t, lastMar: { ...t.lastMar, sales: v } } } })} width={60} /></td>
                <td><NumberCell value={t.thisMonth.count} onChange={(v) => onChange({ targets: { ...targets, [name]: { ...t, thisMonth: { ...t.thisMonth, count: v } } } })} width={50} /></td>
                <td><NumberCell value={t.thisMonth.sales} onChange={(v) => onChange({ targets: { ...targets, [name]: { ...t, thisMonth: { ...t.thisMonth, sales: v } } } })} width={60} /></td>
                <td><button className="srv-rep-remove" onClick={() => { const n = { ...targets }; delete n[name]; onChange({ targets: n }) }}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="srv-detail-block srv-detail-3col">
        <div>
          <div className="srv-detail-title">●介護保険レンタル 新規獲得件数（実績・手入力）</div>
          <label>包括<NumberCell value={entry.kaigoRentalJisseki?.houkatsu} onChange={(v) => onChange({ kaigoRentalJisseki: { ...entry.kaigoRentalJisseki, houkatsu: v } })} width={50} /></label>
          <label>居宅<NumberCell value={entry.kaigoRentalJisseki?.kyotaku} onChange={(v) => onChange({ kaigoRentalJisseki: { ...entry.kaigoRentalJisseki, kyotaku: v } })} width={50} /></label>
        </div>
        <div>
          <div className="srv-detail-title">●特価ベッドレンタル 新規獲得件数（実績・手入力）</div>
          <label>包括<NumberCell value={entry.tokkaBedJisseki?.houkatsu} onChange={(v) => onChange({ tokkaBedJisseki: { ...entry.tokkaBedJisseki, houkatsu: v } })} width={50} /></label>
          <label>居宅<NumberCell value={entry.tokkaBedJisseki?.kyotaku} onChange={(v) => onChange({ tokkaBedJisseki: { ...entry.tokkaBedJisseki, kyotaku: v } })} width={50} /></label>
        </div>
        <div>
          <div className="srv-detail-title">●包括・居宅訪問件数（実績・手入力）</div>
          <label>包括<NumberCell value={entry.houmonJisseki?.houkatsu} onChange={(v) => onChange({ houmonJisseki: { ...entry.houmonJisseki, houkatsu: v } })} width={50} /></label>
          <label>居宅<NumberCell value={entry.houmonJisseki?.kyotaku} onChange={(v) => onChange({ houmonJisseki: { ...entry.houmonJisseki, kyotaku: v } })} width={50} /></label>
        </div>
      </div>

      <div className="srv-detail-block srv-detail-2col">
        <div>
          <div className="srv-detail-title">●総括</div>
          <textarea rows={4} value={entry.soukatsu} onChange={(e) => onChange({ soukatsu: e.target.value })} />
        </div>
        <div>
          <div className="srv-detail-title">●次月対策</div>
          <textarea rows={4} value={entry.jigetsuTaisaku} onChange={(e) => onChange({ jigetsuTaisaku: e.target.value })} />
        </div>
      </div>
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
          <td key={i}><NumberCell value={v} onChange={(val) => { const next = [...values]; next[i] = val; onChange(next) }} width={56} /></td>
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
          <table className="srv-table">
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
          <label>前年度消耗品売上実績（月平均）<NumberCell value={data.shouhinhinLastYearAvg} onChange={(v) => onChange({ shouhinhinLastYearAvg: v })} width={90} /></label>
          <label>本年度消耗品売上目標（月平均）<NumberCell value={data.shouhinhinTargetAvg} onChange={(v) => onChange({ shouhinhinTargetAvg: v })} width={90} /></label>
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
        <textarea rows={10} value={report.interviews.shimoki} onChange={(e) => patch({ shimoki: e.target.value })} />
      </div>
      <div className="srv-card">
        <div className="srv-detail-title">■上期面談記録</div>
        <textarea rows={10} value={report.interviews.kamiki} onChange={(e) => patch({ kamiki: e.target.value })} />
      </div>
    </div>
  )
}

/* ============================== 年間目標進捗（自動集計） ============================== */
function AnnualProgressTab({ officeName, report, fiscalYear }) {
  const upperMonths = ['04', '05', '06', '07', '08', '09']
  const lowerMonths = ['10', '11', '12', '01', '02', '03']

  const allEntries = useMemo(() => {
    const list = []
    for (const k of MONTH_KEYS) for (const name of report.repNames) list.push(report.months[k]?.reps?.[name])
    return list.filter(Boolean)
  }, [report])

  function sumOver(months, pick) {
    let total = 0
    for (const k of months) for (const name of report.repNames) {
      const e = report.months[k]?.reps?.[name]
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
      const targets = report.months[k]?.reps?.[name]?.targets || {}
      for (const [facName, t] of Object.entries(targets)) {
        if (!acc[facName]) acc[facName] = { lastMar: { count: 0, sales: 0 }, latest: { count: 0, sales: 0 } }
        acc[facName].latest = t.thisMonth
        if (k === '04') acc[facName].lastMar = t.lastMar
      }
    }
    return acc
  }, [report])

  const hanbaiAnnual = useMemo(() => {
    const acc = {}
    for (const item of HANBAI_ITEMS) acc[item] = { yosan: 0, jisseki: 0 }
    for (const k of MONTH_KEYS) for (const name of report.repNames) {
      const h = report.months[k]?.reps?.[name]?.hanbai
      if (!h) continue
      for (const item of HANBAI_ITEMS) { acc[item].yosan += h[item].yosanUriage || 0; acc[item].jisseki += h[item].jissekiUriage || 0 }
    }
    return acc
  }, [report])

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

export function SalesReportView({ officeName, fiscalYear }) {
  const [, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)
  const report = useMemo(() => getOfficeReport(officeName), [officeName, refresh])
  const [subTab, setSubTab] = useState('monthly')
  const [monthKey, setMonthKey] = useState('04')

  return (
    <div className="srv-root">
      <div className="srv-sub-tabs">
        {SUB_TABS.map(([key, label]) => (
          <button key={key} className={subTab === key ? 'active' : ''} onClick={() => setSubTab(key)}>{label}</button>
        ))}
      </div>
      {subTab === 'monthly' && <MonthlyReportTab officeName={officeName} report={report} monthKey={monthKey} setMonthKey={setMonthKey} fiscalYear={fiscalYear} refresh={refresh} />}
      {subTab === 'goals' && <GoalSettingTab officeName={officeName} report={report} refresh={refresh} />}
      {subTab === 'budget' && <BudgetTableTab officeName={officeName} report={report} refresh={refresh} />}
      {subTab === 'interview' && <InterviewTab officeName={officeName} report={report} refresh={refresh} />}
      {subTab === 'annual' && <AnnualProgressTab officeName={officeName} report={report} fiscalYear={fiscalYear} />}
    </div>
  )
}
