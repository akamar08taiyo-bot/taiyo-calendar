import React, { useMemo, useState } from 'react'
import { Button, Icon } from './Icon'

const weekdays = ['日', '月', '火', '水', '木', '金', '土']

function daysFor(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const count = new Date(year, monthNumber, 0).getDate()
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1
    const weekday = new Date(year, monthNumber - 1, day).getDay()
    return { day, weekday, label: weekdays[weekday] }
  })
}

const valueLabel = (count) => count === 0 ? '' : count === 1 ? '✓' : String(count)
export function CalendarView({ month, calendar, officeName, scopeLabel, staff, selectedStaffId, setSelectedStaffId, canSelectStaff, loading, savingKey, onChangeMonth, onUpdateVisit, onEditTotal, onHide, onOpenHidden, onOpenImport, onOpenPdf, onOpenAnalysis, canImport }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const days = useMemo(() => daysFor(month), [month])
  const providers = useMemo(() => (calendar?.providers || []).filter((provider) => `${provider.name}${provider.staffName}${provider.externalCode}`.toLowerCase().includes(search.trim().toLowerCase())), [calendar, search])
  const [year, monthNumber] = month.split('-').map(Number)
  const fiscalYear = monthNumber >= 4 ? year : year - 1
  const selectedProvider = selected && calendar?.providers.find((provider) => provider.id === selected.providerId)
  const selectedVisit = selectedProvider?.visits?.[String(selected?.day)] || { count: 0, version: 0 }

  function choose(provider, day, delta = 1) {
    const visit = provider.visits[String(day)] || { count: 0, version: 0 }
    setSelected({ providerId: provider.id, day })
    onUpdateVisit(provider, day, Math.max(0, Math.min(99, visit.count + delta)), visit.version)
  }

  const dayTotals = days.map(({ day }) => providers.reduce((sum, provider) => sum + (provider.visits[String(day)]?.count || 0), 0))
  const visibleSummary = useMemo(() => {
    const totalHomes = providers.reduce((sum, provider) => sum + provider.totalHomes, 0)
    const visitTotal = providers.reduce((sum, provider) => sum + provider.visitTotal, 0)
    const visitedEntityCount = providers.reduce((sum, provider) => sum + provider.visitedEntityCount, 0)
    return {
      totalHomes,
      visitTotal,
      unvisitedEntityCount: Math.max(0, totalHomes - visitedEntityCount),
      averageVisits: totalHomes === 0 ? null : Math.round(visitTotal / totalHomes * 10) / 10,
    }
  }, [providers])
  return <>
    <div className="page-header">
      <div><h1>居宅カレンダー</h1><p>{fiscalYear}年度・{year}年{monthNumber}月</p></div>
      <div className="page-header-actions">
        {canImport && <Button icon="upload" variant="primary" onClick={onOpenImport}>Excelを取り込む</Button>}
        <Button icon="pdf" onClick={onOpenPdf}>この月をPDF</Button>
        <Button icon="chart" onClick={onOpenAnalysis}>分析を見る</Button>
      </div>
    </div>

    <section className="control-panel">
      <div className="control-left">
        <label className="field-group">営業員
          <span className="select-wrap"><select value={selectedStaffId || ''} onChange={(event) => setSelectedStaffId(event.target.value)} disabled={!canSelectStaff}>
            {canSelectStaff && <option value="">営業所集計（営業員名を含む）</option>}
            {staff.filter((person) => person.active && person.role === 'staff').map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select><Icon name="down" size={15}/></span>
        </label>
        <label className="field-group search-field">事業者を検索
          <span className="search-wrap"><Icon name="search" size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="事業者名・営業員名・コード"/></span>
        </label>
      </div>
      <div className="control-right">
        <Button icon="eyeOff" onClick={onOpenHidden}>非表示・復元</Button>
        <div className="month-switcher"><button className="icon-button" aria-label="前の月" onClick={() => onChangeMonth(-1)}><Icon name="left"/></button><strong>{year}年{monthNumber}月</strong><button className="icon-button" aria-label="次の月" onClick={() => onChangeMonth(1)}><Icon name="right"/></button></div>
      </div>
    </section>

    <div className="scope-banner"><span><Icon name="lock" size={16}/>表示・編集範囲はAPIで権限確認されています</span><span>表示中 <strong>{providers.length}</strong> 事業者</span></div>

    <section className="table-card calendar-sheet" aria-busy={loading}>
      <div className="calendar-sheet-head">
        <div className="sheet-identity"><h2>{year}年{monthNumber}月　居宅カレンダー</h2><div><strong>{officeName}</strong><strong>営業員：{scopeLabel}</strong></div></div>
        <section className="calendar-summary" aria-label="居宅訪問数 月間集約">
          <h3>居宅訪問数　月間集約</h3>
          <CalendarMetric label="担当居宅数" value={visibleSummary.totalHomes}/>
          <CalendarMetric label="訪問0居宅数" value={visibleSummary.unvisitedEntityCount}/>
          <CalendarMetric label="訪問件数" value={visibleSummary.visitTotal}/>
          <CalendarMetric label="平均訪問件数" value={visibleSummary.averageVisits ?? '—'} decimal/>
        </section>
      </div>
      <div className="table-scroll">
        <table className="visit-table">
          <thead><tr>
            <th className="index-col sticky-left">No.</th><th className="provider-col sticky-left">居宅名</th><th className="staff-col sticky-left">営業員</th><th className="homes-col sticky-left">総居宅数</th>
            {days.map(({ day, weekday, label }) => <th key={day} className={`date-col ${weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : ''}`}><span>{day}</span><small>{label}</small></th>)}
            <th className="summary-col summary-count">月間<br/>訪問回数</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={days.length + 5} className="empty-row"><div className="empty-state"><span className="spinner"/><strong>カレンダーを読み込み中…</strong></div></td></tr>}
            {!loading && !providers.length && <tr><td colSpan={days.length + 5} className="empty-row"><div className="empty-state"><Icon name="search" size={25}/><strong>対象の事業者がありません</strong><span>検索条件または営業員を確認してください。</span></div></td></tr>}
            {!loading && providers.map((provider, providerIndex) => <tr key={provider.id}>
              <th className="index-col row-index sticky-left">{providerIndex + 1}</th>
              <th className="provider-col provider-name sticky-left"><span title={provider.name}>{provider.name}</span><small>{provider.externalCode}</small><div className="row-actions"><button onClick={() => onEditTotal(provider)}>総居宅数を変更</button><button onClick={() => onHide(provider)}>非表示</button></div></th>
              <td className="staff-col sticky-left">{provider.staffName}</td><td className="homes-col homes-number sticky-left">{provider.totalHomes}</td>
              {days.map(({ day, weekday }) => {
                const visit = provider.visits[String(day)] || { count: 0, version: 0 }
                const key = `${provider.id}-${day}`
                return <td key={day} className={`visit-cell ${weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : ''} ${selected?.providerId === provider.id && selected.day === day ? 'is-selected' : ''}`}>
                  <button className={`visit-button visit-${Math.min(visit.count, 4)}`} disabled={savingKey === key} aria-label={`${provider.name} ${day}日 ${visit.count}回。クリックで1回増加`} onClick={() => choose(provider, day, 1)} onContextMenu={(event) => { event.preventDefault(); choose(provider, day, -1) }}>{savingKey === key ? <span className="spinner small"/> : valueLabel(visit.count)}</button>
                </td>
              })}
              <td className="summary-col summary-count">{provider.visitTotal}</td>
            </tr>)}
          </tbody>
          {!loading && providers.length > 0 && <tfoot><tr>
            <th className="index-col aggregate-index sticky-left">計</th><th className="provider-col aggregate-label sticky-left">表示中の合計</th><td className="staff-col sticky-left">—</td><td className="homes-col aggregate-value sticky-left">{providers.reduce((sum, provider) => sum + provider.totalHomes, 0)}</td>
            {dayTotals.map((total, index) => <td className="aggregate-day" key={index}>{total || ''}</td>)}
            <td className="summary-col summary-count">{providers.reduce((sum, provider) => sum + provider.visitTotal, 0)}</td>
          </tr></tfoot>}
        </table>
      </div>
    </section>

    {selectedProvider && <div className="cell-editor" role="region" aria-label="選択セルの編集"><div><strong>{selectedProvider.name}</strong><span>{month.replace('-', '年')}月{selected.day}日・{selectedVisit.count}回</span></div><button disabled={selectedVisit.count === 0 || savingKey} onClick={() => choose(selectedProvider, selected.day, -1)}><Icon name="minus"/>1回戻す</button><button disabled={selectedVisit.count === 0 || savingKey} onClick={() => onUpdateVisit(selectedProvider, selected.day, 0, selectedVisit.version)}><Icon name="reset"/>0に戻す</button></div>}
    <div className="calendar-footnote"><div className="legend"><span><i/>未訪問</span><span><i className="checked">✓</i>1回</span><span><i className="checked">2</i>複数回</span></div></div>
  </>
}

function CalendarMetric({ label, value, decimal = false }) {
  return <div className="calendar-metric"><span>{label}</span><strong>{decimal && typeof value === 'number' ? value.toFixed(1) : value}</strong></div>
}
