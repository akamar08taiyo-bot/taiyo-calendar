import React, { useEffect, useState } from 'react'
import { Button, Icon } from './Icon'

export function Modal({ title, subtitle, children, onClose, wide = false }) {
  useEffect(() => {
    const handler = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header className="modal-header"><div><span>{subtitle}</span><h2 id="dialog-title">{title}</h2></div><button className="icon-button" aria-label="閉じる" onClick={onClose}><Icon name="close"/></button></header>{children}</section></div>
}

export function ImportDialog({ state, onFileSelect, onPreview, onConfirm, onClose }) {
  return <Modal title="Excelデータを取り込む" subtitle="内容確認後に資料を更新" onClose={onClose}>
    <div className="modal-body">
      <div className="info-box"><Icon name="lock"/><span>前月までの記録は保持されます。同じ営業所・同じ月の再取込では、その月の内容だけを最新版へ置き換えます。</span></div>
      {!state.preview && <label className={`excel-dropzone ${state.file ? 'has-file' : ''}`}>
        <input type="file" accept=".xls,.xlsx,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12" onChange={(event) => onFileSelect(event.target.files?.[0])}/>
        <Icon name="upload" size={28}/>
        <strong>{state.file ? state.file.name : 'Excelファイルを選択'}</strong>
        <span>{state.file ? `${(state.file.size / 1024).toLocaleString('ja-JP', { maximumFractionDigits: 0 })} KB` : '.xls／.xlsx／.xlsm・25MB以下'}</span>
      </label>}
      {state.loading && <div className="dialog-loading compact"><span className="spinner"/><strong>Excelの内容を検証しています…</strong></div>}
      {state.error && <div className="form-error" role="alert">{state.error}</div>}
      {state.preview && <><div className="file-row"><Icon name="upload"/><div><strong>{state.preview.file?.name || '公式Excel'}</strong><span>{state.preview.officeNames?.join('、')}・{state.preview.months?.join('、')}</span></div><i>検証済み</i></div><div className="diff-grid">
        <Diff label="追加" value={state.preview.diff.added}/><Diff label="更新" value={state.preview.diff.updated}/><Diff label="非表示" value={state.preview.diff.archived}/><Diff label="訪問行" value={state.preview.diff.visitRows}/>
      </div>{state.preview.diff.missing > 0 && !state.preview.diff.archiveMissing && <div className="info-box import-retained"><Icon name="info"/><span>ファイルにない既存事業者 {state.preview.diff.missing}件は保持されます。</span></div>}</>}
    </div>
    <footer className="modal-actions"><Button onClick={onClose}>キャンセル</Button>{!state.preview ? <Button variant="primary" icon="refresh" disabled={state.loading || !state.file} onClick={onPreview}>内容を確認</Button> : <Button variant="primary" icon="check" disabled={state.loading} onClick={onConfirm}>取り込んで更新</Button>}</footer>
  </Modal>
}

function Diff({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div> }

export function PdfDialog({ month, staffName, loading, onDownload, onClose }) {
  const [year, monthNumber] = month.split('-')
  return <Modal title="居宅カレンダーPDF" subtitle="A4横向き・31日表示" onClose={onClose}>
    <div className="modal-body"><div className="pdf-preview"><div><strong>居宅カレンダー</strong><span>{year}年{Number(monthNumber)}月</span></div><p>出力範囲：{staffName || '営業所全体'}</p><div className="paper-lines">{Array.from({ length: 6 }, (_, index) => <i key={index}/>)}</div></div><div className="info-box"><Icon name="info"/><span>絞り込み条件を反映し、個人は居宅カレンダー、営業所全体は居宅名を含まない営業員別集計をA4横向きPDFで保存します。</span></div></div>
    <footer className="modal-actions"><Button onClick={onClose}>閉じる</Button><Button variant="primary" icon="pdf" disabled={loading} onClick={onDownload}>{loading ? '生成中…' : 'PDFを保存'}</Button></footer>
  </Modal>
}

export function HiddenDialog({ providers, loading, canDelete, onRestore, onDelete, onClose }) {
  const [challenge, setChallenge] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  async function requestDelete(provider) {
    const result = await onDelete(provider, null)
    if (result) { setChallenge({ ...result, provider }); setConfirmText('') }
  }
  async function confirmDelete() {
    await onDelete(challenge.provider, { challengeId: challenge.challengeId, confirmText })
    setChallenge(null); setConfirmText('')
  }
  return <Modal title="非表示・復元" subtitle="訪問履歴は保持されます" onClose={onClose} wide>
    <div className="modal-body">
      {loading && <div className="dialog-loading"><span className="spinner"/>読み込み中…</div>}
      {!loading && !providers.length && <div className="empty-dialog"><Icon name="check" size={28}/><strong>非表示の事業者はありません</strong></div>}
      <div className="hidden-list">{providers.map((provider) => <div key={provider.id}><div><strong>{provider.name}</strong><span>{provider.staffName}・{provider.hiddenReason === 'source_missing' ? 'Excelから消えたため非表示' : '手動で非表示'}</span></div><Button onClick={() => onRestore(provider)}>復元</Button>{canDelete && <Button variant="danger" onClick={() => requestDelete(provider)}>完全削除</Button>}</div>)}</div>
      {challenge && <div className="danger-confirm"><strong>完全削除は元に戻せません</strong><p>監査記録を残して、事業者と訪問履歴を完全に削除します。確認のため事業者名を入力してください。</p><code>{challenge.provider.name}</code><input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoFocus/><Button variant="danger" disabled={confirmText !== challenge.provider.name} onClick={confirmDelete}>完全削除を実行</Button></div>}
    </div><footer className="modal-actions"><Button onClick={onClose}>閉じる</Button></footer>
  </Modal>
}

export function SettingsDialog({ settings, auditLogs, loading, onSave, onClose }) {
  const [form, setForm] = useState({ retentionYears: settings?.retentionYears || 5 })
  useEffect(() => setForm({ retentionYears: settings?.retentionYears || 5 }), [settings])
  return <Modal title="システム設定" subtitle="system_admin のみ" onClose={onClose} wide>
    <div className="modal-body settings-grid">
      <section><h3>訪問記録の保持期間</h3><label>保持年数<select value={form.retentionYears} onChange={(event) => setForm({ ...form, retentionYears: Number(event.target.value) })}>{[5,6,7,8,9,10].map((year) => <option key={year} value={year}>{year}年</option>)}</select></label><div className="info-box"><Icon name="info"/><span>Excel取込はカレンダー画面から実行します。最低5年間の訪問記録を保持します。</span></div><Button variant="primary" disabled={loading} onClick={() => onSave(form)}>設定を保存</Button></section>
      <section className="audit-section"><h3>監査記録（最新200件）</h3><div className="audit-list">{auditLogs.map((log) => <div key={log.id}><span>{new Date(log.createdAt).toLocaleString('ja-JP')}</span><strong>{log.actorName}</strong><code>{log.action}</code></div>)}</div></section>
    </div><footer className="modal-actions"><Button onClick={onClose}>閉じる</Button></footer>
  </Modal>
}
