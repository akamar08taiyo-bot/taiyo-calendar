import React, { useMemo } from 'react'
import { Button, Icon } from './Icon'

const decimal = (value) => value == null ? '—' : Number(value).toFixed(1)
const percent = (value) => value == null ? '—' : `${decimal(value)}%`

function BarChart({ months }) {
  const max = Math.max(1, ...months.map((item) => item.visitTotal))
  return <div className="bar-chart" role="img" aria-label="4月から3月の月別訪問件数">
    {months.map((item) => <div className="bar-item" key={item.month}><span>{item.visitTotal}</span><div><i style={{ height: `${Math.max(3, item.visitTotal / max * 100)}%` }}/></div><small>{item.label}</small></div>)}
  </div>
}

function salesInsights(analytics) {
  const summary = analytics?.summary || {}
  const movement = analytics?.movement || {}
  const latest = movement.latestMonth
  const previous = movement.previousMonth
  // 今年度月平均は実績入力済み月数で割った値（summary.monthlyAverage）を使う。
  const yearAverage = summary.monthlyAverage
  const vsYearAverageText = (month) => {
    if (yearAverage == null || !month) return ''
    const diff = decimal(month.visitTotal - yearAverage)
    const sign = month.visitTotal - yearAverage > 0 ? '+' : ''
    return `／年度平均 ${decimal(yearAverage)}回に対して ${sign}${diff}回`
  }
  const momentum = !latest
    ? { tone: 'neutral', title: '直近の動き', value: '—', description: '対象年度の訪問記録がありません。', action: 'Excel取込月と対象年度を確認してください。' }
    : !previous
      ? { tone: 'neutral', title: '直近の動き', value: `${latest.visitTotal}回`, description: `${latest.label}が最初の記録月です。${vsYearAverageText(latest)}`, action: '2か月目以降に前月比を確認できます。' }
      : {
          tone: movement.change > 0 ? 'positive' : movement.change < 0 ? 'attention' : 'neutral',
          title: '直近月の前月差',
          value: `${movement.change > 0 ? '+' : ''}${movement.change}回`,
          description: `${previous.label} ${previous.visitTotal}回 → ${latest.label} ${latest.visitTotal}回${movement.changeRate == null ? '' : `（${movement.changeRate > 0 ? '+' : ''}${decimal(movement.changeRate)}%）`}${vsYearAverageText(latest)}`,
          action: movement.change < 0 ? '出勤日数と、訪問が減った取引先・営業員を確認してください。' : movement.change > 0 ? '増加が新規接点か既存先の頻度上昇か、ランキングで確認してください。' : '訪問量は横ばいです。訪問先の入れ替わりを確認してください。',
        }

  const concentration = summary.concentrationTopFive
  const concentrationInsight = concentration == null
    ? { tone: 'neutral', title: '訪問先の集中度', value: '—', description: '訪問記録がありません。', action: 'データ取込後に上位訪問先への集中度を表示します。' }
    : {
        tone: concentration >= 50 ? 'attention' : concentration >= 30 ? 'neutral' : 'positive',
        title: '上位5先への集中度',
        value: percent(concentration),
        description: '年度訪問件数に占める上位5訪問先の割合です。',
        action: concentration >= 50 ? '重点先への継続訪問を維持しつつ、6位以下への配分余地を確認してください。' : concentration >= 30 ? '重点先とその他訪問先の配分は中程度です。月別の偏りを確認してください。' : '訪問先は比較的分散しています。重点先への必要頻度が確保できているか確認してください。',
      }

  const perProvider = summary.uniqueProviderCount ? summary.visitTotal / summary.uniqueProviderCount : null
  const providerInsight = perProvider == null
    ? { tone: 'neutral', title: '1先あたり訪問数', value: '—', description: '対象年度の訪問記録がありません。', action: 'データ取込後に、訪問先ごとの配分を表示します。' }
    : { tone: 'neutral', title: '1先あたり訪問数', value: `${decimal(perProvider)}回`, description: '年度訪問件数を年度訪問先数で割った値です。', action: '訪問先別の今年度月平均と今月実績を確認し、訪問数の偏りを把握できます。' }

  const efficiency = summary.visitsPerAttendanceDay
  const efficiencyInsight = efficiency == null
    ? summary.attendanceDays > 0
      ? { tone: 'attention', title: '活動効率', value: '入力途中', description: `出勤日数入力済み ${summary.attendanceEnteredStaffCount ?? 0}／${summary.attendanceTargetStaffCount ?? 0}人のため、営業所平均はまだ算出しません。`, action: '対象営業員全員の出勤日数を入力すると、1日あたり訪問件数を比較できます。' }
      : { tone: 'neutral', title: '活動効率', value: '未入力', description: '出勤日数が未入力のため算出できません。', action: '営業員別に出勤日数を入力すると、1日あたり訪問件数を比較できます。' }
    : { tone: 'positive', title: '出勤日1日あたり', value: `${decimal(efficiency)}回`, description: `出勤日数 ${summary.attendanceDays}日を基準に算出しています。`, action: '営業員別集計で活動量の差を確認し、担当エリアや移動条件も合わせて判断してください。' }

  return [momentum, concentrationInsight, providerInsight, efficiencyInsight]
}

export function AnalysisView({ fiscalYear, setFiscalYear, analytics, loading, scopeLabel, staff, selectedStaffId, setSelectedStaffId, canSelectStaff, onBack, onPdf }) {
  const summary = analytics?.summary || {}
  const insights = useMemo(() => salesInsights(analytics), [analytics])
  const frequencyMax = Math.max(1, ...(analytics?.frequencyBands || []).map((item) => item.count))
  const printableStaff = staff.filter((person) => person.active && person.role === 'staff')
  const [comparisonYear, comparisonMonth] = (analytics?.comparisonMonth || '').split('-')
  const comparisonLabel = comparisonYear ? `${comparisonYear}年${Number(comparisonMonth)}月` : '今月'
  return <>
    <div className="page-header"><div><h1>実績分析</h1><p>訪問量・継続性・訪問配分を営業視点で確認</p></div><div className="page-header-actions"><Button icon="calendar" onClick={onBack}>カレンダーへ</Button><Button icon="pdf" onClick={onPdf}>対象月をPDF</Button></div></div>
    <section className="analysis-scope"><div className="analysis-year-switch"><button className="icon-button" aria-label="前年度" onClick={() => setFiscalYear(fiscalYear - 1)}><Icon name="left"/></button><strong>{fiscalYear}年度</strong><button className="icon-button" aria-label="次年度" onClick={() => setFiscalYear(fiscalYear + 1)}><Icon name="right"/></button><span>4月〜翌年3月</span></div><div className="analysis-scope-meta"><label><span>分析対象</span><span className="select-wrap"><select aria-label="分析対象の営業員" value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)} disabled={!canSelectStaff || loading}>{canSelectStaff && <option value="">営業所全体</option>}{printableStaff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><Icon name="down" size={15}/></span></label>{loading && <span className="status-line"><span className="spinner small"/>集計中…</span>}</div></section>

    <section className="kpi-grid sales-kpi-grid">
      <Kpi label="年度訪問件数" value={summary.visitTotal ?? 0} unit="回"/>
      <Kpi label="年度訪問先数" value={summary.uniqueProviderCount ?? 0} unit="件"/>
      <Kpi label="月平均（入力済み月数）" value={decimal(summary.monthlyAverage ?? 0)} unit="回"/>
      <Kpi label="出勤日1日あたり" value={summary.visitsPerAttendanceDay == null && summary.attendanceDays > 0 ? '入力途中' : decimal(summary.visitsPerAttendanceDay)} unit={summary.visitsPerAttendanceDay == null ? '' : '回'} accent/>
    </section>

    <section className="sales-summary-panel">
      <div className="panel-heading"><div><h2>営業視点サマリー</h2><span>訪問実績から確認できる変化・配分・継続性</span></div><span className="chart-unit">対象：{scopeLabel}</span></div>
      <div className="sales-insight-grid">{insights.map((item) => <article className={`sales-insight ${item.tone}`} key={item.title}><span>{item.title}</span><strong>{item.value}</strong><p>{item.description}</p><div><b>確認ポイント</b>{item.action}</div></article>)}</div>
    </section>

    <section className="analysis-grid">
      <div className="chart-panel"><div className="panel-heading"><div><h2>月別訪問件数</h2><span>年度順（4月から3月）・活動量の推移</span></div><span className="chart-unit">単位：回</span></div><BarChart months={analytics?.months || []}/></div>
      <div className="chart-panel"><div className="panel-heading"><div><h2>月別の訪問数</h2><span>訪問先数と1先あたりの訪問数</span></div><span className="chart-unit">平均は小数第1位</span></div><div className="monthly-density-list">{(analytics?.months || []).map((item) => <div key={item.month}><span>{item.label}</span><div><b>{item.visitedEntityCount}</b><small>訪問先</small></div><div><b>{decimal(item.averagePerProvider)}</b><small>回／先</small></div></div>)}</div></div>
    </section>

    <section className="analysis-detail-grid">
      <div className="chart-panel"><div className="panel-heading"><div><h2>訪問頻度の構成</h2><span>年度内の訪問回数別・ユニーク訪問先数</span></div></div><div className="frequency-list">{(analytics?.frequencyBands || []).map((item) => <div key={item.label}><span>{item.label}</span><div><i style={{ width: `${item.count / frequencyMax * 100}%` }}/></div><strong>{item.count}件</strong></div>)}</div></div>
      <div className="chart-panel peak-panel"><div className="panel-heading"><div><h2>活動のピーク</h2><span>年度内で訪問件数が最も多い月</span></div></div>{analytics?.movement?.topMonth ? <div className="peak-value"><span>{analytics.movement.topMonth.label}</span><strong>{analytics.movement.topMonth.visitTotal}<small>回</small></strong><p>訪問先 {analytics.movement.topMonth.visitedEntityCount}件・1先あたり {decimal(analytics.movement.topMonth.averagePerProvider)}回</p></div> : <div className="peak-value empty"><strong>—</strong><p>対象年度の記録がありません</p></div>}</div>
    </section>

    {selectedStaffId && analytics?.providerComparison?.length > 0 && <section className="staff-panel provider-comparison-panel"><div className="panel-heading"><div><h2>{comparisonLabel}の居宅別実績</h2><span>各居宅の今年度月平均に対して、今月の訪問数を比較</span></div><span className="chart-unit">対象：{scopeLabel}</span></div><div className="responsive-table"><table className="staff-table comparison-table"><thead><tr><th>居宅名</th><th>今年度訪問数</th><th>今年度月平均</th><th>今月</th><th>平均との差</th></tr></thead><tbody>{analytics.providerComparison.map((provider) => <tr key={provider.id}><th>{provider.name}</th><td>{provider.visitTotal}回</td><td>{decimal(provider.fiscalMonthlyAverage)}回</td><td><strong>{provider.comparisonVisitTotal}回</strong></td><td><Difference value={provider.comparisonDifference}/></td></tr>)}</tbody></table></div></section>}

    {analytics?.providerRanking?.length > 0 && <section className="staff-panel"><div className="panel-heading"><div><h2>訪問先別ランキング</h2><span>今年度の訪問数が多い先を確認</span></div><span className="chart-unit">上位10件</span></div><div className="responsive-table"><table className="staff-table ranking-table"><thead><tr><th>順位</th><th>訪問先</th><th>営業員</th><th>今年度訪問数</th><th>今年度月平均</th></tr></thead><tbody>{analytics.providerRanking.map((provider, index) => <tr key={provider.id}><td>{index + 1}</td><th>{provider.name}</th><td>{provider.staffName}</td><td>{provider.visitTotal}回</td><td>{decimal(provider.fiscalMonthlyAverage)}回</td></tr>)}</tbody></table></div></section>}

    {analytics?.staffBreakdown?.length > 0 && <section className="staff-panel"><div className="panel-heading"><div><h2>営業員別 活動比較</h2><span>訪問先数・訪問数・出勤日基準で比較</span></div></div><div className="responsive-table"><table className="staff-table"><thead><tr><th>営業員</th><th>訪問件数</th><th>訪問先数</th><th>構成比</th><th>月平均</th><th>出勤日数</th><th>1日平均</th></tr></thead><tbody>{analytics.staffBreakdown.map((person) => <tr key={person.id}><th>{person.name}</th><td>{person.visitTotal}回</td><td>{person.providerCount}件</td><td>{percent(person.share)}</td><td>{decimal(person.monthlyAverage)}回</td><td>{person.attendanceDays || '—'}</td><td>{person.visitsPerAttendanceDay == null ? '—' : `${decimal(person.visitsPerAttendanceDay)}回`}</td></tr>)}</tbody></table></div></section>}
    <div className="analysis-definition"><Icon name="info" size={16}/><span>営業視点サマリーは訪問記録から活動量・継続性・配分を整理したものです。訪問件数は売上・成約・関係性の質を直接示すものではないため、担当エリア、移動条件、案件状況と合わせて判断してください。すべての平均値は小数第1位まで表示します。</span></div>
  </>
}

function Kpi({ label, value, unit, accent }) {
  return <div className={`kpi-card ${accent ? 'accent' : ''}`}><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>
}

function Difference({ value }) {
  const tone = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'
  return <span className={`comparison-difference ${tone}`}>{value > 0 ? '+' : ''}{decimal(value)}回</span>
}
