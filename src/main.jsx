import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BannedNotice } from './components/BannedNotice.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    {/* Covers this page and, more to the point, the archived builds under
        versions/, which load the same main bundle. The real block is the server
        refusing every API call; this only stops the page sitting there. */}
    <BannedNotice />
  </StrictMode>,
)
