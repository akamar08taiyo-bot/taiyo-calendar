import React, { useMemo, useState } from 'react'
import { Button, Icon } from './Icon'

// ポータル(taiyo-portal)でログイン済みなら、その営業所を初期選択に使う（同一オリジンのlocalStorageを参照するだけ）
function portalSessionOfficeName() {
  try {
    const raw = localStorage.getItem('taiyo_portal_session')
    const session = raw ? JSON.parse(raw) : null
    return session && session.office ? session.office : null
  } catch {
    return null
  }
}

export function LoginScreen({ offices, onLogin, busy, error }) {
  const portalOfficeName = portalSessionOfficeName()
  const portalOffice = portalOfficeName ? offices.find((office) => office.name === portalOfficeName) : null
  const defaultOffice = portalOffice || offices.find((office) => office.staff.length > 0) || offices[0]
  const [form, setForm] = useState({ officeId: defaultOffice?.id || '', staffId: defaultOffice?.staff[0]?.id || '', officePassword: '', pin: '' })
  const selectedOffice = useMemo(() => offices.find((office) => office.id === form.officeId) || offices[0], [offices, form.officeId])
  function setOffice(officeId) {
    const office = offices.find((item) => item.id === officeId)
    setForm((current) => ({ ...current, officeId, staffId: office?.staff[0]?.id || '' }))
  }
  return <main className="login-screen">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand"><span className="brand-symbol">れ</span><div><strong>スマートれん太</strong><span>居宅訪問記録・集計</span></div></div>
      <div className="login-rule"/>
      <div className="login-heading"><h1 id="login-title">ログイン</h1><p>営業所と営業員を選び、認証情報を入力してください。</p></div>
      {portalOffice && <div className="login-portal-hint"><Icon name="check" size={16}/>業務アプリポータルの営業所選択（{portalOfficeName}）を引き継ぎました。</div>}
      <form className="login-form" onSubmit={(event) => { event.preventDefault(); onLogin(form) }}>
        <label>営業所<select value={form.officeId} onChange={(event) => setOffice(event.target.value)}>{offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}</select></label>
        <label>営業員<select value={form.staffId} onChange={(event) => setForm({ ...form, staffId: event.target.value })}>{(selectedOffice?.staff || []).map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select></label>
        <label>営業所パスワード<input type="password" autoComplete="current-password" value={form.officePassword} onChange={(event) => setForm({ ...form, officePassword: event.target.value })}/></label>
        <label>個人PIN<input type="password" inputMode="numeric" autoComplete="one-time-code" value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value })}/></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <Button type="submit" variant="primary" disabled={busy || !form.staffId}>{busy ? '確認中…' : 'ログイン'}</Button>
      </form>
      <div className="login-note"><Icon name="lock" size={16}/><span>PINはハッシュ化して保存されます。5回失敗すると15分間ロックされます。</span></div>
    </section>
  </main>
}
