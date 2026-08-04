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

function StatCard({ label, value, unit, tone }) {
  return (
    <div className={`srv-stat ${tone || ''}`}>
      <span>{label}</span>
      <strong>{value}<em>{unit}</em></strong>
    </div>
  )
}

/* ---------- 営業所合計ビュー（読み取り専用・自動集計） ---------- */
function OfficeSummaryView({ report, monthKey }) {
  const monthData = report.months[monthKey] || { reps: {} }
  const reps = report.repNames

  const officeVisit = useMemo(() => sumVisits(reps.map((n) => monthData.reps[n]?.visit || emptyVisit())), [reps, monthData])
  const officeSales = useMemo(() => sumSalesFigures(reps.map((n) => monthData.reps[n]?.sales || emptySalesFigures())), [reps, monthData])
  const officeHanbai = useMemo(() => sumHanbaiUchiwake(reps.map((n) => monthData.reps[n]?.hanbai || emptyHanbaiUchiwake())), [reps, monthData])
  const cumAll = useMemo(() => cumulativeSalesThrough(report, monthKey), [report, monthKey])
  const officeCum = useMemo(() => sumSalesFigures(reps.map((n) => cumAll[n])), [reps, cumAll])

  const hanbaiYosanKei = officeSales.hanbaiYosan + officeSales.kaishuuYosan
  const hanbaiUriageKei = officeSales.hanbaiUriage + officeSales.kaishuuUriage

  const kaigoKei = reps.reduce((s, n) => s + (monthData.reps[n]?.kaigoRentalJisseki?.houkatsu || 0) + (monthData.reps[n]?.kaigoRentalJisseki?.kyotaku || 0), 0)
  const tokkaKei = reps.reduce((s, n) => s + (monthData.reps[n]?.tokkaBedJisseki?.houkatsu || 0) + (monthData.reps[n]?.tokkaBedJisseki?.kyotaku || 0), 0)
  const houmonHou = reps.reduce((s, n) => s + (monthData.reps[n]?.houmonJisseki?.houkatsu || 0), 0)
  const houmonKyo = reps.reduce((s, n) => s + (monthData.reps[n]?.houmonJisseki?.kyotaku || 0), 0)

  return (
    <div className="srv-panel">
      <div className="srv-stat-row">
        <StatCard label="訪問合計" value={num(visitTotal(officeVisit))} unit="件" tone="accent" />
        <StatCard label="販売合計（売上）" value={yen(hanbaiUriageKei)} unit="千円" />
        <StatCard label="販売予算" value={yen(hanbaiYosanKei)} unit="千円" />
        <StatCard label="予算差" value={yen(hanbaiUriageKei - hanbaiYosanKei)} unit="千円" tone={hanbaiUriageKei - hanbaiYosanKei >= 0 ? 'plus' : 'minus'} />
        <StatCard label="当月回収" value={yen(officeSales.touGetsuKaishu)} unit="千円" />
        <StatCard label="レンタル実績（累計）" value={yen(officeCum.rentalJissekiAtsumu)} unit="千円" />
      </div>

      <div className="srv-card">
        <b>訪問実績（担当者別・営業所計）</b>
        <div className="srv-table-scroll">
          <table className="srv-table srv-table-lg">
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
                    <th className="srv-sticky">{name}</th>
                    {VISIT_FIELDS.map(([k]) => <td key={k}>{num(v[k])}</td>)}
                    <td className="srv-calc">{num(visitTotal(v))}</td>
                  </tr>
                )
              })}
              {reps.length === 0 && <tr><td colSpan={VISIT_FIELDS.length + 2} className="srv-empty">担当者が登録されていません</td></tr>}
              <tr className="srv-total-row">
                <th className="srv-sticky">営業所計</th>
                {VISIT_FIELDS.map(([k]) => <td key={k}>{num(officeVisit[k])}</td>)}
                <td className="srv-calc">{num(visitTotal(officeVisit))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="srv-grid-2">
        <div className="srv-card">
          <b>月間売上・累計（営業所計・千円）</b>
          <table className="srv-mini-table srv-mini-lg">
            <tbody>
              <tr><td>レンタル納品合計</td><td>{yen(officeSales.rentalNouhinKeikei)}</td></tr>
              <tr><td>前月回収</td><td>{yen(officeSales.zenGetsuKaishu)}</td></tr>
              <tr><td>目標値</td><td>{yen(officeSales.mokuhyou)}</td></tr>
              <tr><td>目標差</td><td className={officeSales.rentalNouhinKeikei - officeSales.mokuhyou >= 0 ? 'srv-plus' : 'srv-minus'}>{yen(officeSales.rentalNouhinKeikei - officeSales.mokuhyou)}</td></tr>
              <tr><td>当月回収</td><td>{yen(officeSales.touGetsuKaishu)}</td></tr>
              <tr><td>商品販売 予算 / 売上</td><td>{yen(officeSales.hanbaiYosan)} / {yen(officeSales.hanbaiUriage)}</td></tr>
              <tr><td>住宅改修 予算 / 売上</td><td>{yen(officeSales.kaishuuYosan)} / {yen(officeSales.kaishuuUriage)}</td></tr>
              <tr className="srv-row-strong"><td>販売合計（予算 / 売上）</td><td>{yen(hanbaiYosanKei)} / {yen(hanbaiUriageKei)}</td></tr>
              <tr><td>レンタル予算（累計）</td><td>{yen(officeCum.rentalYosanAtsumu)}</td></tr>
              <tr><td>レンタル実績（累計）</td><td>{yen(officeCum.rentalJissekiAtsumu)}</td></tr>
            </tbody>
          </table>
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
function RepEditView({ repName, entry, onChange, goals }) {
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
      <div className="srv-stat-row">
        <StatCard label="訪問合計" value={num(visitTotal(visit))} unit="件" tone="accent" />
        <StatCard label="販売実績計" value={yen(hanbaiKei.jisseki)} unit="千円" />
        <StatCard label="販売予算計" value={yen(hanbaiKei.yosan)} unit="千円" />
        <StatCard label="予算差" value={yen(hanbaiKei.jisseki - hanbaiKei.yosan)} unit="千円" tone={hanbaiKei.jisseki - hanbaiKei.yosan >= 0 ? 'plus' : 'minus'} />
      </div>

      <div className="srv-card">
        <b>訪問実績</b>
        {VISIT_GROUPS.map(([groupName, fields]) => (
          <div key={groupName} className="srv-group">
            <div className="srv-group-title">{groupName}</div>
            <div className="srv-big-grid">
              {fields.map(([k, label]) => <BigField key={k} label={label} value={visit[k]} onChange={(v) => setVisit(k, v)} />)}
            </div>
          </div>
        ))}
      </div>

      <div className="srv-card">
        <b>月間売上・累計（千円）</b>
        <div className="srv-group">
          <div className="srv-group-title">月間売上（売上状況報告書）</div>
          <div className="srv-big-grid">
            <BigField label="レンタル納品合計" value={sales.rentalNouhinKeikei} onChange={(v) => setSales('rentalNouhinKeikei', v)} suffix="千円" />
            <BigField label="前月回収" value={sales.zenGetsuKaishu} onChange={(v) => setSales('zenGetsuKaishu', v)} suffix="千円" />
            <BigField label="目標値" value={sales.mokuhyou} onChange={(v) => setSales('mokuhyou', v)} suffix="千円" />
            <BigField label="当月回収" value={sales.touGetsuKaishu} onChange={(v) => setSales('touGetsuKaishu', v)} suffix="千円" />
            <BigField label="商品販売 予算" value={sales.hanbaiYosan} onChange={(v) => setSales('hanbaiYosan', v)} suffix="千円" />
            <BigField label="商品販売 売上" value={sales.hanbaiUriage} onChange={(v) => setSales('hanbaiUriage', v)} suffix="千円" />
            <BigField label="住宅改修 予算" value={sales.kaishuuYosan} onChange={(v) => setSales('kaishuuYosan', v)} suffix="千円" />
            <BigField label="住宅改修 売上" value={sales.kaishuuUriage} onChange={(v) => setSales('kaishuuUriage', v)} suffix="千円" />
          </div>
          <div className="srv-inline-calc">
            目標差 <b className={sales.rentalNouhinKeikei - sales.mokuhyou >= 0 ? 'srv-plus' : 'srv-minus'}>{yen(sales.rentalNouhinKeikei - sales.mokuhyou)}</b>
            ／ 販売合計 <b>{yen(sales.hanbaiUriage + sales.kaishuuUriage)}</b>
            ／ 予算差 <b className={(sales.hanbaiUriage + sales.kaishuuUriage) - (sales.hanbaiYosan + sales.kaishuuYosan) >= 0 ? 'srv-plus' : 'srv-minus'}>{yen((sales.hanbaiUriage + sales.kaishuuUriage) - (sales.hanbaiYosan + sales.kaishuuYosan))}</b>
          </div>
        </div>
        <div className="srv-group">
          <div className="srv-group-title">累計売上（売上推移）</div>
          <div className="srv-big-grid">
            <BigField label="レンタル予算（累計）" value={sales.rentalYosanAtsumu} onChange={(v) => setSales('rentalYosanAtsumu', v)} suffix="千円" />
            <BigField label="レンタル実績（累計）" value={sales.rentalJissekiAtsumu} onChange={(v) => setSales('rentalJissekiAtsumu', v)} suffix="千円" />
          </div>
          <div className="srv-inline-calc">
            予算差 <b className={sales.rentalJissekiAtsumu - sales.rentalYosanAtsumu >= 0 ? 'srv-plus' : 'srv-minus'}>{yen(sales.rentalJissekiAtsumu - sales.rentalYosanAtsumu)}</b>
          </div>
        </div>
      </div>

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
  )
}

function MonthlyReportTab({ officeName, report, monthKey, setMonthKey, fiscalYear, refresh }) {
  const [activeRep, setActiveRep] = useState('__office__')
  const [newRepName, setNewRepName] = useState('')
  const monthData = report.months[monthKey] || { reps: {} }
  const reps = report.repNames
  const calendarYear = fiscalCalendarYear(fiscalYear, monthKey)

  function patchRep(repName, patch) {
    updateRepEntry(officeName, monthKey, repName, patch)
    refresh()
  }

  const currentEntry = activeRep !== '__office__' ? (monthData.reps[activeRep] || null) : null

  return (
    <div className="srv-panel">
      <div className="srv-month-switch">
        {MONTH_KEYS.map((k) => (
          <button key={k} className={k === monthKey ? 'active' : ''} onClick={() => setMonthKey(k)}>{MONTH_LABELS[k]}</button>
        ))}
      </div>
      <div className="srv-month-title">{calendarYear}年{MONTH_LABELS[monthKey]}　【{officeName}】</div>

      <div className="srv-rep-tabs">
        <button className={activeRep === '__office__' ? 'active office' : 'office'} onClick={() => setActiveRep('__office__')}>営業所合計</button>
        {reps.map((name) => (
          <button key={name} className={activeRep === name ? 'active' : ''} onClick={() => setActiveRep(name)}>{name}</button>
        ))}
        <div className="srv-add-rep srv-add-rep-inline">
          <input value={newRepName} onChange={(e) => setNewRepName(e.target.value)} placeholder="担当者を追加" />
          <button onClick={() => { const n = newRepName.trim(); if (n) { addRep(officeName, n); setNewRepName(''); refresh(); setActiveRep(n) } }}>＋</button>
        </div>
      </div>

      {activeRep === '__office__' ? (
        <OfficeSummaryView report={report} monthKey={monthKey} />
      ) : currentEntry ? (
        <>
          <div className="srv-rep-head">
            <span>{activeRep} の入力</span>
            <button className="srv-rep-delete-btn" onClick={() => { if (window.confirm(activeRep + 'を削除しますか？（全ての月の入力データも消えます）')) { removeRep(officeName, activeRep); setActiveRep('__office__'); refresh() } }}>この担当者を削除</button>
          </div>
          <RepEditView repName={activeRep} entry={currentEntry} onChange={(patch) => patchRep(activeRep, patch)} goals={report.goals} />
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
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)
  const report = useMemo(() => getOfficeReport(officeName), [officeName, tick])
  const [subTab, setSubTab] = useState('monthly')
  const [monthKey, setMonthKey] = useState('04')

  return (
    <div className="srv-root">
      <div className="page-header">
        <div><h1>営業月報</h1><p>担当者ごとに入力すると、営業所全体の数字が自動で集計されます</p></div>
      </div>
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
