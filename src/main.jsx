import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'   // the shared Vantarco kit (+ theme.css)
import './app.css'     // this app's domain CSS — must load after the kit

/* Behave like an app, not a web page.
 *
 * iOS deliberately ignores `user-scalable=no` in the viewport meta, so a pinch
 * would still zoom the whole layout and then let you drag it around. These
 * Safari-only gesture events are the one hook that actually suppresses it.
 *
 * The template ships this OFF, because removing pinch-zoom is a real
 * accessibility trade-off. THIS app turns it on: the floor plan runs its own
 * pinch-to-zoom on pointer events, and without the suppression the page zooms
 * underneath the plan while the plan zooms too. Desktop browser zoom (⌘/ctrl +)
 * is deliberately left alone.
 */
const LOCK_PINCH_ZOOM = true

if (LOCK_PINCH_ZOOM) {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, e => e.preventDefault(), { passive: false })
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
