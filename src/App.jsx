import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Home, Map, User, Plus } from 'lucide-react'
import { useState, useRef, useLayoutEffect } from 'react'
import { StoreProvider, useStore } from './lib/store.jsx'
import { Sprout } from './components/PlantIcons.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Dashboard from './pages/Dashboard.jsx'
import PlanView from './pages/PlanView.jsx'
import Account from './pages/Account.jsx'
import AuthCallback from './pages/AuthCallback.jsx'
import { AddPlantModal } from './components/AddPlantModal.jsx'

// The active-tab lens. One element slides between tabs instead of each tab
// growing its own pill, so the selection reads as a single object moving —
// the part of Liquid Glass that is motion, not refraction. The edge on the
// side of travel leads and the trailing edge follows a beat later, so the
// lens stretches toward the new tab and settles back to its width.
function useNavLens(navRef, activeRef, key) {
  const [lens, setLens] = useState(null)
  const prev = useRef(null)

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = (animate) => {
      const el = activeRef.current
      // No active tab (an unknown route) — nothing to place. In the sidebar
      // layout this still measures, but CSS keeps the lens hidden there.
      if (!el) { prev.current = null; setLens(null); return }
      // Centre from the rects (immune to the pill's scale-in), size from the
      // offsets (untransformed), both relative to the nav's padding box.
      const r = el.getBoundingClientRect(), n = nav.getBoundingClientRect()
      const w = el.offsetWidth, h = el.offsetHeight
      const left = r.left + r.width / 2 - n.left - nav.clientLeft - w / 2
      const top = r.top + r.height / 2 - n.top - nav.clientTop - h / 2
      const right = nav.clientWidth - (left + w)
      const from = prev.current
      const dir = animate && from ? Math.sign(left - from.left) : 0
      prev.current = { left, right }
      setLens({ left, right, top, height: h, dir })
    }
    measure(true)
    // Width changes (rotation, font swap) re-place the lens without the stretch.
    const ro = new ResizeObserver(() => measure(false))
    ro.observe(nav)
    return () => ro.disconnect()
  }, [key])

  return lens
}

function BottomNav({ onFab }) {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname
  const navRef = useRef(null)
  const activeRef = useRef(null)

  const items = [
    { icon: Home, label: 'Dashboard', to: '/' },
    { icon: Map,  label: 'Plan',      to: '/plan' },
    { icon: User, label: 'Account',   to: '/account' },
  ]

  const lens = useNavLens(navRef, activeRef, path)
  const lensStyle = lens && {
    left: lens.left, right: lens.right, top: lens.top, height: lens.height,
    // dir 1 = moving right: the right edge leads. 0 = no stretch, no delay.
    '--lag-l': lens.dir > 0 ? '.06s' : '0s',
    '--lag-r': lens.dir < 0 ? '.06s' : '0s',
  }

  return (
    <nav className="bottom-nav" ref={navRef}>
      {/* sidebar-only brand header (hidden on phones) */}
      <div className="nav-brand">
        <div className="nav-brand-icon"><Sprout /></div>
        <span>Plant Tracker</span>
      </div>
      <div className="nav-lens" style={lensStyle || { display: 'none' }} aria-hidden="true" />
      {items.map(({ icon: Icon, label, to }) => {
        const active = path === to
        return (
          <button key={to} onClick={() => navigate(to)} className="nav-item" aria-current={active ? 'page' : undefined}>
            {active
              ? <div className="nav-pill" ref={activeRef}><Icon size={14} /><span>{label}</span></div>
              : <><Icon size={20} /><span className="nav-label">{label}</span></>
            }
          </button>
        )
      })}
      {/* The primary action rides INSIDE the bar, last, as a pill — it is an
          action, not a destination, so it closes the row rather than joining
          the tabs. It used to float above the nav, which needed
          right: max(18px, calc(50% - var(--shell-w)/2 + 18px)) to stay pinned
          to the app column AND still covered the last plant card, which is why
          .main-content reserved 176px at the bottom instead of 104px.
          Three tabs plus one pill fits at 375px, so the labels stay. */}
      <button className="fab" aria-label="Add plant" onClick={onFab}>
        <Plus size={20} /><span className="fab-label">Add plant</span>
      </button>
    </nav>
  )
}

function AppShell() {
  const { state } = useStore()
  const [showAdd, setShowAdd] = useState(false)

  if (!state.settings.onboardingDone) return <Onboarding />

  return (
    <div className="app-shell">
      <div className="bg-blobs" />
      <Routes>
        <Route path="/"        element={<Dashboard />} />
        <Route path="/plan"    element={<PlanView />} />
        <Route path="/account" element={<Account />} />
        <Route path="*"        element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav onFab={() => setShowAdd(true)} />
      {showAdd && <AddPlantModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  )
}
