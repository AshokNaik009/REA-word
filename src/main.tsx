import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initializeDesktop } from './lib/desktop'
import './styles.css'
import './workspace.css'
import './dialogs.css'

const root = createRoot(document.getElementById('root')!)
void initializeDesktop().then(() => {
  root.render(<StrictMode><App /></StrictMode>)
}).catch(() => {
  root.render(<div className="loading-screen"><h1>Could not connect to the desktop host.</h1><p>Please restart Wordcraft. Your stored documents have not been changed.</p></div>)
})
