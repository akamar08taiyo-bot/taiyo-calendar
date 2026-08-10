import React, { useMemo } from 'react'
import { Button, Icon } from './Icon'
import { getOfficeProviderSales, findProviderSales } from '../providerSalesData'

const decimal = (value) => value == null ? '—' : Number(value).toFixed(1)
const percent = (value) => value == null ? '—' : `${decimal(value)}%`
const yen = (value) => `${Math.round(Number(value) || 0).toLocaleString('ja-JP')}円`

// 比較月の1か月前（年またぎ対応）の 'YYYY-MM' キーを返す。
function previousMonthKey(monthKey) {
  if (!monthKey) return null
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// 居宅ごとに「訪問件数の増減」と「売上の増減」を突き合わせる。
// 訪問と売上が逆方向に動いている居宅（訪問が減っているのに売上は増えている等）を
// divergent（要確認）としてマークし、営業視点で深堀りすべき先を絞り込めるようにする。
function buildProviderSalesRows(analytics, officeName) {
  const comparisonMonth = analytics?.comparisonMonth
  if (!comparisonMonth) return { rows: [], comparisonMonth: null, prevMonth: null }
  const prevMonth = previousMonthKey(comparisonMonth)
  const officeSales = getOfficeProviderSales(officeName)
  const rows = (analytics.providerComparison || []).map((provider) => {
    const visitCur = provider.monthlyVisits.get(comparisonMonth) || 0
    const visitPrev = provider.monthlyVisits.get(prevMonth) || 0
    const visitDiff = visitCur - visitPrev
    const sales = findProviderSales(officeSales, provider.name)
    if (!sales) return { provider, hasSales: false, visitCur, visitPrev, visitDiff }
    const salesCur = sales.monthlySales[comparisonMonth] || 0
    const salesPrev = sales.monthlySales[prevMonth] || 0
    const salesDiff = salesCur - salesPrev
    const salesDiffRate = salesPrev ? Math.round((salesDiff / salesPrev) * 1000) / 10 : null
    const perVisit = visitCur ? Math.round(salesCur / visitCur) : null
    const divergent = (visitDiff > 0 && salesDiff < 0) || (visitDiff < 0 && salesDiff > 0)
    return { provider, hasSales: true, visitCur, visitPrev, visitDiff, salesCur, salesPrev, salesDiff, salesDiffRate, perVisit, divergent }
  })
  rows.sort((a, b) => {
    if (a.divergent !== b.divergent) return a.divergent ? -1 : 1
    if (a.hasSales !== b.hasSales) return a.hasSales ? -1 : 1
    return Math.abs(b.salesDiff || 0) - Math.abs(a.salesDiff || 0)
  })
  return { rows, comparisonMonth, prevMonth }
}

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

export function AnalysisView({ fiscalYear, setFiscalYear, analytics, loading, scopeLabel, staff, selectedStaffId, setSelectedStaffId, canSelectStaff, officeName, onBack, onPdf }) {
  const summary = analytics?.summary || {}
  const insights = useMemo(() => salesInsights(analytics), [analytics])
  const frequencyMax = Math.max(1, ...(analytics?.frequencyBands || []).map((item) => item.count))
  const printableStaff = staff.filter((person) => person.active && person.role === 'staff')
  const [comparisonYear, comparisonMonth] = (analytics?.comparisonMonth || '').split('-')
  const comparisonLabel = comparisonYear ? `${comparisonYear}年${Number(comparisonMonth)}月` : '今月'
  const providerSales = useMemo(() => buildProviderSalesRows(analytics, officeName), [analytics, officeName])
  const prevMonthLabel = providerSales.prevMonth ? `${Number(providerSales.prevMonth.split('-')[1])}月` : '前月'
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

    {analytics?.kindSummary?.some((item) => item.providerCount > 0) && (
      <section className="staff-panel"><div className="panel-heading"><div><h2>包括・居宅別の集計</h2><span>地域包括支援センターと居宅介護支援事業所を分けて確認</span></div><span className="chart-unit">対象：{scopeLabel}</span></div>
        <div className="responsive-table"><table className="staff-table"><thead><tr><th>種別</th><th>訪問先数</th><th>今年度訪問数</th><th>月平均</th><th>{comparisonLabel}</th><th>平均より増</th><th>平均より減</th></tr></thead><tbody>
          {analytics.kindSummary.map((item) => <tr key={item.kind}><th>{item.label}</th><td>{item.providerCount}件</td><td>{item.visitTotal}回</td><td>{decimal(item.monthlyAverage)}回</td><td><strong>{item.comparisonVisitTotal}回</strong></td><td className="kind-up">{item.increasedCount}件</td><td className="kind-down">{item.decreasedCount}件</td></tr>)}
        </tbody></table></div>
      </section>
    )}

    {analytics?.kindMonthly?.some((item) => item.total > 0) && (
      <section className="staff-panel"><div className="panel-heading"><div><h2>包括・居宅の月別訪問</h2><span>月ごとの訪問件数と、包括が占める割合の推移</span></div><span className="chart-unit">単位：回</span></div>
        <div className="kind-monthly-list">
          {analytics.kindMonthly.map((item) => (
            <div key={item.month} className={item.total === 0 ? 'kind-monthly-row is-empty' : 'kind-monthly-row'}>
              <span className="kind-monthly-label">{item.label}</span>
              <div className="kind-monthly-bar" role="img" aria-label={`${item.label} 包括${item.houkatsu}回・居宅${item.kyotaku}回`}>
                {item.total > 0 && <>
                  <i className="kind-bar-houkatsu" style={{ width: `${item.houkatsu / item.total * 100}%` }}/>
                  <i className="kind-bar-kyotaku" style={{ width: `${item.kyotaku / item.total * 100}%` }}/>
                </>}
              </div>
              <span className="kind-monthly-value kind-tag-houkatsu-text">包括 {item.houkatsu}</span>
              <span className="kind-monthly-value kind-tag-kyotaku-text">居宅 {item.kyotaku}</span>
              <span className="kind-monthly-share">{item.houkatsuShare == null ? '—' : `包括 ${decimal(item.houkatsuShare)}%`}</span>
            </div>
          ))}
        </div>
      </section>
    )}

    {analytics?.providerComparison?.length > 0 && (
      <section className="staff-panel provider-comparison-panel">
        <div className="panel-heading"><div><h2>{comparisonLabel}の訪問先別 増減</h2><span>今年度の月平均に対して、増えている訪問先・減っている訪問先を確認</span></div><span className="chart-unit">対象：{scopeLabel}</span></div>
        <div className="comparison-legend">
          <span className="kind-up">増加 {analytics.providerComparison.filter((item) => item.comparisonDifference > 0).length}件</span>
          <span className="kind-down">減少 {analytics.providerComparison.filter((item) => item.comparisonDifference < 0).length}件</span>
          <span className="kind-flat">増減なし {analytics.providerComparison.filter((item) => item.comparisonDifference === 0).length}件</span>
        </div>
        <div className="responsive-table"><table className="staff-table comparison-table"><thead><tr><th>訪問先</th><th>種別</th><th>今年度訪問数</th><th>今年度月平均</th><th>{comparisonLabel}</th><th>平均との差</th></tr></thead><tbody>
          {analytics.providerComparison.map((provider) => <tr key={provider.id}>
            <th>{provider.name}</th>
            <td><span className={`kind-tag kind-tag-${provider.kind}`}>{provider.kind === 'houkatsu' ? '包括' : '居宅'}</span></td>
            <td>{provider.visitTotal}回</td>
            <td>{decimal(provider.fiscalMonthlyAverage)}回</td>
            <td><strong>{provider.comparisonVisitTotal}回</strong></td>
            <td><Difference value={provider.comparisonDifference}/></td>
          </tr>)}
        </tbody></table></div>
      </section>
    )}

    <ProviderSalesTrendPanel providerSales={providerSales} comparisonLabel={comparisonLabel} prevMonthLabel={prevMonthLabel} scopeLabel={scopeLabel}/>

    {analytics?.providerRanking?.length > 0 &&<section className="staff-panel"><div className="panel-heading"><div><h2>訪問先別ランキング</h2><span>今年度の訪問数が多い先を確認</span></div><span className="chart-unit">上位10件</span></div><div className="responsive-table"><table className="staff-table ranking-table"><thead><tr><th>順位</th><th>訪問先</th><th>営業員</th><th>今年度訪問数</th><th>今年度月平均</th></tr></thead><tbody>{analytics.providerRanking.map((provider, index) => <tr key={provider.id}><td>{index + 1}</td><th>{provider.name}</th><td>{provider.staffName}</td><td>{provider.visitTotal}回</td><td>{decimal(provider.fiscalMonthlyAverage)}回</td></tr>)}</tbody></table></div></section>}

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

function YenDiff({ value }) {
  const tone = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'
  return <span className={`comparison-difference ${tone}`}>{value > 0 ? '+' : ''}{yen(value)}</span>
}

// 「居宅別売上推移表」（Excel取込）を、居宅カレンダーの実訪問データと居宅名で突き合わせて、
// 訪問件数の増減と売上の増減が逆方向に動いている居宅（要確認先）を優先的に見せるパネル。
function ProviderSalesTrendPanel({ providerSales, comparisonLabel, prevMonthLabel, scopeLabel }) {
  const { rows } = providerSales
  if (!rows.length) return null
  const withSales = rows.filter((row) => row.hasSales)
  const divergentCount = withSales.filter((row) => row.divergent).length
  const totalSalesDiff = withSales.reduce((sum, row) => sum + (row.salesDiff || 0), 0)

  return (
    <section className="staff-panel provider-sales-panel">
      <div className="panel-heading">
        <div><h2>居宅別 訪問件数×売上 推移比較</h2><span>「居宅別売上推移表」を取り込むと、訪問件数と売上の動きが逆になっている居宅を確認できます</span></div>
        <span className="chart-unit">対象：{scopeLabel}</span>
      </div>
      {withSales.length === 0 ? (
        <div className="provider-sales-empty">
          <Icon name="info" size={16}/>
          <span>売上データが取り込まれていません。居宅カレンダーの「Excelを取り込む」から「居宅別売上推移表」を選択すると、ここに反映されます。</span>
        </div>
      ) : (
        <>
          <div className="comparison-legend">
            <span className="kind-attention">要確認（訪問と売上が逆方向） {divergentCount}件</span>
            <span>売上データあり {withSales.length}件</span>
            <span className={totalSalesDiff >= 0 ? 'kind-up' : 'kind-down'}>{comparisonLabel}の売上合計差 {totalSalesDiff >= 0 ? '+' : ''}{yen(totalSalesDiff)}</span>
          </div>
          <div className="responsive-table"><table className="staff-table comparison-table"><thead><tr>
            <th>居宅</th><th>種別</th>
            <th>{prevMonthLabel}訪問</th><th>{comparisonLabel}訪問</th>
            <th>{prevMonthLabel}売上</th><th>{comparisonLabel}売上</th><th>売上差</th>
            <th>訪問1件あたり売上</th><th>状態</th>
          </tr></thead><tbody>
            {rows.map(({ provider, hasSales, visitCur, visitPrev, visitDiff, salesCur, salesPrev, salesDiff, perVisit, divergent }) => (
              <tr key={provider.id} className={divergent ? 'is-divergent' : ''}>
                <th>{provider.name}</th>
                <td><span className={`kind-tag kind-tag-${provider.kind}`}>{provider.kind === 'houkatsu' ? '包括' : '居宅'}</span></td>
                <td>{visitPrev}回</td>
                <td><strong>{visitCur}回</strong><Difference value={visitDiff}/></td>
                {hasSales ? (
                  <>
                    <td>{yen(salesPrev)}</td>
                    <td><strong>{yen(salesCur)}</strong></td>
                    <td><YenDiff value={salesDiff}/></td>
                    <td>{perVisit == null ? '—' : yen(perVisit)}</td>
                    <td>{divergent ? <span className="provider-sales-flag">要確認</span> : <span className="provider-sales-flag ok">—</span>}</td>
                  </>
                ) : (
                  <><td colSpan={4} className="provider-sales-nodata">売上データなし</td><td>—</td></>
                )}
              </tr>
            ))}
          </tbody></table></div>
        </>
      )}
    </section>
  )
}
