import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Home, Map, User, Plus } from 'lucide-react'
import { useState } from 'react'
import { StoreProvider, useStore } from './lib/store.jsx'
import { Sprout } from './components/PlantIcons.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Dashboard from './pages/Dashboard.jsx'
import PlanView from './pages/PlanView.jsx'
import Account from './pages/Account.jsx'
import AuthCallback from './pages/AuthCallback.jsx'
import { AddPlantModal } from './components/AddPlantModal.jsx'

function BottomNav({ onFab }) {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname

  const items = [
    { icon: Home, label: 'Dashboard', to: '/' },
    { icon: Map,  label: 'Plan',      to: '/plan' },
    { icon: User, label: 'Account',   to: '/account' },
  ]

  return (
    <nav className="bottom-nav">
      {/* sidebar-only brand header (hidden on phones) */}
      <div className="nav-brand">
        <div className="nav-brand-icon"><Sprout /></div>
        <span>Plant Tracker</span>
      </div>
      {items.map(({ icon: Icon, label, to }) => {
        const active = path === to
        return (
          <button key={to} onClick={() => navigate(to)} className="nav-item">
            {active
              ? <div className="nav-pill"><Icon size={14} /><span>{label}</span></div>
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
