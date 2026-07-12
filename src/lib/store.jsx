import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { formatISO } from 'date-fns'
import { idbSet, idbGet, idbDelete, idbKeys } from './idb.js'
import { fetchWeather } from './weather.js'
import { applyRainAnswer } from './schedule.js'
import { setCustomCatalog } from './catalog.js'
import {
  isAuthenticated, signIn, clearToken as clearGoogleToken,
  findSyncFile, createSyncFile, updateSyncFile, downloadSyncFile, AuthExpiredError,
} from './googleDrive.js'

export const APP_VERSION = '1.0.0'
const LS_KEY = 'plant-tracker:v1'
const SYNC_META_KEY = 'plant-tracker:sync' // {fileId, savedAt of last pushed/applied payload}

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

const DEFAULT_STATE = {
  profile: { name: '', email: '' },
  settings: { geminiKey: ENV_GEMINI, perenualKey: ENV_PERENUAL, location: null, onboardingDone: false }, // location: {lat, lon, label}
  customCatalog: [],              // catalogue entries imported from the online search
  plan: {
    hasImage: false,
    width: 0, height: 0,          // intrinsic px of the uploaded plan
    northDeg: 0,                  // rotation of north relative to "up" on the plan
    metersPerUnit: null,          // set via two-point calibration
    windows: [],                  // {id, x, y, facingDeg}
    zones: [],                    // {id, name, x, y, w, h, light}
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
      profile: { ...DEFAULT_STATE.profile, ...parsed.profile },
      settings,
      plan: migratePlan({ ...DEFAULT_STATE.plan, ...parsed.plan }),
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

  // Google Drive sync
  const [sync, setSync] = useState(() => ({
    connected: isAuthenticated(), syncing: false, error: null,
    lastSync: loadSyncMeta().lastSync || null,
  }))
  const dirty = useRef(false)        // local changes not yet pushed
  const skipDirty = useRef(0)        // suppress dirty-marking while applying remote data
  const firstRun = useRef(true)
  const syncBusy = useRef(false)
  const syncTimer = useRef(null)
  const syncNowRef = useRef(() => {})
  const latest = useRef({})          // freshest state/blobs for payload building
  latest.current = { state, planImage, icons }

  // persist small state
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  }, [state])

  // keep the runtime catalogue registry in sync with imported entries
  useEffect(() => {
    setCustomCatalog(state.customCatalog)
  }, [state.customCatalog])

  // load blobs from IndexedDB once
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const img = await idbGet('plan:image')
        if (alive && img) setPlanImage(img)
        const keys = await idbKeys()
        const iconMap = {}
        for (const k of keys) {
          if (typeof k === 'string' && k.startsWith('icon:')) {
            iconMap[k.slice(5)] = await idbGet(k)
          }
        }
        if (alive) setIcons(iconMap)
      } catch (e) {
        console.error('IDB load failed', e)
      }
    })()
    return () => { alive = false }
  }, [])

  // weather: refresh when location set, then every 30 min
  const location = state.settings.location
  useEffect(() => {
    if (!location) { setWeather(null); return }
    let alive = true
    const load = async () => {
      try {
        const w = await fetchWeather(location)
        if (alive) { setWeather(w); setWeatherError(null) }
      } catch (e) {
        if (alive) setWeatherError(e.message)
      }
    }
    load()
    const t = setInterval(load, 30 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [location?.lat, location?.lon])

  const patch = useCallback(updater => setState(s => updater(s)), [])

  /* ── Google Drive sync ─────────────────────────────────────────────── */

  // replace all local data with a synced/imported payload (does not mark dirty)
  const applyPayload = useCallback(async data => {
    if (!data?.state) throw new Error('Invalid data file')
    skipDirty.current += 1
    setState({
      ...DEFAULT_STATE, ...data.state,
      profile: { ...DEFAULT_STATE.profile, ...data.state.profile },
      settings: { ...DEFAULT_STATE.settings, ...data.state.settings },
      plan: migratePlan({ ...DEFAULT_STATE.plan, ...data.state.plan }),
    })
    setCustomCatalog(data.state.customCatalog || [])
    if (data.blobs?.planImage) {
      await idbSet('plan:image', data.blobs.planImage)
      setPlanImage(data.blobs.planImage)
    } else {
      try { await idbDelete('plan:image') } catch { /* ignore */ }
      setPlanImage(null)
    }
    const iconMap = data.blobs?.icons || {}
    for (const [id, url] of Object.entries(iconMap)) await idbSet(`icon:${id}`, url)
    setIcons(iconMap)
  }, [])

  // Read blobs straight from IndexedDB so a push never races the async boot
  // load (that race once uploaded a payload without the floor plan).
  const buildPayload = useCallback(async () => {
    let planImg = latest.current.planImage
    let iconMap = latest.current.icons
    try {
      planImg = (await idbGet('plan:image')) || planImg || null
      const keys = await idbKeys()
      const m = {}
      for (const k of keys) {
        if (typeof k === 'string' && k.startsWith('icon:')) m[k.slice(5)] = await idbGet(k)
      }
      if (Object.keys(m).length || Object.keys(iconMap).length === 0) iconMap = m
    } catch { /* fall back to in-memory copies */ }
    return {
      savedAt: new Date().toISOString(),
      version: APP_VERSION,
      state: latest.current.state,
      blobs: { planImage: planImg, icons: iconMap },
    }
  }, [])

  const syncNow = useCallback(async () => {
    if (!isAuthenticated()) { setSync(s => ({ ...s, connected: false })); return }
    if (syncBusy.current) return
    syncBusy.current = true
    setSync(s => ({ ...s, connected: true, syncing: true, error: null }))
    try {
      const meta = loadSyncMeta()
      let fileId = meta.fileId || (await findSyncFile())?.id || null
      let mustPush = dirty.current || !fileId

      if (fileId && !dirty.current) {
        // nothing local to push — adopt the remote copy if it moved forward
        const remote = await downloadSyncFile(fileId).catch(() => null)
        if (remote?.savedAt && remote.savedAt > (meta.savedAt || '')) {
          const localPlants = latest.current.state.plants?.length || 0
          const remotePlants = remote.state?.plants?.length || 0
          const localPlan = (await idbGet('plan:image').catch(() => null)) || latest.current.planImage
          if (localPlants > 0 && remotePlants === 0) {
            // remote looks like a fresh device's accidental empty overwrite —
            // keep this device's data and repair the Drive copy instead
            mustPush = true
          } else {
            if (localPlan && !remote.blobs?.planImage) {
              // remote is missing the floor plan this device has — merge it
              // back in, then re-upload the repaired payload
              remote.blobs = { ...remote.blobs, planImage: localPlan }
              mustPush = true
            }
            await applyPayload(remote)
            saveSyncMeta({ fileId, savedAt: remote.savedAt, lastSync: Date.now() })
          }
        } else {
          saveSyncMeta({ ...meta, fileId, savedAt: meta.savedAt || remote?.savedAt || null, lastSync: Date.now() })
        }
      }

      if (mustPush) {
        // push local data; last write wins
        const payload = await buildPayload()
        const body = JSON.stringify(payload)
        if (fileId) await updateSyncFile(fileId, body)
        else fileId = await createSyncFile(body)
        dirty.current = false
        saveSyncMeta({ fileId, savedAt: payload.savedAt, lastSync: Date.now() })
      }
      setSync({ connected: true, syncing: false, error: null, lastSync: Date.now() })
    } catch (e) {
      const expired = e instanceof AuthExpiredError
      setSync(s => ({
        ...s, syncing: false, connected: !expired,
        error: expired ? 'Google session expired — reconnect in Account' : e.message,
      }))
    } finally {
      syncBusy.current = false
    }
  }, [applyPayload, buildPayload])
  syncNowRef.current = syncNow

  // mark local edits dirty and schedule a debounced push
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (skipDirty.current > 0) { skipDirty.current -= 1; return }
    dirty.current = true
    if (!isAuthenticated()) return
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => syncNowRef.current(), 4000)
    return () => clearTimeout(syncTimer.current)
  }, [state, planImage, icons])

  // pull once on startup when already connected
  useEffect(() => {
    if (isAuthenticated()) syncNowRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const api = useMemo(() => ({
    setProfile: p => patch(s => ({ ...s, profile: { ...s.profile, ...p } })),
    setSettings: p => patch(s => ({ ...s, settings: { ...s.settings, ...p } })),
    setPlan: p => patch(s => ({ ...s, plan: { ...s.plan, ...p } })),

    addPlant: plant => patch(s => ({ ...s, plants: [...s.plants, plant] })),
    addCustomCatalogEntry: entry => patch(s => ({
      ...s,
      customCatalog: [...s.customCatalog.filter(e => e.id !== entry.id), entry],
    })),
    updatePlant: (id, p) => patch(s => ({
      ...s, plants: s.plants.map(pl => pl.id === id ? { ...pl, ...p } : pl),
    })),
    removePlant: async id => {
      patch(s => ({ ...s, plants: s.plants.filter(pl => pl.id !== id) }))
      try { await idbDelete(`icon:${id}`) } catch { /* ignore */ }
      setIcons(ic => { const { [id]: _, ...rest } = ic; return rest })
    },

    markWatered: id => patch(s => ({
      ...s, plants: s.plants.map(pl => pl.id === id
        ? { ...pl, lastWatered: formatISO(new Date(), { representation: 'date' }), rainDelay: false }
        : pl),
    })),
    markMisted: id => patch(s => ({
      ...s, plants: s.plants.map(pl => pl.id === id
        ? { ...pl, lastMisted: formatISO(new Date(), { representation: 'date' }) } : pl),
    })),
    markFertilized: id => patch(s => ({
      ...s, plants: s.plants.map(pl => pl.id === id
        ? { ...pl, lastFertilized: formatISO(new Date(), { representation: 'date' }) } : pl),
    })),
    answerRain: (id, w, gotWet) => patch(s => ({
      ...s, plants: s.plants.map(pl => pl.id === id ? applyRainAnswer(pl, w, gotWet) : pl),
    })),

    savePlanImage: async (dataUrl, width, height) => {
      await idbSet('plan:image', dataUrl)
      setPlanImage(dataUrl)
      patch(s => ({ ...s, plan: { ...s.plan, hasImage: true, width, height } }))
    },
    clearPlan: async () => {
      try { await idbDelete('plan:image') } catch { /* ignore */ }
      setPlanImage(null)
      patch(s => ({ ...s, plan: { ...DEFAULT_STATE.plan } }))
    },
    saveIcon: async (plantId, dataUrl) => {
      await idbSet(`icon:${plantId}`, dataUrl)
      setIcons(ic => ({ ...ic, [plantId]: dataUrl }))
    },

    exportData: async () => {
      const blobs = { planImage, icons }
      return JSON.stringify({ version: APP_VERSION, state, blobs }, null, 2)
    },
    importData: async json => {
      await applyPayload(JSON.parse(json))
      // an import is a local edit: push it to Drive on the next sync
      dirty.current = true
      if (isAuthenticated()) syncNowRef.current()
    },

    connectGoogle: () => signIn(), // redirects to Google
    disconnectGoogle: () => {
      clearGoogleToken()
      clearTimeout(syncTimer.current)
      setSync(s => ({ ...s, connected: false, syncing: false, error: null }))
    },
    refreshSync: () => { // called by AuthCallback after the token lands
      setSync(s => ({ ...s, connected: isAuthenticated(), error: null }))
      if (isAuthenticated()) syncNowRef.current()
    },
    syncNow,

    refreshWeather: async () => {
      if (!location) return
      try { setWeather(await fetchWeather(location)); setWeatherError(null) }
      catch (e) { setWeatherError(e.message) }
    },
  }), [patch, planImage, icons, state, location, applyPayload, syncNow])

  const value = useMemo(
    () => ({ state, weather, weatherError, planImage, icons, sync, ...api }),
    [state, weather, weatherError, planImage, icons, sync, api],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
