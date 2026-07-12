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
          <button key={to} onClick={() => navigate(to)}
            className={`nav-item${active ? ' active' : ''}`}>
            {active
              ? <div className="nav-pill"><Icon size={14} /><span>{label}</span></div>
              : <><Icon size={20} /><span className="nav-label">{label}</span></>
            }
          </button>
        )
      })}
      {/* sidebar-only add button (the floating FAB covers phones) */}
      <button className="nav-fab" onClick={onFab}>
        <Plus size={18} /><span>Add plant</span>
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
      <button className="fab" aria-label="Add plant" onClick={() => setShowAdd(true)}>
        <Plus size={26} />
      </button>
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
