import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

registerSW({ immediate: true })

// No <StrictMode>: in dev it mounts every effect twice, which doubles Google Maps loads and autocomplete widgets (billable).
createRoot(document.getElementById('root')!).render(<App />)
