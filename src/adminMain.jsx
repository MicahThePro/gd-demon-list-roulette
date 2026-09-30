import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AdminPage from './pages/AdminPage'
import './App.css'

/* The moderation panel as its own entry point, mounted at /admin.
 *
 * It is a separate bundle rather than a route inside the main app on purpose.
 * GitHub Pages is a static host with no server to rewrite /admin into the main
 * index.html, so a client-side route 404s there. Its own directory with its
 * own index.html is the one shape a static host will actually serve, and it
 * keeps the panel's code out of the bundle every ordinary player downloads. */
/* The site lives in a repository subpath on GitHub Pages
   (/gd-list-roulette/), so "back to the site" strips the trailing admin/
   segment from the current path rather than jumping to the domain root, which
   on a project page is a 404 of its own. Derived from location rather than
   import.meta.env.BASE_URL, because the configured base is "./" for the main
   page's assets and would resolve here as /admin/ instead. */
const siteRoot = () => window.location.pathname.replace(/\/?admin\/?$/, '/') || '/'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AdminPage onExit={() => window.location.assign(siteRoot())} />
  </StrictMode>,
)
