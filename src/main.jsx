import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

/* Behave like an app, not a web page.
 * iOS deliberately ignores user-scalable=no in the viewport meta, so pinching
 * would still zoom and then let you drag the whole layout around. These
 * Safari-only gesture events are the one hook that actually suppresses it.
 * The floor plan runs its own pinch-to-zoom on pointer events, which is
 * unaffected — in fact this stops the page zooming underneath it.
 * Desktop browser zoom (⌘/ctrl +) is deliberately left alone.
 */
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, e => e.preventDefault(), { passive: false })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
