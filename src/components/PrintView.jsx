import React, { useMemo } from 'react'
import { daysForMonth, visitValueLabel } from '../calendar-utils'
import { Button, Icon } from './Icon'

const average = (total, days) => days > 0 ? Math.round(total / days * 10) / 10 : null
const decimal = (value) => value == null ? '—' : Number(value).toFixed(1)
const matchesFilter = (provider, search) => `${provider.name}${provider.staffName}${provider.externalCode || ''}`.toLowerCase().includes(search.trim().toLowerCase())

export function PrintView({ month, officeName, staff, calendar, staffCalendars, selectedStaffId, setSelectedStaffId, search, setSearch, canSelectStaff, loading, generating, onChangeMonth, onOpenPrint, onDownload }) {
  const [year, monthNumber] = month.split('-').map(Number)
  const printableStaff = staff.filter((person) => person.active && person.role === 'staff')
  const selectedStaff = printableStaff.find((person) => person.id === selectedStaffId)
  const officeMode = canSelectStaff && !selectedStaffId
  const days = useMemo(() => daysForMonth(month), [month])
  const filteredProviders = useMemo(() => (calendar?.providers || []).filter((provider) => matchesFilter(provider, search)), [calendar, search])
  const individualSummary = useMemo(() => {
    const visitTotal = filteredProviders.reduce((sum, provider) => sum + provider.visitTotal, 0)
    const attendanceDays = calendar?.summary?.attendanceDays || 0
    return { visitedEntityCount: filteredProviders.length, visitTotal, attendanceDays, averageVisitCount: average(visitTotal, attendanceDays) }
  }, [filteredProviders, calendar])
  const officeRows = useMemo(() => (staffCalendars || []).map(({ person, calendar: personCalendar }) => {
    const providers = (personCalendar?.providers || []).filter((provider) => matchesFilter(provider, search))
    const visitTotal = providers.reduce((sum, provider) => sum + provider.visitTotal, 0)
    const attendanceDays = personCalendar?.summary?.attendanceDays || 0
    return {
      id: person.id,
      name: person.name,
      providers,
      visitedEntityCount: providers.length,
      visitTotal,
      attendanceDays,
      averageVisitCount: average(visitTotal, attendanceDays),
      dailyTotals: days.map(({ day }) => providers.reduce((sum, provider) => sum + (provider.visits[String(day)]?.count || 0), 0)),
    }
  }), [staffCalendars, search, days])
  const officeSummary = useMemo(() => {
    const visitTotal = officeRows.reduce((sum, row) => sum + row.visitTotal, 0)
    const attendanceDays = officeRows.reduce((sum, row) => sum + row.attendanceDays, 0)
    const attendanceComplete = officeRows.length > 0 && officeRows.every((row) => row.attendanceDays > 0)
    return {
      staffCount: officeRows.length,
      visitedEntityCount: officeRows.reduce((sum, row) => sum + row.visitedEntityCount, 0),
      visitTotal,
      attendanceDays,
      averageVisitCount: attendanceComplete ? average(visitTotal, attendanceDays) : null,
      dailyTotals: days.map((_, index) => officeRows.reduce((sum, row) => sum + row.dailyTotals[index], 0)),
    }
  }, [officeRows, days])
  const canOutput = Boolean(calendar) && (officeMode || selectedStaff)
  const outputLabel = officeMode ? '営業所全体（営業員別集計）' : selectedStaff?.name || '—'

  return <>
    <div className="page-header print-page-header">
      <div><h1>印刷</h1><p>カレンダーの営業員・検索フィルターを引き継いで印刷・PDF保存</p></div>
    </div>

    <div className="print-layout">
      <section className="print-controls" aria-label="印刷条件">
        <div className="print-section-heading"><Icon name="printer" size={20}/><div><h2>印刷条件</h2><span>現在の絞り込み条件を印刷内容へ反映します</span></div></div>
        <label className="print-field">印刷範囲
          <span className="select-wrap"><select value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)} disabled={!canSelectStaff || loading}>
            {canSelectStaff && <option value="">営業所全体（営業員別集計）</option>}
            {printableStaff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select><Icon name="down" size={15}/></span>
        </label>
        <label className="print-field">絞り込み
          <span className="print-search-wrap"><Icon name="search" size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="事業者名・営業員名"/></span>
        </label>
        <div className="print-field">対象月
          <div className="print-month-switcher"><button className="icon-button" aria-label="前の月" onClick={() => onChangeMonth(-1)} disabled={loading}><Icon name="left"/></button><strong>{year}年{monthNumber}月</strong><button className="icon-button" aria-label="次の月" onClick={() => onChangeMonth(1)} disabled={loading}><Icon name="right"/></button></div>
        </div>
        <div className="print-scope-note"><Icon name="info" size={17}/><span>{officeMode ? '営業所全体では居宅名を表示せず、営業員別の数字と営業所合計を印刷します。' : '選択した営業員について、検索で絞り込まれた居宅だけを印刷します。'}{search && <b>　現在の検索：{search}</b>}</span></div>
        <div className="print-actions">
          <Button icon="pdf" disabled={!canOutput || loading || generating} onClick={onDownload}>{generating ? 'PDF作成中…' : loading ? '読込中…' : 'PDFとして保存'}</Button>
          <Button icon="printer" variant="primary" disabled={!canOutput || loading} onClick={onOpenPrint}>{loading ? '読込中…' : '印刷画面を開く'}</Button>
        </div>
      </section>

      <section className="print-preview-panel" aria-label="印刷内容の確認">
        <div className="print-preview-heading"><div><h2>印刷内容</h2><span>{officeMode ? '営業所集計・居宅名なし' : '個人別居宅カレンダー'}・A4横向き</span></div><strong>{loading ? '読込中' : canOutput ? '出力可能' : '印刷範囲を選択'}</strong></div>
        <article className={`print-document ${officeMode ? 'office-print-document' : ''}`} aria-label={`${year}年${monthNumber}月 ${outputLabel} 印刷資料`}>
          <header className="print-document-title">
            <div><h2>{year}年{monthNumber}月　{officeMode ? '営業所訪問実績' : '居宅カレンダー'}</h2><strong>{officeName}</strong></div>
            <b>{officeMode ? '集計範囲：営業所全体' : `営業員：${selectedStaff?.name || '—'}`}</b>
          </header>
          {search && <div className="print-filter-label">絞り込み条件：{search}</div>}
          {officeMode
            ? <OfficeReport days={days} rows={officeRows} summary={officeSummary} loading={loading}/>
            : <IndividualReport days={days} providers={filteredProviders} summary={individualSummary} loading={loading}/>} 
        </article>
        <p className="print-help">画面の絞り込み条件が印刷とPDFへ反映されます。PDFはファイルとして直接ダウンロードします。</p>
      </section>
    </div>
  </>
}

function IndividualReport({ days, providers, summary, loading }) {
  return <>
    <section className="print-summary" aria-label="月間集約">
      <PrintMetric label="訪問居宅数" value={summary.visitedEntityCount}/><PrintMetric label="訪問件数" value={summary.visitTotal}/><PrintMetric label="出勤日数" value={summary.attendanceDays}/><PrintMetric label="平均訪問件数／出勤日" value={decimal(summary.averageVisitCount)}/>
    </section>
    {loading && <PrintEmpty loading/>}
    {!loading && !providers.length && <PrintEmpty/>}
    {!loading && providers.length > 0 && <table className="print-calendar-table">
      <thead><tr><th className="print-no">No.</th><th className="print-provider">居宅名</th>{days.map(({ day, label, weekday }) => <th key={day} className={weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : ''}><span>{day}</span><small>{label}</small></th>)}<th className="print-total">月計</th></tr></thead>
      <tbody>{providers.map((provider, index) => <tr key={provider.id}><th>{index + 1}</th><th className="print-provider-name">{provider.name}</th>{days.map(({ day, weekday }) => <td key={day} className={weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : ''}>{visitValueLabel(provider.visits[String(day)]?.count || 0)}</td>)}<td className="print-row-total">{provider.visitTotal}</td></tr>)}</tbody>
      <tfoot><tr><th colSpan="2">日別合計</th>{days.map(({ day }) => <td key={day}>{providers.reduce((sum, provider) => sum + (provider.visits[String(day)]?.count || 0), 0) || ''}</td>)}<td>{summary.visitTotal}</td></tr></tfoot>
    </table>}
  </>
}

function OfficeReport({ days, rows, summary, loading }) {
  return <>
    <section className="print-summary office-print-summary" aria-label="営業所月間集約">
      <PrintMetric label="営業員数" value={summary.staffCount}/><PrintMetric label="訪問居宅数" value={summary.visitedEntityCount}/><PrintMetric label="訪問件数" value={summary.visitTotal}/><PrintMetric label="出勤日数（合計）" value={summary.attendanceDays}/><PrintMetric label="平均訪問件数／出勤日" value={decimal(summary.averageVisitCount)}/>
    </section>
    {loading && <PrintEmpty loading/>}
    {!loading && !rows.length && <PrintEmpty/>}
    {!loading && rows.length > 0 && <table className="print-calendar-table office-summary-table">
      <thead><tr><th className="print-no">No.</th><th className="print-staff-name">営業員</th>{days.map(({ day, label, weekday }) => <th key={day} className={weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : ''}><span>{day}</span><small>{label}</small></th>)}<th>訪問<br/>居宅数</th><th>月間<br/>訪問件数</th><th>出勤<br/>日数</th><th>1日<br/>平均</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.id}><th>{index + 1}</th><th className="print-provider-name">{row.name}</th>{row.dailyTotals.map((total, dayIndex) => <td key={dayIndex}>{total || ''}</td>)}<td>{row.visitedEntityCount}</td><td className="print-row-total">{row.visitTotal}</td><td>{row.attendanceDays || '—'}</td><td>{decimal(row.averageVisitCount)}</td></tr>)}</tbody>
      <tfoot><tr><th colSpan="2">営業所合計</th>{summary.dailyTotals.map((total, index) => <td key={index}>{total || ''}</td>)}<td>{summary.visitedEntityCount}</td><td>{summary.visitTotal}</td><td>{summary.attendanceDays || '—'}</td><td>{decimal(summary.averageVisitCount)}</td></tr></tfoot>
    </table>}
    {!loading && rows.some((row) => row.attendanceDays === 0) && <p className="office-print-note">※ 出勤日数が未入力の営業員がいるため、営業所全体の1日平均は「—」で表示しています。</p>}
  </>
}

function PrintEmpty({ loading = false }) { return <div className="print-empty">{loading && <span className="spinner"/>}<strong>{loading ? '印刷データを読み込み中…' : '絞り込み条件に該当するデータがありません'}</strong></div> }
function PrintMetric({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div> }
