import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// デプロイのたびにJSファイル名が変わるため、古いページを開いたままの端末で
// 新しく追加した機能（Excel解析など）を動的読み込みしようとすると失敗することがある。
// その場合は自動で1回だけ再読み込みし、最新版を取得し直す。
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
