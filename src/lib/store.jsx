import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { formatISO, subDays } from 'date-fns'
import { idbSet, idbGet, idbDelete, idbKeys } from './idb.js'
import { fetchWeather, WIND_HISTORY_DAYS } from './weather.js'
import { applyRainAnswer, setWindLog } from './schedule.js'
import { setCustomCatalog, getCatalogPlant } from './catalog.js'
import {
  isAuthenticated, signIn, signOut as signOutGoogle,
  findSyncFile, createSyncFile, updateSyncFile, downloadSyncFile, getSyncFileInfo,
  snapshotIfDue, listSnapshots, downloadSnapshot, AuthExpiredError, NotFoundError,
} from './googleDrive.js'
import { syncCalendarReminders, clearCalendarReminders } from './calendarSync.js'
import { fetchWindSensitivity } from './perenual.js'
import { deriveWindSensitivityFromCatalog } from './schedule.js'
import { mergeStates, differsFromRemote, prepareImport, stampPlant, nowIso } from './merge.js'

export { mergeStates }

// injected by vite.config.js at build time
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
export const BUILD_COMMIT = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'
export const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : null
const LS_KEY = 'plant-tracker:v1'
// {fileId, remoteVersion (Drive's counter at our last pull/push), dirty, lastSync, snapshotDay}
const SYNC_META_KEY = 'plant-tracker:sync'
// Daily wind history is a device-local cache, not user data: Open-Meteo
// backfills 30 days on every fetch, so it needs no syncing or merging.
const WIND_LOG_KEY = 'plant-tracker:windlog'

export const WEATHER_STALE_MS = 30 * 60 * 1000

const loadWindLog = () => { try { return JSON.parse(localStorage.getItem(WIND_LOG_KEY)) || {} } catch { return {} } }

const loadSyncMeta = () => { try { return JSON.parse(localStorage.getItem(SYNC_META_KEY)) || {} } catch { return {} } }
const saveSyncMeta = m => localStorage.setItem(SYNC_META_KEY, JSON.stringify(m))

// v1 windows were tap-points {x, y, facingDeg}; they're now wall segments
// {x0, y0, x1, y1, facingSign}. Convert old data (local or synced).
function migratePlan(plan) {
  if (!plan?.windows?.length) return plan
  return {
    ...plan,
    windows: plan.windows.map(w => {
      if (w.x1 !== undefined) return w
      const half = plan.metersPerUnit ? 0.6 / plan.metersPerUnit : 30
      return {
        id: w.id,
        x0: w.x - half, y0: w.y, x1: w.x + half, y1: w.y,
        facingSign: (w.facingDeg > 90 && w.facingDeg < 270) ? 1 : -1,
      }
    }),
  }
}

// keys can be baked in via .env.local (VITE_GEMINI_KEY / VITE_PERENUAL_KEY);
// the Account fields override them when filled
const ENV_GEMINI = import.meta.env.VITE_GEMINI_KEY || ''
const ENV_PERENUAL = import.meta.env.VITE_PERENUAL_KEY || ''

const todayIso = () => formatISO(new Date(), { representation: 'date' })

// Care actions: the date field each one moves, and how the toast says it.
// A care log entry is {id, type, date, at, source?, text?, photoId?}; types
// are these three plus 'rain', 'note', 'photo' and 'repot'.
export const CARE = {
  water: { field: 'lastWatered', verb: 'Watered' },
  mist:  { field: 'lastMisted', verb: 'Misted' },
  feed:  { field: 'lastFertilized', verb: 'Fed' },
}
const careEntry = (type, date, extra = {}) => ({ id: crypto.randomUUID(), type, date, at: nowIso(), ...extra })

const DEFAULT_STATE = {
  profile: { name: '', email: '' },
  settings: {
    geminiKey: ENV_GEMINI, perenualKey: ENV_PERENUAL, location: null, onboardingDone: false,
    calendarReminders: false,        // watering events
    calendarCare: false,             // mist + feed events too
    reminderHour: 9,                 // local hour reminder events fire
    trip: null,                      // {from, to} ISO dates while planning/away
  }, // location: {lat, lon, label}
  customCatalog: [],              // catalogue entries imported from the online search
  deleted: {},                    // plantId -> ISO tombstone, so deletions merge across devices
  settingsUpdatedAt: null,
  settingsFieldAt: {},            // per-key stamps, so two devices' settings edits both survive
  profileUpdatedAt: null,
  profileFieldAt: {},
  classificationsBackfilledAt: null,
  plan: {
    hasImage: false,
    width: 0, height: 0,          // intrinsic px of the uploaded plan
    northDeg: 0,                  // rotation of north relative to "up" on the plan
    metersPerUnit: null,          // set via two-point calibration
    windows: [],                  // {id, x, y, facingDeg}
    zones: [],                    // {id, name, x, y, w, h, light, outdoor}
  },
  plants: [],                     // see AddPlantModal for shape
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw)
    const settings = { ...DEFAULT_STATE.settings, ...parsed.settings }
    // fall back to baked-in env keys when the saved fields are empty
    if (!settings.geminiKey) settings.geminiKey = ENV_GEMINI
    if (!settings.perenualKey) settings.perenualKey = ENV_PERENUAL
    // pre-flag installs: anyone who already has plants has clearly been set up
    if (parsed.settings?.onboardingDone === undefined && parsed.plants?.length > 0) {
      settings.onboardingDone = true
    }
    // register imported entries before the first render needs getCatalogPlant()
    setCustomCatalog(parsed.customCatalog || [])
    return {
      ...DEFAULT_STATE, ...parsed,
      classificationsBackfilledAt: parsed.classificationsBackfilledAt || parsed.settings?.classificationsBackfilledAt || null,
      profile: { ...DEFAULT_STATE.profile, ...parsed.profile },
      settings,
      plan: migratePlan({ ...DEFAULT_STATE.plan, ...parsed.plan }),
      // drop the retired static exposure tag; wind is measured now
      plants: (parsed.plants || []).map(({ exposure, ...p }) => p),
    }
  } catch {
    return DEFAULT_STATE
  }
}

const StoreContext = createContext(null)
export const useStore = () => useContext(StoreContext)

export function StoreProvider({ children }) {
  const [state, setState] = useState(loadState)
  const [weather, setWeather] = useState(null)
  const [weatherError, setWeatherError] = useState(null)
  const [planImage, setPlanImage] = useState(null)   // dataURL
  const [icons, setIcons] = useState({})             // plantId -> dataURL (Gemini-generated)
  const [photos, setPhotos] = useState({})           // photoId -> dataURL (care-log photos)
  const [toast, setToast] = useState(null)           // {id, text, undo?}
  const [windLog, setWindLogState] = useState(() => {  // { 'YYYY-MM-DD': {max, mean} }
    const l = loadWindLog()
    setWindLog(l) // register with the schedule module before first render
    return l
  })

  // Google Drive sync
  const [sync, setSync] = useState(() => ({
    connected: isAuthenticated(), syncing: false, error: null, offline: false,
    pending: !!loadSyncMeta().dirty,
    lastSync: loadSyncMeta().lastSync || null,
  }))
  // Local changes not yet pushed. Persisted, so an edit made seconds before
  // the app is closed is still uploaded on the next launch.
  const dirty = useRef(!!loadSyncMeta().dirty)
  const editSeq = useRef(0)          // bumps on every local edit; detects edits made mid-sync
  const skipDirty = useRef(0)        // suppress dirty-marking while applying remote data
  const firstRun = useRef(true)
  const syncBusy = useRef(false)
  const syncTimer = useRef(null)
  const syncNowRef = useRef(() => {})
  const latest = useRef({})          // freshest state/blobs for payload building
  latest.current = { state, planImage, icons, photos }

  // persist small state
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  }, [state])

  // keep the runtime catalogue registry in sync with imported entries
  useEffect(() => {
    setCustomCatalog(state.customCatalog)
  }, [state.customCatalog])

  // Fold each weather refresh into the rolling wind history. Because the API
  // backfills 30 days, this self-heals gaps from days the app wasn't opened,
  // and every refresh re-tightens the estimate for plants already waiting.
  const mergeWindDaily = useCallback(windDaily => {
    if (!windDaily || !Object.keys(windDaily).length) return
    setWindLogState(prev => {
      const cutoff = formatISO(subDays(new Date(), WIND_HISTORY_DAYS + 5), { representation: 'date' })
      const next = {}
      for (const [day, v] of Object.entries({ ...prev, ...windDaily })) {
        if (day >= cutoff) next[day] = v
      }
      localStorage.setItem(WIND_LOG_KEY, JSON.stringify(next))
      setWindLog(next)
      return next
    })
  }, [])

  // load blobs from IndexedDB once
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const img = await idbGet('plan:image')
        const keys = await idbKeys()
        const iconMap = {}
        const photoMap = {}
        for (const k of keys) {
          if (typeof k !== 'string') continue
          if (k.startsWith('icon:')) iconMap[k.slice(5)] = await idbGet(k)
          if (k.startsWith('photo:')) photoMap[k.slice(6)] = await idbGet(k)
        }
        // the boot load is not an edit: set everything in one tick (one
        // render) and keep it from marking the device dirty
        if (alive && (img || Object.keys(iconMap).length || Object.keys(photoMap).length)) {
          skipDirty.current += 1
          if (img) setPlanImage(img)
          setIcons(iconMap)
          setPhotos(photoMap)
        }
      } catch (e) {
        console.error('IDB load failed', e)
      }
    })()
    return () => { alive = false }
  }, [])

  // Weather: refresh when the location is set, every 30 min, and whenever the
  // app comes back to the foreground with data older than that — a PWA resumed
  // after hours in the background would otherwise keep a stale "yesterday".
  const location = state.settings.location
  const weatherRef = useRef(null)
  weatherRef.current = weather
  const loadWeatherRef = useRef(async () => {})
  useEffect(() => {
    if (!location) { setWeather(null); return }
    let alive = true
    const load = async () => {
      try {
        const w = await fetchWeather(location)
        if (alive) { setWeather(w); mergeWindDaily(w.windDaily); setWeatherError(null) }
      } catch (e) {
        if (alive) setWeatherError(e.message)
      }
    }
    loadWeatherRef.current = load
    load()
    const t = setInterval(load, WEATHER_STALE_MS)
    const onShow = () => {
      if (document.visibilityState !== 'visible') return
      const w = weatherRef.current
      if (!w || Date.now() - w.fetchedAt > WEATHER_STALE_MS) load()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onShow) }
  }, [location?.lat, location?.lon])

  const patch = useCallback(updater => setState(s => updater(s)), [])

  /* ── Google Drive sync ─────────────────────────────────────────────── */

  // Write blobs to IndexedDB, dropping ones nothing references any more.
  const writeBlobs = useCallback(async ({ planImage: img, icons: iconMap = {}, photos: photoMap = {} }) => {
    if (img) await idbSet('plan:image', img)
    else { try { await idbDelete('plan:image') } catch { /* ignore */ } }
    for (const [id, url] of Object.entries(iconMap)) await idbSet(`icon:${id}`, url)
    for (const [id, url] of Object.entries(photoMap)) await idbSet(`photo:${id}`, url)
    try {
      for (const k of await idbKeys()) {
        if (typeof k !== 'string') continue
        if (k.startsWith('icon:') && !(k.slice(5) in iconMap)) await idbDelete(k)
        if (k.startsWith('photo:') && !(k.slice(6) in photoMap)) await idbDelete(k)
      }
    } catch { /* ignore */ }
  }, [])

  // Apply a merged sync result. The state update re-merges onto the CURRENT
  // state, so an edit made while the sync was in flight (answering a rain
  // bubble, say) survives instead of being replaced by an older snapshot. All
  // setters run in one tick: one render, one dirty-effect run, absorbed by
  // skipDirty — so a pull no longer triggers a spurious re-upload.
  const applyRemote = useCallback(async (merged, blobs) => {
    await writeBlobs(blobs)
    skipDirty.current += 1
    setState(cur => {
      const { state: m } = mergeStates(cur, merged)
      return { ...m, plan: migratePlan({ ...DEFAULT_STATE.plan, ...m.plan }) }
    })
    setCustomCatalog(merged.customCatalog || [])
    setPlanImage(blobs.planImage || null)
    setIcons(blobs.icons || {})
    setPhotos(blobs.photos || {})
  }, [writeBlobs])

  // Replace everything with a backup. It's a local edit, so it is NOT
  // absorbed by skipDirty: the dirty effect pushes it to Drive, and
  // prepareImport() makes sure it wins the merge there.
  const replaceAll = useCallback(async data => {
    if (!data?.state) throw new Error('Invalid data file')
    const prepared = prepareImport(data.state, latest.current.state)
    const blobs = { planImage: data.blobs?.planImage || null, icons: data.blobs?.icons || {}, photos: data.blobs?.photos || {} }
    await writeBlobs(blobs)
    setState({
      ...DEFAULT_STATE, ...prepared,
      profile: { ...DEFAULT_STATE.profile, ...prepared.profile },
      settings: { ...DEFAULT_STATE.settings, ...prepared.settings },
      plan: migratePlan({ ...DEFAULT_STATE.plan, ...prepared.plan }),
    })
    setCustomCatalog(prepared.customCatalog || [])
    setPlanImage(blobs.planImage)
    setIcons(blobs.icons)
    setPhotos(blobs.photos)
  }, [writeBlobs])

  // Read blobs straight from IndexedDB so a push never races the async boot
  // load (that race once uploaded a payload without the floor plan).
  const readLocalBlobs = useCallback(async () => {
    let planImg = latest.current.planImage
    let iconMap = latest.current.icons
    let photoMap = latest.current.photos
    try {
      planImg = (await idbGet('plan:image')) || planImg || null
      const ic = {}
      const ph = {}
      for (const k of await idbKeys()) {
        if (typeof k !== 'string') continue
        if (k.startsWith('icon:')) ic[k.slice(5)] = await idbGet(k)
        if (k.startsWith('photo:')) ph[k.slice(6)] = await idbGet(k)
      }
      if (Object.keys(ic).length || Object.keys(iconMap).length === 0) iconMap = ic
      if (Object.keys(ph).length || Object.keys(photoMap).length === 0) photoMap = ph
    } catch { /* fall back to in-memory copies */ }
    return { planImage: planImg || null, icons: iconMap, photos: photoMap }
  }, [])

  const syncNow = useCallback(async () => {
    if (!isAuthenticated()) { setSync(s => ({ ...s, connected: false })); return }
    if (syncBusy.current) return
    syncBusy.current = true
    setSync(s => ({ ...s, connected: true, syncing: true }))
    const seq = editSeq.current
    try {
      const meta = loadSyncMeta()
      let fileId = meta.fileId || null
      let info = null
      if (fileId) {
        // a sync file deleted from Drive must not wedge sync forever: forget
        // it and fall through to find-or-create
        info = await getSyncFileInfo(fileId).catch(e => { if (e instanceof NotFoundError) return null; throw e })
        if (!info || info.trashed) fileId = null
      }
      if (!fileId) {
        const found = await findSyncFile()
        if (found) { fileId = found.id; info = await getSyncFileInfo(fileId) }
      }

      let next
      if (!fileId) {
        // first ever sync for this account: create the file from local data
        const blobs = await readLocalBlobs()
        const payload = { savedAt: nowIso(), version: APP_VERSION, state: latest.current.state, blobs }
        const created = await createSyncFile(JSON.stringify(payload))
        next = { fileId: created.id, remoteVersion: created.version }
      } else if (info.version !== meta.remoteVersion || dirty.current) {
        const remote = await downloadSyncFile(fileId)
        const local = await readLocalBlobs()
        if (!remote?.state) {
          // unreadable remote: this device's copy becomes the file
          const payload = { savedAt: nowIso(), version: APP_VERSION, state: latest.current.state, blobs: local }
          const up = await updateSyncFile(fileId, JSON.stringify(payload))
          next = { fileId, remoteVersion: up.version }
        } else {
          const localState = latest.current.state
          const { state: merged, planFromLocal } = mergeStates(localState, remote.state)
          const rb = remote.blobs || {}

          const remotePlan = rb.planImage || null
          const planImage = !merged.plan?.hasImage ? null
            : planFromLocal ? (local.planImage || remotePlan) : (remotePlan || local.planImage)

          // icons follow each plant's iconAt stamp, so a regenerated icon
          // reaches every device; icons of deleted plants are dropped
          const localById = new Map((localState.plants || []).map(pl => [pl.id, pl]))
          const remoteById = new Map((remote.state.plants || []).map(pl => [pl.id, pl]))
          const icons = {}
          for (const pl of merged.plants) {
            const remoteWins = (remoteById.get(pl.id)?.iconAt || '') > (localById.get(pl.id)?.iconAt || '')
            const url = remoteWins ? (rb.icons?.[pl.id] || local.icons[pl.id]) : (local.icons[pl.id] || rb.icons?.[pl.id])
            if (url) icons[pl.id] = url
          }
          const photoIds = new Set(merged.plants.flatMap(pl => (pl.log || []).map(e => e.photoId).filter(Boolean)))
          const photos = {}
          for (const id of photoIds) {
            const url = local.photos[id] || rb.photos?.[id]
            if (url) photos[id] = url
          }
          const blobs = { planImage, icons, photos }
          await applyRemote(merged, blobs)

          const sameMap = (a = {}, b = {}) =>
            Object.keys(a).length === Object.keys(b || {}).length && Object.keys(a).every(k => a[k] === b[k])
          const contributed = differsFromRemote(merged, remote.state) ||
            planImage !== remotePlan || !sameMap(icons, rb.icons) || !sameMap(photos, rb.photos)

          if (contributed) {
            const payload = { savedAt: nowIso(), version: APP_VERSION, state: merged, blobs }
            const up = await updateSyncFile(fileId, JSON.stringify(payload))
            next = { fileId, remoteVersion: up.version }
          } else {
            next = { fileId, remoteVersion: info.version }
          }
        }
      } else {
        next = { fileId, remoteVersion: meta.remoteVersion }
      }

      // an edit made during this sync keeps the device dirty for another round
      const clean = editSeq.current === seq
      if (clean) dirty.current = false
      saveSyncMeta({ ...loadSyncMeta(), ...next, dirty: dirty.current, lastSync: Date.now() })
      setSync({ connected: true, syncing: false, error: null, offline: false, pending: dirty.current, lastSync: Date.now() })
      if (!clean) { clearTimeout(syncTimer.current); syncTimer.current = setTimeout(() => syncNowRef.current(), 1500) }

      // once a day, a dated copy of the sync file (the newest 14 are kept)
      const day = todayIso()
      if (loadSyncMeta().snapshotDay !== day) {
        snapshotIfDue(next.fileId, day)
          .then(() => saveSyncMeta({ ...loadSyncMeta(), snapshotDay: day }))
          .catch(() => { /* retried on the next sync */ })
      }
    } catch (e) {
      const expired = e instanceof AuthExpiredError
      // fetch rejects with a TypeError when the network is down
      const offline = !expired && (!navigator.onLine || e instanceof TypeError)
      setSync(s => ({
        ...s, syncing: false, connected: !expired, offline, pending: dirty.current,
        error: expired ? 'Google session expired — reconnect to keep your devices in sync.'
          : offline ? null : e.message,
      }))
    } finally {
      syncBusy.current = false
    }
  }, [applyRemote, readLocalBlobs])
  syncNowRef.current = syncNow

  // mark local edits dirty (persisted) and schedule a debounced push
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (skipDirty.current > 0) { skipDirty.current -= 1; return }
    editSeq.current += 1
    if (!dirty.current) {
      dirty.current = true
      saveSyncMeta({ ...loadSyncMeta(), dirty: true })
      setSync(s => ({ ...s, pending: true }))
    }
    if (!isAuthenticated()) return
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => syncNowRef.current(), 4000)
    return () => clearTimeout(syncTimer.current)
  }, [state, planImage, icons, photos])

  // pull once on startup when already connected (this also pushes edits left
  // dirty by a session that was closed before its push went out)
  useEffect(() => {
    if (isAuthenticated()) syncNowRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hidden → push now rather than in 4 s (the app may be about to be killed).
  // Visible again → pull, so a device left open picks up other devices' edits.
  // Back online → retry.
  useEffect(() => {
    const onVis = () => {
      if (!isAuthenticated()) return
      if (document.visibilityState === 'hidden') {
        if (dirty.current) { clearTimeout(syncTimer.current); syncNowRef.current() }
      } else {
        syncNowRef.current()
      }
    }
    const onOnline = () => { if (isAuthenticated()) syncNowRef.current() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  /* ── Toast, with optional undo ─────────────────────────────────────── */
  const toastTimer = useRef(null)
  const showToast = useCallback(t => {
    clearTimeout(toastTimer.current)
    const id = crypto.randomUUID()
    setToast({ ...t, id })
    toastTimer.current = setTimeout(() => setToast(cur => (cur?.id === id ? null : cur)), t.undo ? 7000 : 3500)
  }, [])
  const dismissToast = useCallback(() => { clearTimeout(toastTimer.current); setToast(null) }, [])

  /* ── Care logging ──────────────────────────────────────────────────────
   * One code path for every "I did it" tap (card, bell, bulk). Each logs an
   * entry and moves the date field; the toast's Undo restores the previous
   * values and removes the entry (remembered in logRemoved so a device that
   * already synced the entry drops it too). */
  // jobs: [{id, type}] — several plants and/or chores in one patch, one toast
  const logCareJobs = useCallback((jobs, { date = todayIso(), source } = {}) => {
    if (!jobs.length) return
    const byPlant = new Map()
    for (const j of jobs) byPlant.set(j.id, [...(byPlant.get(j.id) || []), j.type])
    const before = new Map()
    const entries = new Map()
    patch(s => ({
      ...s,
      plants: s.plants.map(pl => {
        const types = byPlant.get(pl.id)
        if (!types) return pl
        const prev = {}
        const fields = {}
        const newEntries = []
        for (const type of types) {
          const { field } = CARE[type]
          prev[field] = pl[field] ?? null
          fields[field] = date
          if (type === 'water') {
            prev.rainDelay = pl.rainDelay ?? false
            prev.lastWateredBy = pl.lastWateredBy ?? null
            fields.rainDelay = false
            fields.lastWateredBy = 'hand'
          }
          newEntries.push(careEntry(type, date, source ? { source } : {}))
        }
        before.set(pl.id, prev)
        entries.set(pl.id, newEntries.map(e => e.id))
        return { ...stampPlant(pl, fields), log: [...newEntries, ...(pl.log || [])] }
      }),
    }))
    const undo = () => patch(s => ({
      ...s,
      plants: s.plants.map(pl => {
        if (!before.has(pl.id)) return pl
        const gone = new Set(entries.get(pl.id))
        return {
          ...stampPlant(pl, before.get(pl.id)),
          log: (pl.log || []).filter(e => !gone.has(e.id)),
          logRemoved: [...(pl.logRemoved || []), ...gone],
        }
      }),
    }))
    const types = [...new Set(jobs.map(j => j.type))]
    const verb = types.map((t, i) => (i ? CARE[t].verb.toLowerCase() : CARE[t].verb)).join(' + ')
    const ids = [...byPlant.keys()]
    const one = ids.length === 1 && latest.current.state.plants.find(pl => pl.id === ids[0])
    const text = one
      ? `${verb} ${one.nickname || getCatalogPlant(one.catalogId)?.name || 'plant'}`
      : `${verb} ${ids.length} plants`
    showToast({ text, undo })
  }, [patch, showToast])
  const logCare = useCallback((ids, type, opts) => logCareJobs(ids.map(id => ({ id, type })), opts), [logCareJobs])

  const addLogEntry = useCallback((id, entry, fields = {}) => patch(s => ({
    ...s,
    plants: s.plants.map(pl => pl.id === id
      ? { ...stampPlant(pl, fields), log: [{ ...careEntry(entry.type, entry.date || todayIso()), ...entry }, ...(pl.log || [])] }
      : pl),
  })), [patch])

  /* ── Wind classification pass ─────────────────────────────────────────
   * Walks the plants actually on the dashboard and stamps each one with a
   * wind sensitivity. Perenual species are looked up once for their full
   * record (the evidence that makes a bloomer "high" — watering: Frequent
   * plus a broadleaf/flowering type — is not saved at import time); anything
   * else, including species the free tier withholds, falls back to the
   * taxonomy + care-number rules.
   *
   * Deliberately NOT run on app start: it fires after plants are added, so
   * newly added plants and any older ones still missing a class get done
   * together, in one pass.
   */
  const [backfill, setBackfill] = useState({ running: false, done: 0, total: 0, results: [], error: null })
  const backfillBusy = useRef(false)
  const classifyTimer = useRef(null)

  const backfillClassifications = useCallback(async ({ force = false } = {}) => {
    if (backfillBusy.current) return
    const s = latest.current.state
    const key = s.settings.perenualKey
    const targets = (s.plants || []).filter(p => force || !p.windSensitivity)
    if (!targets.length) return

    backfillBusy.current = true
    setBackfill({ running: true, done: 0, total: targets.length, results: [], error: null })

    const perSpecies = new Map() // one API call per species, however many pots of it you own
    const results = []

    for (let i = 0; i < targets.length; i++) {
      const plant = targets[i]
      const cat = getCatalogPlant(plant.catalogId)
      const label = plant.nickname || cat?.name || 'Plant'
      let cls = perSpecies.get(plant.catalogId)
      let via = 'species already checked'

      if (!cls) {
        const m = /^perenual-(\d+)$/.exec(plant.catalogId || '')
        let fetched = null
        if (key && m && !cat?.windSensitivity) {
          try {
            fetched = await fetchWindSensitivity(key, m[1])
          } catch (e) {
            setBackfill(b => ({ ...b, error: e.message }))
          }
          if (fetched) {
            via = 'species record'
            // remember on the species so other pots of it cost nothing
            patch(st => ({
              ...st,
              customCatalog: st.customCatalog.map(e => e.id === plant.catalogId ? { ...e, windSensitivity: fetched } : e),
            }))
          } else {
            via = 'name & care data'
          }
          await new Promise(r => setTimeout(r, 4000)) // stay under the per-minute throttle
        } else {
          via = cat?.windSensitivity ? 'species record' : 'name & care data'
        }
        cls = fetched || deriveWindSensitivityFromCatalog(cat)
        perSpecies.set(plant.catalogId, cls)
      }

      // stamp only a real change, so a stale device re-running this pass
      // can't overwrite other devices' newer edits to the plant
      patch(st => ({
        ...st,
        plants: st.plants.map(p => p.id === plant.id && p.windSensitivity !== cls ? stampPlant(p, { windSensitivity: cls }) : p),
      }))
      results.push({ name: label, cls, via })
      setBackfill(b => ({ ...b, done: i + 1, results: [...results] }))
    }

    // deliberately outside settings: stamping the settings section for this
    // marker once let a stale device's old settings win the merge
    patch(st => ({ ...st, classificationsBackfilledAt: nowIso() }))
    setBackfill(b => ({ ...b, running: false }))
    backfillBusy.current = false
  }, [patch])

  /* ── Google Calendar reminders ──────────────────────────────────────── */
  const [calStatus, setCalStatus] = useState({ error: null, lastSync: null })
  const calBusy = useRef(false)
  const calTimer = useRef(null)

  const runCalendarSync = useCallback(async () => {
    const s = latest.current.state
    if (calBusy.current || !isAuthenticated() || !s.settings.calendarReminders) return
    calBusy.current = true
    try {
      await syncCalendarReminders(s.plants, s.settings)
      setCalStatus({ error: null, lastSync: Date.now() })
    } catch (e) {
      setCalStatus(st => ({ ...st, error: e.message }))
    } finally {
      calBusy.current = false
    }
  }, [])

  // refresh reminder events shortly after any schedule-relevant change
  const st = state.settings
  useEffect(() => {
    if (!st.calendarReminders || !sync.connected) return
    clearTimeout(calTimer.current)
    calTimer.current = setTimeout(runCalendarSync, 5000)
    return () => clearTimeout(calTimer.current)
  }, [state.plants, st.calendarReminders, st.calendarCare, st.reminderHour, st.location, sync.connected, runCalendarSync])

  const setSettingsFn = useCallback(p => patch(s => {
    const at = nowIso()
    return {
      ...s,
      settings: { ...s.settings, ...p },
      settingsUpdatedAt: at,
      settingsFieldAt: { ...(s.settingsFieldAt || {}), ...Object.fromEntries(Object.keys(p).map(k => [k, at])) },
    }
  }), [patch])

  const api = useMemo(() => ({
    // every mutation stamps what it touched, so devices can merge correctly
    setProfile: p => patch(s => {
      const at = nowIso()
      return {
        ...s,
        profile: { ...s.profile, ...p },
        profileUpdatedAt: at,
        profileFieldAt: { ...(s.profileFieldAt || {}), ...Object.fromEntries(Object.keys(p).map(k => [k, at])) },
      }
    }),
    setSettings: setSettingsFn,
    setPlan: p => patch(s => ({ ...s, plan: { ...s.plan, ...p, updatedAt: nowIso() } })),

    addPlant: plant => {
      const at = nowIso()
      patch(s => ({ ...s, plants: [...s.plants, { ...plant, updatedAt: at }] }))
      // classify after adding — debounced so a batch of additions costs one pass
      clearTimeout(classifyTimer.current)
      classifyTimer.current = setTimeout(() => backfillClassifications(), 3000)
    },
    addCustomCatalogEntry: entry => patch(s => ({
      ...s,
      customCatalog: [...s.customCatalog.filter(e => e.id !== entry.id), entry],
    })),
    updatePlant: (id, p) => patch(s => ({
      ...s, plants: s.plants.map(pl => pl.id === id ? stampPlant(pl, p) : pl),
    })),
    // Removing keeps a copy in memory for the toast's Undo; the tombstone is
    // what deletes it on other devices, and Undo clears it again.
    removePlant: id => {
      const plant = latest.current.state.plants.find(pl => pl.id === id)
      if (!plant) return
      const icon = latest.current.icons[id]
      patch(s => ({
        ...s,
        plants: s.plants.filter(pl => pl.id !== id),
        deleted: { ...s.deleted, [id]: nowIso() },
      }))
      idbDelete(`icon:${id}`).catch(() => {})
      setIcons(ic => { const { [id]: _, ...rest } = ic; return rest })
      const name = plant.nickname || getCatalogPlant(plant.catalogId)?.name || 'Plant'
      showToast({
        text: `Removed ${name}`,
        undo: () => {
          patch(s => {
            const { [id]: _, ...deleted } = s.deleted
            return { ...s, deleted, plants: [...s.plants, { ...plant, updatedAt: nowIso() }] }
          })
          if (icon) { idbSet(`icon:${id}`, icon).catch(() => {}); setIcons(ic => ({ ...ic, [id]: icon })) }
        },
      })
    },

    logCare,
    logCareJobs,
    markWatered: id => logCare([id], 'water'),
    markMisted: id => logCare([id], 'mist'),
    markFertilized: id => logCare([id], 'feed'),
    answerRain: (id, w, outcome) => {
      const plant = latest.current.state.plants.find(pl => pl.id === id)
      if (!plant) return
      const fields = applyRainAnswer(plant, w, outcome)
      addLogEntry(id, { type: 'rain', date: fields.lastWatered || fields.rainAnsweredFor, source: outcome }, fields)
    },
    addNote: (id, text) => addLogEntry(id, { type: 'note', text }),
    logRepot: (id, date = todayIso()) => addLogEntry(id, { type: 'repot', date }, { lastRepotted: date }),
    addPhoto: async (id, dataUrl, text = '') => {
      const photoId = crypto.randomUUID()
      await idbSet(`photo:${photoId}`, dataUrl)
      setPhotos(ph => ({ ...ph, [photoId]: dataUrl }))
      addLogEntry(id, { type: 'photo', photoId, ...(text ? { text } : {}) })
    },
    removeLogEntry: (id, entryId) => patch(s => ({
      ...s,
      plants: s.plants.map(pl => pl.id === id
        ? { ...pl, updatedAt: nowIso(), log: (pl.log || []).filter(e => e.id !== entryId), logRemoved: [...(pl.logRemoved || []), entryId] }
        : pl),
    })),

    showToast,
    dismissToast,

    savePlanImage: async (dataUrl, width, height) => {
      await idbSet('plan:image', dataUrl)
      setPlanImage(dataUrl)
      patch(s => ({ ...s, plan: { ...s.plan, hasImage: true, width, height, updatedAt: nowIso() } }))
    },
    clearPlan: async () => {
      try { await idbDelete('plan:image') } catch { /* ignore */ }
      setPlanImage(null)
      patch(s => ({ ...s, plan: { ...DEFAULT_STATE.plan, updatedAt: nowIso() } }))
    },
    saveIcon: async (plantId, dataUrl) => {
      await idbSet(`icon:${plantId}`, dataUrl)
      setIcons(ic => ({ ...ic, [plantId]: dataUrl }))
      // the stamp is what makes a regenerated icon win on the other devices
      patch(s => ({ ...s, plants: s.plants.map(pl => pl.id === plantId ? stampPlant(pl, { iconAt: nowIso() }) : pl) }))
    },

    exportData: async () => {
      const blobs = { planImage, icons, photos }
      return JSON.stringify({ version: APP_VERSION, savedAt: nowIso(), state, blobs }, null, 2)
    },
    // parse + summarise a backup for the confirm step, without applying it
    readBackup: json => {
      const data = typeof json === 'string' ? JSON.parse(json) : json
      if (!data?.state) throw new Error('This file isn’t a Plant Tracker backup')
      return { data, savedAt: data.savedAt || null, plants: (data.state.plants || []).length }
    },
    importData: async data => {
      await replaceAll(typeof data === 'string' ? JSON.parse(data) : data)
      if (isAuthenticated()) setTimeout(() => syncNowRef.current(), 300)
    },
    listSnapshots,
    downloadSnapshot,

    connectGoogle: () => signIn(), // redirects to Google
    disconnectGoogle: () => {
      signOutGoogle()
      clearTimeout(syncTimer.current)
      setSync(s => ({ ...s, connected: false, syncing: false, error: null }))
    },
    refreshSync: () => { // called by AuthCallback after the token lands
      setSync(s => ({ ...s, connected: isAuthenticated(), error: null }))
      setCalStatus({ error: null, lastSync: null })
      if (isAuthenticated()) syncNowRef.current()
    },
    syncNow,

    setCalendarReminders: async enabled => {
      setSettingsFn({ calendarReminders: enabled })
      if (enabled) {
        setTimeout(() => runCalendarSync(), 100)
      } else {
        try { await clearCalendarReminders() } catch { /* events may already be gone */ }
        setCalStatus({ error: null, lastSync: null })
      }
    },
    runCalendarSync,

    backfillClassifications,

    refreshWeather: () => loadWeatherRef.current(),
  }), [patch, planImage, icons, photos, state, applyRemote, replaceAll, syncNow, runCalendarSync, backfillClassifications, setSettingsFn, logCare, logCareJobs, addLogEntry, showToast, dismissToast])

  const value = useMemo(
    () => ({ state, weather, weatherError, planImage, icons, photos, sync, calStatus, windLog, backfill, toast, ...api }),
    [state, weather, weatherError, planImage, icons, photos, sync, calStatus, windLog, backfill, toast, api],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
