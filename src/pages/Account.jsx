import { useRef, useState } from 'react'
import { MapPin, LocateFixed, KeyRound, Download, Upload, Info, Database, Loader2, Leaf, Search, RotateCcw, Cloud, CloudOff, RefreshCw, BellRing, Wand2, Wind } from 'lucide-react'
import { useStore, APP_VERSION, BUILD_COMMIT, BUILD_DATE } from '../lib/store.jsx'
import { searchCity, getBrowserLocation } from '../lib/weather.js'
import { generatePlantIcon } from '../lib/gemini.js'
import { getCatalogPlant } from '../lib/catalog.js'
import { resolveAppearance } from '../lib/potOptions.js'
import { Avatar } from '../components/PlantIcons.jsx'
/* The critter used to be inlined here and in Budget's own copy, and the two had
   already drifted in how the caption was styled. One copy, in the kit. */
import { Signature } from '../components/Signature.jsx'

export default function Account() {
  const { state, icons, saveIcon, setProfile, setSettings, exportData, importData, sync, connectGoogle, disconnectGoogle, syncNow, calStatus, setCalendarReminders, runCalendarSync, backfill, backfillClassifications } = useStore()
  const [regenBusy, setRegenBusy] = useState(false)
  const [regenMsg, setRegenMsg] = useState(null)

  const regenerateAllIcons = async () => {
    const targets = state.plants.filter(p => icons[p.id])
    if (targets.length === 0) {
      setRegenMsg('No generated icons yet — create them from each plant’s card first.')
      return
    }
    setRegenBusy(true)
    let done = 0
    let failed = 0
    for (const p of targets) {
      const cat = getCatalogPlant(p.catalogId)
      if (!cat) continue
      try {
        const a = resolveAppearance(p, cat)
        const url = await generatePlantIcon(state.settings.geminiKey, {
          name: cat.name, details: cat.details,
          material: a.material, potColor: a.color, bloom: a.bloom,
        })
        await saveIcon(p.id, url)
        done++
      } catch {
        failed++
      }
      setRegenMsg(`Regenerating… ${done + failed}/${targets.length}`)
    }
    setRegenMsg(`Done — ${done} icon${done === 1 ? '' : 's'} regenerated${failed ? `, ${failed} failed` : ''}.`)
    setRegenBusy(false)
  }
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
    <div className="main-content is-narrow">
      <div className="section-head"><h2>Account</h2></div>

      <div className="card center profile-card">
        <div className="avatar-lg"><Avatar /></div>
        <div className="field field-narrow">
          <input
            className="input-name"
            value={state.profile.name} placeholder="Your name"
            onChange={e => setProfile({ name: e.target.value })}
          />
        </div>
        <div className="field field-narrow">
          <input
            className="input-center"
            value={state.profile.email} placeholder="email (optional)" type="email"
            onChange={e => setProfile({ email: e.target.value })}
          />
        </div>
      </div>

      <div className="card">
        <div>
          <div className="list-row">
            <div className="row-icon"><MapPin size={18} /></div>
            <div className="grow">
              Location
              <small>{state.settings.location ? state.settings.location.label : 'Not set — needed for weather & rain'}</small>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={useGPS} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <LocateFixed size={14} />} GPS
            </button>
          </div>
        </div>
        <div className="row-actions">
          <div className="search-bar search-bar-inline">
            <Search size={15} />
            <input
              placeholder="Search city…" value={cityQuery}
              onChange={e => setCityQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && findCity()}
            />
          </div>
          <button className="btn btn-soft btn-sm" onClick={findCity} disabled={busy || !cityQuery.trim()}>Find</button>
        </div>
        {cityResults && (
          <div className="result-chips">
            {cityResults.map(r => (
              <button
                key={`${r.lat},${r.lon}`} className="chip"
                onClick={() => { setSettings({ location: r }); setCityResults(null); setCityQuery('') }}
              >
                <MapPin size={12} /> {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div>
          <div className="list-row">
            <div className="row-icon">
              {sync.connected ? <Cloud size={18} /> : <CloudOff size={18} />}
            </div>
            <div className="grow">
              Google Drive sync
              <small>
                {sync.connected
                  ? `Connected — your plants and plan sync as a file in your Drive's "PLANT TRACKER" folder.${sync.lastSync ? ` Last sync: ${new Date(sync.lastSync).toLocaleTimeString()}` : ''}`
                  : sync.lastSync
                    ? `Session expired — reconnect to resume sync. Your data is safe on this device. Last sync: ${new Date(sync.lastSync).toLocaleTimeString()}`
                    : 'Off — data lives only on this device. Connect to use the app on all your devices.'}
              </small>
            </div>
          </div>
        </div>
        <div className="row-actions">
          {sync.connected ? (
            <>
              <button className="btn btn-soft btn-sm" onClick={syncNow} disabled={sync.syncing}>
                {sync.syncing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                {sync.syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={disconnectGoogle}>Disconnect</button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={connectGoogle}>
              <Cloud size={14} /> {sync.lastSync ? 'Reconnect Google Drive' : 'Connect Google Drive'}
            </button>
          )}
        </div>
        {sync.error && <p className="note-danger">{sync.error}</p>}

        {sync.connected && (
          <div className="row-group-divided">
            <div className="list-row">
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
                className={`btn btn-sm ${state.settings.calendarReminders ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCalendarReminders(!state.settings.calendarReminders)}
              >
                {state.settings.calendarReminders ? 'On' : 'Turn on'}
              </button>
            </div>
            {calStatus.error && (
              <p className="note-danger">
                {calStatus.error}{' '}
                {calStatus.error.includes('permission') && (
                  <button className="btn btn-secondary btn-sm" onClick={connectGoogle}>Reconnect</button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={runCalendarSync}>Retry</button>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div>
          <div className="list-row">
            <div className="row-icon"><KeyRound size={18} /></div>
            <div className="grow">
              Perenual API key
              <small>Optional — unlocks online search of 10,000+ species in Add Plant. Free key at perenual.com (Developer API).</small>
            </div>
          </div>
        </div>
        <div className="field field-inline">
          <input
            type="password" placeholder="sk-…" value={state.settings.perenualKey}
            onChange={e => setSettings({ perenualKey: e.target.value.trim() })}
          />
        </div>
        <div className="row-group-divided">
          <div className="list-row">
            <div className="row-icon"><Wind size={18} /></div>
            <div className="grow">
              Wind classification
              <small>
                Runs automatically a few seconds after you add plants, covering every plant on
                your dashboard that doesn’t have one yet.
                {state.settings.classificationsBackfilledAt &&
                  ` Last run: ${new Date(state.settings.classificationsBackfilledAt).toLocaleString()}`}
              </small>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => backfillClassifications({ force: true })} disabled={backfill.running}>
              {backfill.running ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              {backfill.running ? `${backfill.done}/${backfill.total}` : 'Redo all'}
            </button>
          </div>
        </div>
        {backfill.results.length > 0 && (
          <div className="muted backfill-log">
            {backfill.results.map((r, i) => (
              <div key={`${r.name}-${i}`}>
                {r.name}: <b>{r.cls}</b> <span className="backfill-via">· {r.via}</span>
              </div>
            ))}
          </div>
        )}
        {backfill.error && <p className="note-danger">{backfill.error}</p>}
      </div>

      <div className="card">
        <div>
          <div className="list-row">
            <div className="row-icon"><KeyRound size={18} /></div>
            <div className="grow">
              Gemini API key
              <small>Optional — generates stylized 3D icons for your plants. Get a free key at aistudio.google.com/apikey (a Gemini Pro subscription alone doesn’t include API access).</small>
            </div>
          </div>
        </div>
        <div className="field field-inline">
          <input
            type="password" placeholder="AIza…" value={state.settings.geminiKey}
            onChange={e => setSettings({ geminiKey: e.target.value.trim() })}
          />
        </div>
        {state.settings.geminiKey && (
          <div className="row-actions">
            <button className="btn btn-secondary btn-sm" onClick={regenerateAllIcons} disabled={regenBusy}>
              {regenBusy ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />}
              {regenBusy ? 'Regenerating…' : 'Regenerate all icons (new style)'}
            </button>
            {regenMsg && <p className="field-note">{regenMsg}</p>}
          </div>
        )}
      </div>

      <div className="card">
        <div>
          <div className="list-row">
            <div className="row-icon"><Database size={18} /></div>
            <div className="grow">Your data<small>Stored only on this device. Back it up to a file.</small></div>
          </div>
          <div className="row-actions">
            <button className="btn btn-secondary btn-sm" onClick={doExport}><Download size={14} /> Export</button>
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()}><Upload size={14} /> Import</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={doImport} />
          </div>
          <div className="list-row">
            <div className="row-icon"><Leaf size={18} /></div>
            <div className="grow">Plants tracked<small>{state.plants.length} plants · {state.plan.windows.length} windows · {state.plan.zones.length} zones</small></div>
          </div>
          <div className="list-row">
            <div className="row-icon"><RotateCcw size={18} /></div>
            <div className="grow">Setup guide<small>Replay the first-launch walkthrough (your data is kept)</small></div>
            <button className="btn btn-secondary btn-sm" onClick={() => setSettings({ onboardingDone: false })}>Replay</button>
          </div>
          <div className="list-row">
            <div className="row-icon"><Info size={18} /></div>
            <div className="grow">
              Version <b>{APP_VERSION}</b>
              <small>
                Release {APP_VERSION.split('.')[1]} · build {BUILD_COMMIT}
                {BUILD_DATE && ` · ${new Date(BUILD_DATE).toLocaleDateString()}`}
                <br />weather by Open-Meteo · care data from Perenual and bundled open sources
              </small>
            </div>
          </div>
        </div>
      </div>

      {msg && <p className="muted center">{msg}</p>}

      <Signature />
    </div>
  )
}
