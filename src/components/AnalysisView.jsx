import React from 'react'
import { Button, Icon } from './Icon'

const rate = (value) => value == null ? '—' : `${value}%`

function BarChart({ months }) {
  const max = Math.max(1, ...months.map((item) => item.visitTotal))
  return <div className="bar-chart" role="img" aria-label="4月から3月の月別訪問件数">
    {months.map((item) => <div className="bar-item" key={item.month}><span>{item.visitTotal}</span><div><i style={{ height: `${Math.max(3, item.visitTotal / max * 100)}%` }}/></div><small>{item.label}</small></div>)}
  </div>
}

export function AnalysisView({ fiscalYear, setFiscalYear, analytics, loading, scopeLabel, onBack, onPdf }) {
  const summary = analytics?.summary || {}
  return <>
    <div className="page-header"><div><h1>実績分析</h1><p>事実ベースの月別・年度別集計</p></div><div className="page-header-actions"><Button icon="calendar" onClick={onBack}>カレンダーへ</Button><Button icon="pdf" onClick={onPdf}>対象月をPDF</Button></div></div>
    <section className="analysis-scope"><div><button className="icon-button" aria-label="前年度" onClick={() => setFiscalYear(fiscalYear - 1)}><Icon name="left"/></button><strong>{fiscalYear}年度</strong><button className="icon-button" aria-label="次年度" onClick={() => setFiscalYear(fiscalYear + 1)}><Icon name="right"/></button><span>4月〜翌年3月</span></div><div className="analysis-scope-meta"><span>集計対象</span><strong>{scopeLabel}</strong>{loading && <span className="status-line"><span className="spinner small"/>集計中…</span>}</div></section>
    <section className="kpi-grid">
      <Kpi label="延べ訪問件数" value={summary.visitTotal ?? 0} unit="回"/>
      <Kpi label="訪問済み件数" value={summary.visitedEntityCount ?? 0} unit="件"/>
      <Kpi label="訪問率" value={rate(summary.visitRate)} accent/>
      <Kpi label="営業員1人あたり平均" value={summary.staffAverage ?? '—'} unit={summary.staffAverage == null ? '' : '回'}/>
      <Kpi label="月平均" value={summary.monthlyAverage ?? 0} unit="回"/>
    </section>
    <section className="analysis-grid">
      <div className="chart-panel"><div className="panel-heading"><div><h2>月別訪問件数</h2><span>年度順（4月から3月）</span></div><span className="chart-unit">単位：回</span></div><BarChart months={analytics?.months || []}/></div>
      <div className="chart-panel"><div className="panel-heading"><div><h2>月別訪問率</h2><span>分母0の月は—</span></div><span className="chart-unit">単位：%</span></div><div className="rate-list">{(analytics?.months || []).map((item) => <div key={item.month}><span>{item.label}</span><div><i style={{ width: `${Math.min(100, item.visitRate || 0)}%` }}/></div><strong>{rate(item.visitRate)}</strong></div>)}</div></div>
    </section>
    {analytics?.staffBreakdown?.length > 0 && <section className="staff-panel"><div className="panel-heading"><div><h2>営業員別集計</h2><span>営業所管理者向け</span></div></div><div className="responsive-table"><table className="staff-table"><thead><tr><th>営業員</th><th>延べ訪問件数</th><th>訪問済み件数</th><th>総居宅数</th><th>訪問率</th></tr></thead><tbody>{analytics.staffBreakdown.map((person) => <tr key={person.id}><th>{person.name}</th><td>{person.visit_total}</td><td>{person.visited_entity_count}</td><td>{person.total_homes}</td><td>{rate(person.visitRate)}</td></tr>)}</tbody></table></div></section>}
    <div className="analysis-definition"><Icon name="info" size={16}/><span>延べ訪問件数は期間内の訪問回数合計、訪問済み件数は1回以上訪問した事業者行のユニーク数です。改善提案や推測は表示しません。</span></div>
  </>
}

function Kpi({ label, value, unit, accent }) {
  return <div className={`kpi-card ${accent ? 'accent' : ''}`}><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>
}
