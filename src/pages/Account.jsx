import { useRef, useState } from 'react'
import { MapPin, LocateFixed, KeyRound, Download, Upload, Info, Database, Loader2, Leaf, Search, RotateCcw, Cloud, CloudOff, RefreshCw, BellRing, Wand2, Wind, Eye, EyeOff, Plane, History } from 'lucide-react'
import { format, formatISO, parseISO } from 'date-fns'
import { useStore, APP_VERSION, BUILD_COMMIT, BUILD_DATE } from '../lib/store.jsx'
import { searchCity, getBrowserLocation } from '../lib/weather.js'
import { generatePlantIcon } from '../lib/gemini.js'
import { getCatalogPlant } from '../lib/catalog.js'
import { resolveAppearance } from '../lib/potOptions.js'
import { Avatar } from '../components/PlantIcons.jsx'
import { ConfirmSheet, Sheet } from '../components/Sheet.jsx'
/* The critter used to be inlined here and in Budget's own copy, and the two had
   already drifted in how the caption was styled. One copy, in the kit. */
import { Signature } from '../components/Signature.jsx'

const timeLabel = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 06:00 … 22:00

function KeyField({ value, placeholder, onChange, label }) {
  const [show, setShow] = useState(false)
  return (
    <div className="field field-inline">
      <div className="inline-actions">
        <input
          type={show ? 'text' : 'password'} placeholder={placeholder} value={value} aria-label={label}
          autoComplete="off" spellCheck={false}
          onChange={e => onChange(e.target.value.trim())}
        />
        <button type="button" className="btn btn-secondary btn-sm" aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(v => !v)}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  )
}

function syncLine(sync) {
  if (!sync.connected) {
    return sync.lastSync
      ? `Session expired — reconnect to resume sync. Your data is safe on this device. Last sync: ${timeLabel(sync.lastSync)}`
      : 'Off — data lives only on this device. Connect to use the app on all your devices.'
  }
  const parts = ['Connected — your plants and plan sync as a file in your Drive’s “PLANT TRACKER” folder.']
  if (sync.offline) parts.push('Offline right now — changes are kept on this device and upload when you’re back online.')
  else if (sync.syncing) parts.push('Syncing…')
  else if (sync.pending) parts.push('Changes waiting to upload.')
  if (sync.lastSync) parts.push(`Last sync: ${timeLabel(sync.lastSync)}.`)
  return parts.join(' ')
}

export default function Account() {
  const {
    state, icons, saveIcon, setProfile, setSettings, exportData, readBackup, importData, sync, connectGoogle,
    disconnectGoogle, syncNow, calStatus, setCalendarReminders, runCalendarSync, backfill, backfillClassifications,
    listSnapshots, downloadSnapshot,
  } = useStore()
  const [regenBusy, setRegenBusy] = useState(false)
  const [regenMsg, setRegenMsg] = useState(null)
  const [pendingImport, setPendingImport] = useState(null)   // {data, savedAt, plants, source}
  const [snapshots, setSnapshots] = useState(null)
  const [snapBusy, setSnapBusy] = useState(false)
  const s = state.settings

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
        const url = await generatePlantIcon(s.geminiKey, {
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

  // reading the file only summarises it; nothing changes until you confirm
  const doImport = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPendingImport({ ...readBackup(await file.text()), source: file.name })
    } catch (err) {
      setMsg(`Import failed: ${err.message}`)
    }
  }

  const openSnapshots = async () => {
    setSnapBusy(true)
    setMsg(null)
    try {
      setSnapshots(await listSnapshots())
    } catch (e) {
      setMsg(`Couldn’t list Drive snapshots: ${e.message}`)
    } finally {
      setSnapBusy(false)
    }
  }
  const pickSnapshot = async f => {
    setSnapBusy(true)
    try {
      const backup = readBackup(await downloadSnapshot(f.id))
      setSnapshots(null)
      setPendingImport({ ...backup, source: `Drive snapshot of ${format(parseISO(f.name.slice(14, 24)), 'EEE d MMM')}` })
    } catch (e) {
      setMsg(`Couldn’t read that snapshot: ${e.message}`)
    } finally {
      setSnapBusy(false)
    }
  }

  const today = formatISO(new Date(), { representation: 'date' })
  const trip = s.trip

  return (
    <div className="main-content is-narrow">
      <div className="section-head"><h2>Account</h2></div>

      <div className="card center profile-card">
        <div className="avatar-lg"><Avatar /></div>
        <div className="field field-narrow">
          <label htmlFor="acc-name">Your name</label>
          <input
            id="acc-name" className="input-name"
            value={state.profile.name} placeholder="Your name"
            onChange={e => setProfile({ name: e.target.value })}
          />
        </div>
        <div className="field field-narrow">
          <label htmlFor="acc-email">Email (optional)</label>
          <input
            id="acc-email" className="input-center"
            value={state.profile.email} placeholder="you@example.com" type="email"
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
              <small>{s.location ? s.location.label : 'Not set — needed for weather & rain'}</small>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={useGPS} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <LocateFixed size={14} />} GPS
            </button>
          </div>
        </div>
        <div className="inline-actions">
          <div className="search-bar search-bar-inline">
            <Search size={15} />
            <input
              placeholder="Search city…" value={cityQuery} aria-label="Search city"
              onChange={e => setCityQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && findCity()}
            />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={findCity} disabled={busy || !cityQuery.trim()}>Find</button>
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
              {sync.connected && !sync.offline ? <Cloud size={18} /> : <CloudOff size={18} />}
            </div>
            <div className="grow">
              Google Drive sync
              <small>{syncLine(sync)}</small>
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
                Calendar reminders
                <small>
                  {s.calendarReminders
                    ? `On — each plant gets an event at ${String(s.reminderHour ?? 9).padStart(2, '0')}:00 on its due day in your Google Calendar (notification + email). Overdue plants are reminded at the next full hour.${calStatus.lastSync ? ` Updated ${timeLabel(calStatus.lastSync)}` : ''}`
                    : 'Off — get notified by Google Calendar on all your devices when a plant is due.'}
                </small>
              </div>
              <button
                className={`btn btn-sm ${s.calendarReminders ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={!!s.calendarReminders}
                onClick={() => setCalendarReminders(!s.calendarReminders)}
              >
                {s.calendarReminders ? 'On' : 'Turn on'}
              </button>
            </div>
            {s.calendarReminders && (
              <div className="reminder-opts">
                <div className="field">
                  <label htmlFor="rem-hour">Reminder time</label>
                  <select id="rem-hour" value={s.reminderHour ?? 9} onChange={e => setSettings({ reminderHour: +e.target.value })}>
                    {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Remind me about</label>
                  <div className="seg">
                    <button className={!s.calendarCare ? 'is-active' : ''} onClick={() => setSettings({ calendarCare: false })}>Watering</button>
                    <button className={s.calendarCare ? 'is-active' : ''} onClick={() => setSettings({ calendarCare: true })}>Water, mist & feed</button>
                  </div>
                </div>
              </div>
            )}
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
        <div className="list-row">
          <div className="row-icon"><Plane size={18} /></div>
          <div className="grow">
            Going away
            <small>
              {trip
                ? 'The dashboard lists what comes due while you’re away, so you can water it before you leave.'
                : 'Set your travel dates to see which plants need water before you leave.'}
            </small>
          </div>
          {trip && <button className="btn btn-secondary btn-sm" onClick={() => setSettings({ trip: null })}>Clear</button>}
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="trip-from">Leaving</label>
            <input
              id="trip-from" type="date" min={today} value={trip?.from || ''}
              onChange={e => {
                const from = e.target.value
                if (!from) return setSettings({ trip: null })
                setSettings({ trip: { from, to: trip?.to && trip.to >= from ? trip.to : from } })
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="trip-to">Back</label>
            <input
              id="trip-to" type="date" min={trip?.from || today} value={trip?.to || ''}
              onChange={e => {
                const to = e.target.value
                if (!to) return
                setSettings({ trip: { from: trip?.from && trip.from <= to ? trip.from : today, to } })
              }}
            />
          </div>
        </div>
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
        <KeyField label="Perenual API key" placeholder="sk-…" value={s.perenualKey} onChange={v => setSettings({ perenualKey: v })} />
        <div className="row-group-divided">
          <div className="list-row">
            <div className="row-icon"><Wind size={18} /></div>
            <div className="grow">
              Wind classification
              <small>
                Runs automatically a few seconds after you add plants, covering every plant on
                your dashboard that doesn’t have one yet.
                {state.classificationsBackfilledAt &&
                  ` Last run: ${new Date(state.classificationsBackfilledAt).toLocaleString()}`}
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
        <KeyField label="Gemini API key" placeholder="AIza…" value={s.geminiKey} onChange={v => setSettings({ geminiKey: v })} />
        {s.geminiKey && (
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
            <div className="grow">
              Your data
              <small>
                {sync.connected
                  ? 'Synced to Drive, with a dated snapshot kept for each of the last 14 days. You can also back up to a file.'
                  : 'Stored only on this device. Back it up to a file.'}
              </small>
            </div>
          </div>
          <div className="row-actions row-actions-divided">
            <button className="btn btn-secondary btn-sm" onClick={doExport}><Download size={14} /> Export</button>
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()}><Upload size={14} /> Import</button>
            {sync.connected && (
              <button className="btn btn-secondary btn-sm" onClick={openSnapshots} disabled={snapBusy}>
                {snapBusy ? <Loader2 size={14} className="spin" /> : <History size={14} />} Restore a snapshot
              </button>
            )}
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

      {snapshots && (
        <Sheet onClose={() => setSnapshots(null)} label="Drive snapshots">
          <h2>Restore a snapshot</h2>
          <p className="muted sheet-lead">One copy of your data is saved to Drive each day. Pick a day to see what it holds before restoring.</p>
          {snapshots.length === 0 ? (
            <p className="muted">No snapshots yet — the first one is taken on today’s sync.</p>
          ) : (
            <div className="card">
              {snapshots.map(f => (
                <button key={f.id} type="button" className="list-row list-row-tap snapshot-row" onClick={() => pickSnapshot(f)} disabled={snapBusy}>
                  <div className="row-icon"><History size={16} /></div>
                  <div className="grow">{format(parseISO(f.name.slice(14, 24)), 'EEEE d MMMM yyyy')}</div>
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}

      {pendingImport && (
        <ConfirmSheet
          title="Replace everything with this backup?"
          body={<>
            <p><b>{pendingImport.source}</b>{pendingImport.savedAt ? `, saved ${new Date(pendingImport.savedAt).toLocaleString()}` : ''} — {pendingImport.plants} plant{pendingImport.plants === 1 ? '' : 's'}.</p>
            <p>It replaces the plants, plan and settings on this device{sync.connected ? ' and on your other devices once it syncs' : ''}. Plants you have now that aren’t in the backup are removed. Export first if you want to keep a copy of the current state.</p>
          </>}
          confirmLabel="Replace with backup" danger
          onConfirm={async () => {
            try {
              await importData(pendingImport.data)
              setMsg('Backup restored ✓')
            } catch (err) {
              setMsg(`Import failed: ${err.message}`)
            }
          }}
          onClose={() => setPendingImport(null)}
        />
      )}

      <Signature />
    </div>
  )
}
