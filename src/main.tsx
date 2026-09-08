import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`))
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </React.StrictMode>,
)
