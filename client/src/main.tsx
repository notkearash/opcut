import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import logoUrl from './logo'

const favicon = document.querySelector<HTMLLinkElement>('#app-icon')
if (favicon) favicon.href = logoUrl

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
