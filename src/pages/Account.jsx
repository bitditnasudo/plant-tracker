import { useRef, useState } from 'react'
import { MapPin, LocateFixed, KeyRound, Download, Upload, Info, Database, Loader2, Leaf, Search, RotateCcw, Cloud, CloudOff, RefreshCw, BellRing } from 'lucide-react'
import { useStore, APP_VERSION } from '../lib/store.jsx'
import { searchCity, getBrowserLocation } from '../lib/weather.js'
import { Avatar } from '../components/PlantIcons.jsx'

// the little guy — pixel-art Claude critter for the footer
function ClaudeCritter(props) {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges" {...props}>
      <g fill="#2293F5">
        <rect x="52" y="0" width="16" height="40" />
        <rect x="40" y="12" width="40" height="16" />
        <rect x="97" y="9" width="10" height="27" />
        <rect x="89" y="17" width="26" height="10" />
        <rect x="77" y="30" width="9" height="9" />
      </g>
      <g fill="#CC785C">
        <rect x="15" y="45" width="90" height="60" />
        <rect x="0" y="82" width="15" height="16" />
        <rect x="105" y="82" width="15" height="16" />
        <rect x="23" y="105" width="8" height="15" />
        <rect x="38" y="105" width="8" height="15" />
        <rect x="74" y="105" width="8" height="15" />
        <rect x="89" y="105" width="8" height="15" />
      </g>
      <rect x="30" y="59" width="8" height="16" fill="#000" />
      <rect x="82" y="59" width="8" height="16" fill="#000" />
    </svg>
  )
}

export default function Account() {
  const { state, setProfile, setSettings, exportData, importData, sync, connectGoogle, disconnectGoogle, syncNow, calStatus, setCalendarReminders, runCalendarSync } = useStore()
  const [cityQuery, setCityQuery] = useState('')
  const [cityResults, setCityResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null)

  const findCity = async () => {
    if (!cityQuery.trim()) return
    setBusy(true)
    setMsg(null)
    try {
      const results = await searchCity(cityQuery.trim())
      setCityResults(results)
      if (results.length === 0) setMsg('No matching city found.')
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  const useGPS = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const loc = await getBrowserLocation()
      setSettings({ location: loc })
      setCityResults(null)
    } catch {
      setMsg('Could not get your position — search for your city instead.')
    } finally {
      setBusy(false)
    }
  }

  const doExport = async () => {
    const json = await exportData()
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `plant-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const doImport = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await importData(await file.text())
      setMsg('Backup restored ✓')
    } catch (err) {
      setMsg(`Import failed: ${err.message}`)
    }
  }

  return (
    <div className="main-content narrow">
      <div className="section-head"><h2>Account</h2></div>

      <div className="card center" style={{ paddingTop: 22 }}>
        <div style={{ width: 92, height: 92, margin: '0 auto 10px', borderRadius: '50%', overflow: 'hidden', border: '3px solid var(--olive)' }}>
          <Avatar style={{ width: '100%', height: '100%' }} />
        </div>
        <div className="field" style={{ maxWidth: 260, margin: '0 auto' }}>
          <input
            className="center" style={{ textAlign: 'center', fontWeight: 700 }}
            value={state.profile.name} placeholder="Your name"
            onChange={e => setProfile({ name: e.target.value })}
          />
        </div>
        <div className="field" style={{ maxWidth: 260, margin: '0 auto' }}>
          <input
            style={{ textAlign: 'center' }}
            value={state.profile.email} placeholder="email (optional)" type="email"
            onChange={e => setProfile({ email: e.target.value })}
          />
        </div>
      </div>

      <div className="card">
        <div className="row-list">
          <div className="row">
            <div className="row-icon"><MapPin size={18} /></div>
            <div className="grow">
              Location
              <small>{state.settings.location ? state.settings.location.label : 'Not set — needed for weather & rain'}</small>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={useGPS} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <LocateFixed size={14} />} GPS
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <div className="search-bar" style={{ flex: 1, marginBottom: 0 }}>
            <Search size={15} />
            <input
              placeholder="Search city…" value={cityQuery}
              onChange={e => setCityQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && findCity()}
            />
          </div>
          <button className="btn btn-mint btn-sm" onClick={findCity} disabled={busy || !cityQuery.trim()}>Find</button>
        </div>
        {cityResults && cityResults.map(r => (
          <button
            key={`${r.lat},${r.lon}`} className="chip" style={{ marginTop: 8, marginRight: 6 }}
            onClick={() => { setSettings({ location: r }); setCityResults(null); setCityQuery('') }}
          >
            <MapPin size={12} /> {r.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="row-list">
          <div className="row">
            <div className="row-icon" style={sync.connected ? { background: 'var(--beige)', color: 'var(--olive)' } : {}}>
              {sync.connected ? <Cloud size={18} /> : <CloudOff size={18} />}
            </div>
            <div className="grow">
              Google Drive sync
              <small>
                {sync.connected
                  ? `Connected — your plants and plan sync as a file in your Drive's "PLANT TRACKER" folder.${sync.lastSync ? ` Last sync: ${new Date(sync.lastSync).toLocaleTimeString()}` : ''}`
                  : 'Off — data lives only on this device. Connect to use the app on all your devices.'}
              </small>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {sync.connected ? (
            <>
              <button className="btn btn-mint btn-sm" onClick={syncNow} disabled={sync.syncing}>
                {sync.syncing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                {sync.syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={disconnectGoogle}>Disconnect</button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={connectGoogle}>
              <Cloud size={14} /> Connect Google Drive
            </button>
          )}
        </div>
        {sync.error && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{sync.error}</p>}

        {sync.connected && (
          <div className="row-list" style={{ marginTop: 6, borderTop: '1px solid var(--border)' }}>
            <div className="row" style={{ borderBottom: 'none' }}>
              <div className="row-icon"><BellRing size={18} /></div>
              <div className="grow">
                Calendar watering reminders
                <small>
                  {state.settings.calendarReminders
                    ? `On — each plant gets a 9:00 event in your Google Calendar (notification + email to your Google account).${calStatus.lastSync ? ` Updated ${new Date(calStatus.lastSync).toLocaleTimeString()}` : ''}`
                    : 'Off — get notified by Google Calendar on all your devices when a plant is due.'}
                </small>
              </div>
              <button
                className={`btn btn-sm ${state.settings.calendarReminders ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setCalendarReminders(!state.settings.calendarReminders)}
              >
                {state.settings.calendarReminders ? 'On' : 'Turn on'}
              </button>
            </div>
            {calStatus.error && (
              <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 2 }}>
                {calStatus.error}{' '}
                {calStatus.error.includes('permission') && (
                  <button className="btn btn-ghost btn-sm" onClick={connectGoogle}>Reconnect</button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={runCalendarSync}>Retry</button>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="row-list">
          <div className="row">
            <div className="row-icon"><KeyRound size={18} /></div>
            <div className="grow">
              Perenual API key
              <small>Optional — unlocks online search of 10,000+ species in Add Plant. Free key at perenual.com (Developer API).</small>
            </div>
          </div>
        </div>
        <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
          <input
            type="password" placeholder="sk-…" value={state.settings.perenualKey}
            onChange={e => setSettings({ perenualKey: e.target.value.trim() })}
          />
        </div>
      </div>

      <div className="card">
        <div className="row-list">
          <div className="row">
            <div className="row-icon"><KeyRound size={18} /></div>
            <div className="grow">
              Gemini API key
              <small>Optional — generates stylized 3D icons for your plants. Get a free key at aistudio.google.com/apikey (a Gemini Pro subscription alone doesn’t include API access).</small>
            </div>
          </div>
        </div>
        <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
          <input
            type="password" placeholder="AIza…" value={state.settings.geminiKey}
            onChange={e => setSettings({ geminiKey: e.target.value.trim() })}
          />
        </div>
      </div>

      <div className="card">
        <div className="row-list">
          <div className="row">
            <div className="row-icon"><Database size={18} /></div>
            <div className="grow">Your data<small>Stored only on this device. Back it up to a file.</small></div>
          </div>
          <div style={{ display: 'flex', gap: 8, paddingTop: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={doExport}><Download size={14} /> Export</button>
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}><Upload size={14} /> Import</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={doImport} />
          </div>
          <div className="row">
            <div className="row-icon"><Leaf size={18} /></div>
            <div className="grow">Plants tracked<small>{state.plants.length} plants · {state.plan.windows.length} windows · {state.plan.zones.length} zones</small></div>
          </div>
          <div className="row">
            <div className="row-icon"><RotateCcw size={18} /></div>
            <div className="grow">Setup guide<small>Replay the first-launch walkthrough (your data is kept)</small></div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSettings({ onboardingDone: false })}>Replay</button>
          </div>
          <div className="row">
            <div className="row-icon"><Info size={18} /></div>
            <div className="grow">Version<small>Plant Tracker v{APP_VERSION} · weather by Open-Meteo · plant care data bundled from open sources</small></div>
          </div>
        </div>
      </div>

      {msg && <p className="muted center" style={{ marginTop: 4 }}>{msg}</p>}

      <div className="center" style={{ padding: '20px 0 8px' }}>
        <ClaudeCritter style={{ width: 46, height: 46 }} />
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>made with the loving help of Claude</p>
      </div>
    </div>
  )
}
