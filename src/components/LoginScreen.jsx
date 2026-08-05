import React, { useState } from 'react'
import { Button, Icon } from './Icon'

// 業務アプリポータル(taiyo-portal)でログイン時に選んだ営業所名を引き継ぐ。
// 該当営業所のデータ(Excel取込済み)がこの端末に既にある場合のみ有効。
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
  const [form, setForm] = useState({ officeId: defaultOffice?.id || '' })
  return <main className="login-screen">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand"><span className="brand-symbol">営</span><div><strong>営業管理</strong><span>居宅訪問記録・集計</span></div></div>
      <div className="login-rule"/>
      <div className="login-heading"><h1 id="login-title">営業所を選択</h1><p>利用する営業所を選んで居宅カレンダーを開きます。</p></div>
      <form className="login-form" onSubmit={(event) => { event.preventDefault(); onLogin(form) }}>
        <label>営業所<select value={form.officeId} onChange={(event) => setForm({ officeId: event.target.value })}>{offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}</select></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <Button type="submit" variant="primary" disabled={busy || !form.officeId}>{busy ? '開いています…' : 'この営業所で開く'}</Button>
      </form>
      {portalOffice && <div className="login-note"><Icon name="check" size={16}/><span>業務アプリポータルの営業所選択（{portalOfficeName}）を引き継ぎました。</span></div>}
      <div className="login-note"><Icon name="lock" size={16}/><span>PIN・パスワードは不要です。データはこのブラウザー内に保存されます。</span></div>
    </section>
  </main>
}
