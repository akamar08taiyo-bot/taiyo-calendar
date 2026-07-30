import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api, setCsrfToken } from './api'
import { AnalysisView } from './components/AnalysisView'
import { CalendarView } from './components/CalendarView'
import { HiddenDialog, ImportDialog, PdfDialog, SettingsDialog } from './components/Dialogs'
import { Button, Icon } from './components/Icon'
import { LoginScreen } from './components/LoginScreen'
import { PrintView } from './components/PrintView'

const currentMonth = () => new Date().toISOString().slice(0, 7)
const fiscalFor = (month) => { const [year, number] = month.split('-').map(Number); return number >= 4 ? year : year - 1 }
const roleLabel = { staff: '営業員', office_admin: '営業所管理者', system_admin: 'システム管理者' }

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
  return { ...calendar, providers, summary: { totalHomes, visitTotal, visitedEntityCount, visitRate: totalHomes === 0 ? null : Math.round(visitedEntityCount / totalHomes * 1000) / 10 } }
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [offices, setOffices] = useState([])
  const [session, setSession] = useState(null)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [activeTab, setActiveTab] = useState('calendar')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [staff, setStaff] = useState([])
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [printStaffId, setPrintStaffId] = useState('')
  const [month, setMonth] = useState(currentMonth())
  const [calendar, setCalendar] = useState(null)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [fiscalYear, setFiscalYear] = useState(fiscalFor(currentMonth()))
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [importState, setImportState] = useState({ loading: false, file: null, preview: null, archiveMissing: false, error: '' })
  const [hiddenProviders, setHiddenProviders] = useState([])
  const [hiddenLoading, setHiddenLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [settings, setSettings] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [settingsLoading, setSettingsLoading] = useState(false)

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 4200)
  }, [])

  useEffect(() => {
    Promise.all([api.publicOffices(), api.me().catch(() => null)]).then(([publicData, me]) => {
      setOffices(publicData.offices)
      if (me) { setCsrfToken(me.csrfToken); setSession(me) }
    }).finally(() => setBooting(false))
  }, [])

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
    if (!session || activeTab !== 'analysis') return
    setAnalyticsLoading(true)
    api.analytics({ fiscalYear, staffId: selectedStaffId }).then(setAnalytics).catch((error) => notify(error.message, 'error')).finally(() => setAnalyticsLoading(false))
  }, [session, activeTab, fiscalYear, selectedStaffId, notify])

  async function handleLogin(form) {
    setLoginBusy(true); setLoginError('')
    try {
      const result = await api.login(form)
      setCsrfToken(result.csrfToken); setSession(result)
    } catch (error) { setLoginError(error.message) }
    finally { setLoginBusy(false) }
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

  function openImport() { setImportState({ loading: false, file: null, preview: null, archiveMissing: false, error: '' }); setDialog('import') }
  function selectImportFile(file) {
    if (!file) return
    if (!/\.xlsx$/i.test(file.name)) {
      setImportState({ loading: false, file: null, preview: null, archiveMissing: false, error: '取り込めるファイルは .xlsx 形式だけです。' })
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
    try {
      const preview = await api.importPreview(importState.file, importState.archiveMissing)
      setImportState((state) => ({ ...state, loading: false, preview, error: '' }))
    } catch (error) { setImportState((state) => ({ ...state, loading: false, preview: null, error: error.message })) }
  }
  async function confirmImportAction() {
    setImportState((state) => ({ ...state, loading: true, error: '' }))
    try { const result = await api.importConfirm(importState.preview.batchId); setDialog(null); notify(`Excel取込が完了しました。新規訪問 ${result.insertedVisits}件を資料へ反映しました。`); await loadCalendar() }
    catch (error) { setImportState((state) => ({ ...state, loading: false, error: error.message })) }
  }

  async function downloadPdfFor(targetStaffId, closeDialog = false) {
    if (closeDialog) setDialog(null)
    setActiveTab('print')
    setPrintStaffId(targetStaffId)
    window.setTimeout(() => window.print(), 250)
    notify('印刷画面で「PDFとして保存」を選択してください。')
  }

  async function openPrintPdf() {
    window.print()
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
  async function setPin(staffId, pin) {
    setSettingsLoading(true)
    try { await api.updatePin(staffId, pin); const rows = await api.staff(); setStaff(rows.staff); notify('PINを更新し、営業員を有効化しました。') }
    catch (error) { notify(error.message, 'error') }
    finally { setSettingsLoading(false) }
  }

  const selectedStaffName = useMemo(() => staff.find((person) => person.id === selectedStaffId)?.name || '', [staff, selectedStaffId])

  if (booting) return <div className="boot-screen"><span className="spinner"/><strong>スマートれん太を起動しています…</strong></div>
  if (!session) return <LoginScreen offices={offices} onLogin={handleLogin} busy={loginBusy} error={loginError}/>

  let pageContent
  if (activeTab === 'calendar') {
    pageContent = <CalendarView month={month} calendar={calendar} officeName={session.office.name} scopeLabel={selectedStaffName || '営業所集計'} staff={staff} selectedStaffId={selectedStaffId} setSelectedStaffId={setSelectedStaffId} canSelectStaff={session.user.role !== 'staff'} loading={calendarLoading} savingKey={savingKey} onChangeMonth={changeMonth} onUpdateVisit={updateVisit} onEditTotal={editTotal} onHide={hideProvider} onOpenHidden={openHidden} onOpenImport={openImport} onOpenPdf={() => setDialog('pdf')} onOpenAnalysis={() => setActiveTab('analysis')} canImport={session.permissions.canImport}/>
  } else if (activeTab === 'analysis') {
    pageContent = <AnalysisView fiscalYear={fiscalYear} setFiscalYear={setFiscalYear} analytics={analytics} loading={analyticsLoading} scopeLabel={selectedStaffName || '営業所集計'} onBack={() => setActiveTab('calendar')} onPdf={() => setDialog('pdf')}/>
  } else {
    pageContent = <PrintView month={month} officeName={session.office.name} staff={staff} selectedStaffId={printStaffId} setSelectedStaffId={setPrintStaffId} canSelectStaff={session.user.role !== 'staff'} loading={pdfLoading} onChangeMonth={changeMonth} onOpenPrint={openPrintPdf} onDownload={() => downloadPdfFor(printStaffId)}/>
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
      <div className="sidebar-brand"><span className="brand-symbol">れ</span><span>スマートれん太</span><button className="sidebar-close icon-button" onClick={() => setSidebarOpen(false)}><Icon name="close"/></button></div>
      <nav><button className={activeTab === 'calendar' ? 'active' : ''} onClick={() => { setActiveTab('calendar'); setSidebarOpen(false) }}><Icon name="calendar"/>居宅カレンダー</button><button className={activeTab === 'analysis' ? 'active' : ''} onClick={() => { setActiveTab('analysis'); setSidebarOpen(false) }}><Icon name="chart"/>実績分析</button><button className={activeTab === 'print' ? 'active' : ''} onClick={() => { setActiveTab('print'); setSidebarOpen(false) }}><Icon name="printer"/>印刷</button></nav>
      <div className="sidebar-bottom">{session.user.role === 'system_admin' && <button onClick={openSettings}><Icon name="settings"/>システム設定</button>}<div className="retention-note"><Icon name="info" size={16}/>訪問記録は5年以上保持</div><button onClick={logout}><Icon name="logout"/>ログアウト</button></div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="メニューを閉じる" onClick={() => setSidebarOpen(false)}/>}
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)}><Icon name="menu"/></button><div className="mobile-brand"><span className="brand-symbol">れ</span>スマートれん太</div><div className="office-context"><span>営業所</span><strong>{session.office.name}</strong></div><div className="topbar-spacer"/><div className="user-context"><Icon name="user"/><div><strong>{session.user.name}</strong><span>{roleLabel[session.user.role]}</span></div></div></header>
      <div className="page-content">{pageContent}</div>
    </main>
    {dialog === 'import' && <ImportDialog state={importState} onFileSelect={selectImportFile} onArchiveMissingChange={setImportArchiveMissing} onPreview={previewImport} onConfirm={confirmImportAction} onClose={() => setDialog(null)}/>}
    {dialog === 'pdf' && <PdfDialog month={month} staffName={selectedStaffName} loading={pdfLoading} onDownload={() => downloadPdfFor(selectedStaffId, true)} onClose={() => setDialog(null)}/>}
    {dialog === 'hidden' && <HiddenDialog providers={hiddenProviders} loading={hiddenLoading} canDelete={session.permissions.canDeletePermanently} onRestore={restoreProvider} onDelete={deleteProvider} onClose={() => setDialog(null)}/>}
    {dialog === 'settings' && <SettingsDialog settings={settings} staff={staff} auditLogs={auditLogs} loading={settingsLoading} onSave={saveSettings} onSetPin={setPin} onClose={() => setDialog(null)}/>}
    {toast && <div className={`toast ${toast.type}`} role="status"><Icon name={toast.type === 'error' ? 'info' : 'check'}/>{toast.message}</div>}
  </div>
}
