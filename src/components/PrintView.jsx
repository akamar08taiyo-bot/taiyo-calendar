import React from 'react'
import { Button, Icon } from './Icon'

export function PrintView({ month, officeName, staff, selectedStaffId, setSelectedStaffId, canSelectStaff, loading, onChangeMonth, onOpenPrint, onDownload }) {
  const [year, monthNumber] = month.split('-').map(Number)
  const printableStaff = staff.filter((person) => person.active && person.role === 'staff')
  const selectedStaff = printableStaff.find((person) => person.id === selectedStaffId)

  return <>
    <div className="page-header print-page-header">
      <div><h1>印刷</h1><p>営業員と対象月を指定して居宅カレンダーを印刷</p></div>
    </div>

    <div className="print-layout">
      <section className="print-controls" aria-label="印刷条件">
        <div className="print-section-heading"><Icon name="printer" size={20}/><div><h2>印刷条件</h2><span>個人の担当範囲だけを出力します</span></div></div>
        <label className="print-field">印刷する営業員
          <span className="select-wrap"><select value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)} disabled={!canSelectStaff || loading}>
            {printableStaff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select><Icon name="down" size={15}/></span>
        </label>
        <div className="print-field">対象月
          <div className="print-month-switcher"><button className="icon-button" aria-label="前の月" onClick={() => onChangeMonth(-1)} disabled={loading}><Icon name="left"/></button><strong>{year}年{monthNumber}月</strong><button className="icon-button" aria-label="次の月" onClick={() => onChangeMonth(1)} disabled={loading}><Icon name="right"/></button></div>
        </div>
        <div className="print-scope-note"><Icon name="lock" size={17}/><span>APIで営業所と営業員の権限を確認してから出力します。</span></div>
        <div className="print-actions">
          <Button icon="pdf" disabled={!selectedStaff || loading} onClick={onDownload}>{loading ? '生成中…' : 'PDFを保存'}</Button>
          <Button icon="printer" variant="primary" disabled={!selectedStaff || loading} onClick={onOpenPrint}>{loading ? '生成中…' : '印刷画面を開く'}</Button>
        </div>
      </section>

      <section className="print-preview-panel" aria-label="印刷内容の確認">
        <div className="print-preview-heading"><div><h2>印刷内容</h2><span>A4横向き・日本語フォント埋込</span></div><strong>{selectedStaff ? '出力可能' : '営業員を選択'}</strong></div>
        <div className="print-paper">
          <div className="print-paper-title"><div><strong>{year}年{monthNumber}月　居宅カレンダー</strong><span>{officeName}</span></div><b>営業員：{selectedStaff?.name || '—'}</b></div>
          <div className="print-paper-summary"><i/><i/><i/><i/></div>
          <div className="print-paper-grid">{Array.from({ length: 6 }, (_, row) => <div key={row}><b/><span/><span/><span/><span/><span/><span/><span/><span/></div>)}</div>
        </div>
        <p className="print-help">PDFを開いた後、ブラウザの印刷ボタンからプリンターを選択できます。</p>
      </section>
    </div>
  </>
}
