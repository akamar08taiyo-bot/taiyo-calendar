import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api, setCsrfToken } from './api'
import { AnalysisView } from './components/AnalysisView'
import { CalendarView } from './components/CalendarView'
import { HiddenDialog, ImportDialog, PdfDialog, SettingsDialog } from './components/Dialogs'
import { Button, Icon } from './components/Icon'
import { LoginScreen } from './components/LoginScreen'
import { InitialImportScreen } from './components/InitialImportScreen'
import { PrintView } from './components/PrintView'
import { SalesReportView } from './components/SalesReportView'
import { parseSalesWorkbookAuto } from './salesReportExcelImport'
import { parseVisitLogWorkbook } from './visitLogImport'
import { applyImportedSalesFigures, applyImportedSalesFiguresMultiMonth, applyImportedVisitFigures, DEFAULT_FISCAL_YEAR, MONTH_LABELS } from './salesReportData'

const currentMonth = () => new Date().toISOString().slice(0, 7)
const fiscalFor = (month) => { const [year, number] = month.split('-').map(Number); return number >= 4 ? year : year - 1 }
const roleLabel = { staff: '営業員', office_admin: '営業所利用', system_admin: '営業所利用' }

function recomputeCalendar(calendar, providerId, day, visit) {
  const providers = calendar.providers.map((provider) => {
    if (provider.id !== providerId) return provider
    const visits = { ...provider.visits, [String(day)]: visit }
    const visitTotal = Object.values(visits).reduce((sum, item) => sum + item.count, 0)
    const visitedEntityCount = visitTotal > 0 ? 1 : 0
    return { ...provider, visits, visitTotal, visitedEntityCount, visitRate: provider.totalHomes === 0 ? null : Math.round(visitedEntityCount / provider.totalHomes * 1000) / 10 }
  })
  const totalHomes = providers.reduce((sum, provider) => sum + provider.totalHomes, 0)
  const visitTotal = providers.reduce((sum, provider) => sum + provider.visitTotal, 0)
  const visitedEntityCount = providers.reduce((sum, provider) => sum + provider.visitedEntityCount, 0)
  const attendanceDays = calendar.summary.attendanceDays || 0
  return { ...calendar, providers, summary: { ...calendar.summary, totalHomes, visitTotal, visitedEntityCount, attendanceDays, averageVisitCount: attendanceDays > 0 ? Math.round(visitTotal / attendanceDays * 10) / 10 : null, visitRate: totalHomes === 0 ? null : Math.round(visitedEntityCount / totalHomes * 1000) / 10 } }
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [needsInitialImport, setNeedsInitialImport] = useState(() => api.needsInitialImport())
  const [showStartScreen, setShowStartScreen] = useState(true)
  const [initialImportBusy, setInitialImportBusy] = useState(false)
  const [initialImportError, setInitialImportError] = useState('')
  const [offices, setOffices] = useState([])
  const [session, setSession] = useState(null)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [activeTab, setActiveTab] = useState('calendar')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [staff, setStaff] = useState([])
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [providerSearch, setProviderSearch] = useState('')
  const [printStaffId, setPrintStaffId] = useState('')
  const [month, setMonth] = useState(currentMonth())
  const [calendar, setCalendar] = useState(null)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [attendanceSaving, setAttendanceSaving] = useState(false)
  const [fiscalYear, setFiscalYear] = useState(fiscalFor(currentMonth()))
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [importState, setImportState] = useState({ loading: false, file: null, preview: null, archiveMissing: false, error: '' })
  const [hiddenProviders, setHiddenProviders] = useState([])
  const [hiddenLoading, setHiddenLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [printCalendar, setPrintCalendar] = useState(null)
  const [printStaffCalendars, setPrintStaffCalendars] = useState([])
  const [pendingPrint, setPendingPrint] = useState(false)
  const [pendingPdfDownload, setPendingPdfDownload] = useState(false)
  const [settings, setSettings] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [settingsLoading, setSettingsLoading] = useState(false)

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 4200)
  }, [])

  useEffect(() => {
    if (needsInitialImport) { setBooting(false); return }
    setBooting(true)
    Promise.all([api.publicOffices(), api.me().catch(() => null)]).then(([publicData, me]) => {
      setOffices(publicData.offices)
      if (me) { setCsrfToken(me.csrfToken); setSession(me) }
    }).finally(() => setBooting(false))
  }, [needsInitialImport])

  useEffect(() => {
    if (!session) return
    api.staff().then(({ staff: rows }) => {
      setStaff(rows)
      setSelectedStaffId(session.user.role === 'staff' ? session.user.id : '')
      const salesStaff = rows.filter((person) => person.active && person.role === 'staff')
      setPrintStaffId(session.user.role === 'staff' ? session.user.id : salesStaff[0]?.id || '')
    }).catch((error) => notify(error.message, 'error'))
  }, [session, notify])

  const loadCalendar = useCallback(async () => {
    if (!session) return
    setCalendarLoading(true)
    try { setCalendar(await api.calendar({ month, staffId: selectedStaffId })) }
    catch (error) {
      if (error.status === 401) setSession(null)
      notify(error.message, 'error')
    } finally { setCalendarLoading(false) }
  }, [session, month, selectedStaffId, notify])

  useEffect(() => { loadCalendar() }, [loadCalendar])

  useEffect(() => {
    if (!session || activeTab !== 'print') return
    let cancelled = false
    setPdfLoading(true)
    const salesStaff = staff.filter((person) => person.active && person.role === 'staff')
    const requests = [api.calendar({ month, staffId: printStaffId })]
    if (!printStaffId) requests.push(...salesStaff.map((person) => api.calendar({ month, staffId: person.id })))
    Promise.all(requests).then(([result, ...staffResults]) => {
      if (!cancelled) {
        setPrintCalendar(result)
        setPrintStaffCalendars(printStaffId ? [] : salesStaff.map((person, index) => ({ person, calendar: staffResults[index] })))
      }
    }).catch((error) => notify(error.message, 'error')).finally(() => {
      if (!cancelled) setPdfLoading(false)
    })
    return () => { cancelled = true }
  }, [session, activeTab, month, printStaffId, staff, notify])

  useEffect(() => {
    if (!pendingPrint || activeTab !== 'print' || pdfLoading || !printCalendar) return
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setPendingPrint(false)
        window.print()
      })
    })
    return () => { window.cancelAnimationFrame(firstFrame); window.cancelAnimationFrame(secondFrame) }
  }, [pendingPrint, activeTab, pdfLoading, printCalendar])

  useEffect(() => {
    if (!pendingPdfDownload || activeTab !== 'print' || pdfLoading || pdfGenerating || !printCalendar) return
    const frame = window.requestAnimationFrame(() => {
      setPendingPdfDownload(false)
      savePdfFile()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pendingPdfDownload, activeTab, pdfLoading, pdfGenerating, printCalendar])

  useEffect(() => {
    if (!session || activeTab !== 'analysis') return
    setAnalyticsLoading(true)
    api.analytics({ fiscalYear, staffId: selectedStaffId, comparisonMonth: month }).then(setAnalytics).catch((error) => notify(error.message, 'error')).finally(() => setAnalyticsLoading(false))
  }, [session, activeTab, fiscalYear, selectedStaffId, month, notify])

  async function handleLogin(form) {
    setLoginBusy(true); setLoginError('')
    try {
      const result = await api.login(form)
      setCsrfToken(result.csrfToken); setSession(result)
    } catch (error) { setLoginError(error.message) }
    finally { setLoginBusy(false) }
  }

  async function handleInitialImport(file) {
    setInitialImportBusy(true)
    setInitialImportError('')
    try {
      const result = await api.initialImport(file)
      const publicData = await api.publicOffices()
      setOffices(publicData.offices)
      setCsrfToken('')
      setSession(null)
      setNeedsInitialImport(false)
      setShowStartScreen(false)
      setBooting(false)
      setMonth(result.importedMonth)
      setFiscalYear(fiscalFor(result.importedMonth))
    } catch (error) {
      setInitialImportError(error.message)
    } finally {
      setInitialImportBusy(false)
    }
  }

  async function logout() {
    try { await api.logout() } catch { /* session is cleared locally either way */ }
    setCsrfToken(''); setSession(null); setCalendar(null); setStaff([]); setSelectedStaffId(''); setPrintStaffId(''); setSidebarOpen(false)
  }

  function changeMonth(delta) {
    const [year, number] = month.split('-').map(Number)
    const next = new Date(year, number - 1 + delta, 1)
    const value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    setMonth(value); setFiscalYear(fiscalFor(value))
  }

  async function updateVisit(provider, day, count, version) {
    const key = `${provider.id}-${day}`
    if (savingKey) return
    setSavingKey(key)
    try {
      const result = await api.updateVisit(provider.id, `${month}-${String(day).padStart(2, '0')}`, count, version)
      setCalendar((current) => recomputeCalendar(current, provider.id, day, { count: result.count, version: result.version, updatedAt: new Date().toISOString() }))
    } catch (error) {
      notify(error.message, 'error'); await loadCalendar()
    } finally { setSavingKey('') }
  }

  async function updateAttendance(days) {
    if (!selectedStaffId || attendanceSaving) return
    setAttendanceSaving(true)
    try {
      await api.updateAttendance({ month, staffId: selectedStaffId, days })
      notify('出勤日数を保存しました。')
      await loadCalendar()
    } catch (error) { notify(error.message, 'error') }
    finally { setAttendanceSaving(false) }
  }

  async function editTotal(provider) {
    const answer = window.prompt(`${provider.name} の総居宅数`, String(provider.totalHomes))
    if (answer == null) return
    try { await api.updateProvider(provider.id, { totalHomes: Number(answer) }); notify('総居宅数を更新しました。'); await loadCalendar() }
    catch (error) { notify(error.message, 'error') }
  }

  async function hideProvider(provider) {
    if (!window.confirm(`${provider.name} を非表示にしますか？訪問履歴は保持されます。`)) return
    try { await api.updateProvider(provider.id, { hidden: true }); notify('事業者を非表示にしました。'); await loadCalendar() }
    catch (error) { notify(error.message, 'error') }
  }

  // 名称からの自動判定が実態と合わない場合に、包括／居宅を手動で切り替える
  async function changeProviderKind(provider, kind) {
    const label = kind === 'houkatsu' ? '包括' : '居宅'
    try {
      await api.updateProvider(provider.id, { kind })
      notify(`${provider.name} を「${label}」に変更しました。`)
      await loadCalendar()
    } catch (error) { notify(error.message, 'error') }
  }

  async function openHidden() {
    setDialog('hidden'); setHiddenLoading(true)
    try {
      const data = await api.calendar({ month, staffId: selectedStaffId, includeHidden: true })
      setHiddenProviders(data.providers.filter((provider) => provider.hiddenAt))
    } catch (error) { notify(error.message, 'error') }
    finally { setHiddenLoading(false) }
  }

  async function restoreProvider(provider) {
    try { await api.updateProvider(provider.id, { hidden: false }); setHiddenProviders((items) => items.filter((item) => item.id !== provider.id)); notify('事業者を復元しました。'); await loadCalendar() }
    catch (error) { notify(error.message, 'error') }
  }

  async function deleteProvider(provider, challenge) {
    try {
      if (!challenge) return await api.deleteChallenge(provider.id)
      await api.deleteProvider(provider.id, challenge)
      setHiddenProviders((items) => items.filter((item) => item.id !== provider.id)); notify('事業者と訪問履歴を完全削除しました。')
      return null
    } catch (error) { notify(error.message, 'error'); return null }
  }

  // 「Excelを取り込む」で選んだファイルが営業月報向け（売上状況報告書／担当別売上実績／訪問ログ）の場合は、
  // 居宅カレンダーの取込フローに進む前にそちらへ直接反映する。該当しなければnullを返し、通常の取込にフォールバックする。
  async function tryImportSalesReportFile(file) {
    if (/\.(xlsx|xlsm)$/i.test(file.name)) {
      let result
      try { result = await parseSalesWorkbookAuto(file) }
      catch { return null }
      if (result.type === 'status') {
        const targetYear = result.fiscalYear ?? fiscalYear ?? DEFAULT_FISCAL_YEAR
        const targetMonth = result.monthKey ?? month.split('-')[1]
        const summary = applyImportedSalesFigures(targetYear, targetMonth, result.data)
        const total = summary.updated.length + summary.created.length
        return `売上状況報告書を営業月報（${targetYear}年度${MONTH_LABELS[targetMonth] || targetMonth + '月'}）に反映しました（${total}件）。`
      }
      const targetYear = result.fiscalYear ?? fiscalYear ?? DEFAULT_FISCAL_YEAR
      const summary = applyImportedSalesFiguresMultiMonth(targetYear, result.data)
      const total = summary.updated.length + summary.created.length
      return `担当別売上実績を営業月報（${targetYear}年度）に反映しました（${total}件、${summary.months.length}ヶ月分）。`
    }
    if (/\.(xls|csv)$/i.test(file.name)) {
      let result
      try { result = await parseVisitLogWorkbook(file) }
      catch { return null }
      const summary = applyImportedVisitFigures(result.offices)
      const total = summary.updated.length + summary.created.length
      return `訪問ログを営業月報の訪問実績に反映しました（${result.matchedRows}/${result.totalRows}件、${total}名分）。`
    }
    return null
  }

  function openImport() { setImportState({ loading: false, file: null, preview: null, archiveMissing: false, error: '' }); setDialog('import') }
  function selectImportFile(file) {
    if (!file) return
    if (!/\.(xls|xlsx|xlsm|csv)$/i.test(file.name)) {
      setImportState({ loading: false, file: null, preview: null, archiveMissing: false, error: '取り込めるファイルは .xls、.xlsx、.xlsm、.csv 形式です。' })
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setImportState({ loading: false, file: null, preview: null, archiveMissing: false, error: 'Excelファイルは25MB以下にしてください。' })
      return
    }
    setImportState((state) => ({ loading: false, file, preview: null, archiveMissing: state.archiveMissing, error: '' }))
  }
  function setImportArchiveMissing(archiveMissing) {
    setImportState((state) => ({ ...state, archiveMissing, preview: null, error: '' }))
  }
  async function previewImport() {
    if (!importState.file) return
    setImportState((state) => ({ ...state, loading: true, preview: null, error: '' }))
    const file = importState.file
    try {
      const salesMessage = await tryImportSalesReportFile(file)
      if (salesMessage) {
        setDialog(null)
        setImportState({ loading: false, file: null, preview: null, archiveMissing: false, error: '' })
        notify(salesMessage)
        return
      }
    } catch (error) {
      setImportState((state) => ({ ...state, loading: false, preview: null, error: error.message }))
      return
    }
    try {
      const preview = await api.importPreview(file, importState.archiveMissing)
      setImportState((state) => ({ ...state, loading: false, preview, error: '' }))
    } catch (error) { setImportState((state) => ({ ...state, loading: false, preview: null, error: error.message })) }
  }
  async function confirmImportAction() {
    setImportState((state) => ({ ...state, loading: true, error: '' }))
    try {
      const result = await api.importConfirm(importState.preview.batchId)
      const publicData = await api.publicOffices()
      setOffices(publicData.offices)
      setDialog(null)
      setMonth(result.importedMonth)
      setFiscalYear(fiscalFor(result.importedMonth))
      setSelectedStaffId('')
      if (result.officeId && result.officeId !== session.office.id) {
        const nextSession = await api.login({ officeId: result.officeId })
        setSession(nextSession)
        setCalendar(null)
      } else {
        const rows = await api.staff()
        setStaff(rows.staff)
        await loadCalendar()
      }
      notify(`${result.officeName}・${result.importedMonth}を更新しました。訪問 ${result.insertedVisits}回を反映しました。`)
    }
    catch (error) { setImportState((state) => ({ ...state, loading: false, error: error.message })) }
  }

  function downloadPdfFor(targetStaffId, closeDialog = false) {
    const fallbackStaffId = staff.find((person) => person.active && person.role === 'staff')?.id || ''
    const resolvedStaffId = targetStaffId !== undefined ? targetStaffId : printStaffId
    const permittedStaffId = session.user.role === 'staff' ? session.user.id : resolvedStaffId
    if (session.user.role === 'staff' && !permittedStaffId) { notify('印刷する営業員を選択してください。', 'error'); return }
    if (closeDialog) setDialog(null)
    setPrintCalendar(null)
    setPrintStaffCalendars([])
    setActiveTab('print')
    setPrintStaffId(permittedStaffId || (session.user.role === 'staff' ? fallbackStaffId : ''))
    setPendingPdfDownload(true)
  }

  async function savePdfFile() {
    if (!printCalendar || pdfLoading || pdfGenerating) return
    const targetStaffName = printStaffId ? staff.find((person) => person.id === printStaffId)?.name || '営業員' : '営業所全体'
    setPdfGenerating(true)
    try {
      const { downloadCalendarPdf } = await import('./pdf-export')
      await downloadCalendarPdf({ month, officeName: session.office.name, staffName: targetStaffName })
      notify('PDFを保存しました。')
    } catch (error) { notify(error.message || 'PDFを保存できませんでした。', 'error') }
    finally { setPdfGenerating(false) }
  }

  function openPrintPdf() {
    if (!printCalendar || pdfLoading) return
    setPendingPrint(true)
  }

  function openPdfDialog() {
    setPrintStaffId(session.user.role === 'staff' ? session.user.id : selectedStaffId)
    setDialog('pdf')
  }

  function openPrintTab() {
    setPrintCalendar(null)
    setPrintStaffCalendars([])
    setPrintStaffId(session.user.role === 'staff' ? session.user.id : selectedStaffId)
    setActiveTab('print')
    setSidebarOpen(false)
  }

  function printFromCalendar() {
    openPrintTab()
    setPendingPrint(true)
  }

  async function openSettings() {
    setDialog('settings'); setSettingsLoading(true)
    try { const [configuration, audit] = await Promise.all([api.settings(), api.audit()]); setSettings(configuration); setAuditLogs(audit.logs) }
    catch (error) { notify(error.message, 'error') }
    finally { setSettingsLoading(false) }
  }
  async function saveSettings(values) {
    setSettingsLoading(true)
    try { await api.updateSettings(values); setSettings(await api.settings()); notify('設定を保存しました。') }
    catch (error) { notify(error.message, 'error') }
    finally { setSettingsLoading(false) }
  }
  const selectedStaffName = useMemo(() => staff.find((person) => person.id === selectedStaffId)?.name || '', [staff, selectedStaffId])
  const printStaffName = useMemo(() => staff.find((person) => person.id === printStaffId)?.name || '', [staff, printStaffId])

  if (showStartScreen) return <InitialImportScreen onImport={handleInitialImport} onContinue={() => setShowStartScreen(false)} hasSavedData={!needsInitialImport} busy={initialImportBusy} error={initialImportError}/>
  if (booting) return <div className="boot-screen"><span className="spinner"/><strong>営業管理を起動しています…</strong></div>
  if (!session) return <LoginScreen offices={offices} onLogin={handleLogin} busy={loginBusy} error={loginError}/>

  let pageContent
  if (activeTab === 'calendar') {
    pageContent = <CalendarView month={month} calendar={calendar} officeName={session.office.name} scopeLabel={selectedStaffName || '営業所集計'} staff={staff} selectedStaffId={selectedStaffId} setSelectedStaffId={setSelectedStaffId} search={providerSearch} setSearch={setProviderSearch} canSelectStaff={session.user.role !== 'staff'} loading={calendarLoading} savingKey={savingKey} attendanceSaving={attendanceSaving} onChangeMonth={changeMonth} onUpdateVisit={updateVisit} onUpdateAttendance={updateAttendance} onHide={hideProvider} onChangeKind={changeProviderKind} onOpenHidden={openHidden} onOpenImport={openImport} onOpenPdf={openPdfDialog} onOpenPrint={printFromCalendar} onOpenAnalysis={() => setActiveTab('analysis')} canImport={session.permissions.canImport}/>
  } else if (activeTab === 'analysis') {
    pageContent = <AnalysisView fiscalYear={fiscalYear} setFiscalYear={setFiscalYear} analytics={analytics} loading={analyticsLoading} scopeLabel={selectedStaffName || '営業所全体'} staff={staff} selectedStaffId={selectedStaffId} setSelectedStaffId={setSelectedStaffId} canSelectStaff={session.user.role !== 'staff'} onBack={() => setActiveTab('calendar')} onPdf={openPdfDialog}/>
  } else if (activeTab === 'salesReport') {
    pageContent = <SalesReportView officeName={session.office.name} fiscalYear={fiscalYear}/>
  } else {
    pageContent = <PrintView month={month} officeName={session.office.name} staff={staff} calendar={printCalendar} staffCalendars={printStaffCalendars} selectedStaffId={printStaffId} setSelectedStaffId={(staffId) => { setPrintCalendar(null); setPrintStaffCalendars([]); setPrintStaffId(staffId) }} search={providerSearch} setSearch={setProviderSearch} canSelectStaff={session.user.role !== 'staff'} loading={pdfLoading} generating={pdfGenerating} onChangeMonth={changeMonth} onOpenPrint={openPrintPdf} onDownload={savePdfFile}/>
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
      <div className="sidebar-brand"><span className="brand-symbol">営</span><span>営業管理</span><button className="sidebar-close icon-button" onClick={() => setSidebarOpen(false)}><Icon name="close"/></button></div>
      <nav><button className={activeTab === 'calendar' ? 'active' : ''} onClick={() => { setActiveTab('calendar'); setSidebarOpen(false) }}><Icon name="calendar"/>居宅カレンダー</button><button className={activeTab === 'analysis' ? 'active' : ''} onClick={() => { setActiveTab('analysis'); setSidebarOpen(false) }}><Icon name="chart"/>実績分析</button><button className={activeTab === 'salesReport' ? 'active' : ''} onClick={() => { setActiveTab('salesReport'); setSidebarOpen(false) }}><Icon name="report"/>営業月報</button><button className={activeTab === 'print' ? 'active' : ''} onClick={openPrintTab}><Icon name="printer"/>印刷</button></nav>
      <div className="sidebar-bottom">{session.user.role === 'system_admin' && <button onClick={openSettings}><Icon name="settings"/>システム設定</button>}<div className="retention-note"><Icon name="info" size={16}/>訪問記録は5年以上保持</div><button onClick={logout}><Icon name="logout"/>ログアウト</button></div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="メニューを閉じる" onClick={() => setSidebarOpen(false)}/>} 
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)}><Icon name="menu"/></button><div className="mobile-brand"><span className="brand-symbol">営</span>営業管理</div><div className="office-context"><span>営業所</span><strong>{session.office.name}</strong></div><div className="topbar-spacer"/><div className="user-context"><Icon name="user"/><div><strong>{session.user.name}</strong><span>{roleLabel[session.user.role]}</span></div></div></header>
      <div className="page-content">{pageContent}</div>
    </main>
    {dialog === 'import' && <ImportDialog state={importState} onFileSelect={selectImportFile} onPreview={previewImport} onConfirm={confirmImportAction} onClose={() => setDialog(null)}/>} 
    {dialog === 'pdf' && <PdfDialog month={month} staffName={printStaffName} loading={pdfLoading || pdfGenerating} onDownload={() => downloadPdfFor(printStaffId, true)} onClose={() => setDialog(null)}/>} 
    {dialog === 'hidden' && <HiddenDialog providers={hiddenProviders} loading={hiddenLoading} canDelete={session.permissions.canDeletePermanently} onRestore={restoreProvider} onDelete={deleteProvider} onClose={() => setDialog(null)}/>} 
    {dialog === 'settings' && <SettingsDialog settings={settings} auditLogs={auditLogs} loading={settingsLoading} onSave={saveSettings} onClose={() => setDialog(null)}/>} 
    {toast && <div className={`toast ${toast.type}`} role="status"><Icon name={toast.type === 'error' ? 'info' : 'check'}/>{toast.message}</div>}
  </div>
}
