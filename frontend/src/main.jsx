import { createRoot } from 'react-dom/client'
import { applyPreferences, readPreferences } from '@hrl/core-ui'
import '@hrl/core-ui/tokens.css'
import '@/app/estilos.css'
import App from './app/App.jsx'
import { CLAVE_PREFERENCIAS } from './app/tema.js'

/* Antes del primer render, para que no destelle el contraste o el tamaño de
   texto equivocado al cargar. */
applyPreferences(readPreferences(CLAVE_PREFERENCIAS))

createRoot(document.getElementById('root')).render(<App />)
