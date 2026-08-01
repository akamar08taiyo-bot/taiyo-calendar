import React, { useEffect, useRef, useState } from 'react'
import { Button, Icon } from './Icon'

export function InitialImportScreen({ onImport, onContinue, hasSavedData, busy, error }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [pickerError, setPickerError] = useState('')

  function selectFile(nextFile) {
    if (!nextFile) return
    const isExcelName = /\.(xls|xlsx|xlsm)$/i.test(nextFile.name)
    const isExcelType = /spreadsheetml|excel\.sheet\.macroenabled|application\/vnd\.ms-excel/i.test(nextFile.type)
    if (!isExcelName && !isExcelType) {
      setFile(null)
      setPickerError('Excelファイル（.xls／.xlsx／.xlsm）を貼り付けてください。')
      return
    }
    const pastedName = nextFile.type === 'application/vnd.ms-excel' ? '貼り付けた訪問履歴.xls' : '貼り付けた居宅カレンダー.xlsx'
    setFile(isExcelName ? nextFile : new File([nextFile], pastedName, { type: nextFile.type }))
    setPickerError('')
  }

  useEffect(() => {
    function handlePaste(event) {
      const pastedFile = [...(event.clipboardData?.files || [])][0]
        || [...(event.clipboardData?.items || [])].find((item) => item.kind === 'file')?.getAsFile()
      if (!pastedFile) {
        setPickerError('コピーしたExcelファイルをCtrl＋Vで貼り付けてください。')
        return
      }
      event.preventDefault()
      selectFile(pastedFile)
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [])

  return <main className="login-screen initial-import-screen">
    <section className="login-card initial-import-card" aria-labelledby="initial-import-title">
      <div className="login-brand">
        <span className="brand-symbol">居</span>
        <div><strong>居宅カレンダー</strong><span>居宅訪問記録・集計</span></div>
      </div>
      <div className="login-rule"/>
      <div className="login-heading">
        <h1 id="initial-import-title">最初にデータを取り込む</h1>
        <p>その月の居宅訪問履歴Excelを貼り付けてください。月・営業所・営業員はデータから自動判定します。</p>
      </div>
      <ol className="initial-import-steps" aria-label="初期設定の手順">
        <li className="active"><b>1</b><span>Excel取込</span></li>
        <li><b>2</b><span>営業所選択</span></li>
        <li><b>3</b><span>利用開始</span></li>
      </ol>
      <button
        type="button"
        className={`initial-file-picker ${file ? 'has-file' : ''} ${dragActive ? 'is-dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
        onDragLeave={(event) => { event.preventDefault(); setDragActive(false) }}
        onDrop={(event) => { event.preventDefault(); setDragActive(false); selectFile(event.dataTransfer.files?.[0]) }}
      >
        <Icon name={file ? 'check' : 'upload'} size={22}/>
        <strong>{file?.name || 'Excelファイルをここに貼り付け'}</strong>
        <span>{file ? `${(file.size / 1024).toFixed(0)} KB` : 'Ctrl＋V・ドラッグ＆ドロップ・クリックして選択'}</span>
        {!file && <small>.xls／.xlsx／.xlsm・25MB以下</small>}
      </button>
      <input ref={inputRef} className="visually-hidden" type="file" accept=".xls,.xlsx,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12" onChange={(event) => selectFile(event.target.files?.[0])}/>
      <div className="initial-import-note"><Icon name="lock" size={16}/><span>前月までのデータは保持します。同じ営業所・同じ月を再度取り込むと、その月だけ最新版へ更新します。</span></div>
      {pickerError && <div className="form-error" role="alert">{pickerError}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="initial-import-actions">
        <Button variant="primary" icon="upload" disabled={busy || !file} onClick={() => onImport(file)}>
          {busy ? 'データを確認しています…' : '取り込んで始める'}
        </Button>
        {hasSavedData && <Button icon="calendar" disabled={busy} onClick={onContinue}>保存済みデータで続ける</Button>}
      </div>
    </section>
  </main>
}
