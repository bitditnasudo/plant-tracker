// Google Drive sync, reusing the Budget App's OAuth client. Scope is
// drive.file (only files this app creates) + calendar.events (reminders).
// The whole app state lives in one JSON file inside a "PLANT TRACKER" folder.
//
// Sign-in uses the authorization-code flow with offline access: Google returns
// a refresh token alongside the hour-long access token, and the app swaps it
// for a fresh access token whenever the old one runs out — so sync no longer
// stops every hour. The swap needs the client secret, which only the tiny
// /api/google-token function holds (api/google-token.js).

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
// drive.file: only files this app creates; calendar.events: watering reminders
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events'
export const SYNC_FILE_NAME = 'plant-tracker-sync.json'
const FOLDER_NAME = 'PLANT TRACKER'
const TOKEN_API = '/api/google-token'

// token keys are prefixed: the Budget App shares localhost:5173 in dev
const TK = 'pt_g_token'
const TE = 'pt_g_expiry'
const RT = 'pt_g_refresh'

let _token = null
let _expiry = 0

export function getStoredToken() {
  if (_token && Date.now() < _expiry) return _token
  const t = localStorage.getItem(TK)
  const e = Number(localStorage.getItem(TE) || 0)
  if (t && Date.now() < e) { _token = t; _expiry = e; return t }
  return null
}

export function storeToken(token, expiresIn) {
  _token = token
  _expiry = Date.now() + Number(expiresIn) * 1000 - 60000
  localStorage.setItem(TK, token)
  localStorage.setItem(TE, String(_expiry))
}

// forget the short-lived access token (a refresh token, if any, stays)
export function clearToken() {
  _token = null
  localStorage.removeItem(TK)
  localStorage.removeItem(TE)
}

const getRefreshToken = () => localStorage.getItem(RT)

// Disconnect: forget everything, and tell Google to revoke the grant.
export function signOut() {
  const rt = getRefreshToken()
  clearToken()
  localStorage.removeItem(RT)
  if (rt) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt)}`, { method: 'POST' }).catch(() => {})
}

// Connected = a live access token, or a refresh token to get one with.
export function isAuthenticated() { return !!getStoredToken() || !!getRefreshToken() }
export const canRenew = () => !!getRefreshToken()

async function tokenApi(body) {
  const res = await fetch(TOKEN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok && !!data.access_token, data }
}

// One refresh at a time, however many requests notice the expiry together.
let refreshing = null
async function refreshAccessToken() {
  const rt = getRefreshToken()
  if (!rt) throw new AuthExpiredError()
  refreshing ??= (async () => {
    try {
      // a network failure throws a TypeError here — "offline", not "signed out"
      const { ok, data } = await tokenApi({ refresh_token: rt })
      if (!ok) {
        // revoked, or expired (Google expires refresh tokens of apps still in
        // "Testing" after 7 days): only a real sign-in can fix that
        if (data.error === 'invalid_grant') localStorage.removeItem(RT)
        throw new AuthExpiredError()
      }
      storeToken(data.access_token, data.expires_in || 3600)
      return data.access_token
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export async function getAccessToken() {
  return getStoredToken() || refreshAccessToken()
}

// fetch with the bearer token; a 401 gets one silent refresh and a retry
export async function authFetch(url, options = {}) {
  const send = token => fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } })
  let res = await send(await getAccessToken())
  if (res.status === 401) {
    clearToken()
    if (!getRefreshToken()) throw new AuthExpiredError()
    res = await send(await refreshAccessToken())
    if (res.status === 401) { clearToken(); throw new AuthExpiredError() }
  }
  return res
}

// A random `state` travels to Google and back; the callback only accepts a
// code whose state matches, so a crafted /auth/callback link can't point the
// app at someone else's Drive. (localStorage, like the tokens: an installed
// iOS PWA can lose sessionStorage across the redirect.)
const STATE_KEY = 'pt_g_state'
const redirectUri = () => window.location.origin + '/auth/callback'

// Is the token function deployed with its secret? An empty request answers
// "missing_grant" when it is and "not_configured" when it isn't.
async function serverReady() {
  try {
    const res = await fetch(TOKEN_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const data = await res.json().catch(() => ({}))
    return data.error === 'missing_grant'
  } catch {
    return false
  }
}

export async function signIn() {
  const state = crypto.randomUUID()
  localStorage.setItem(STATE_KEY, state)
  // Until the server side is set up, fall back to the old hour-long token
  // (implicit flow) rather than a sign-in that can't complete.
  const renewable = await serverReady()
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
    ...(renewable
      ? {
          response_type: 'code',
          access_type: 'offline',           // → a refresh token
          prompt: 'consent select_account', // consent every time, or Google omits the refresh token
          include_granted_scopes: 'true',
        }
      : { response_type: 'token', prompt: 'select_account' }),
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// One-shot: true only for the state this device sent.
export function consumeAuthState(returned) {
  const sent = localStorage.getItem(STATE_KEY)
  localStorage.removeItem(STATE_KEY)
  return !!sent && sent === returned
}

// The callback's one-time code → access + refresh tokens (via the server).
export async function completeSignIn(code) {
  const { ok, data } = await tokenApi({ code, redirect_uri: redirectUri() })
  if (!ok) {
    throw new Error(data.error === 'not_configured'
      ? 'Sign-in isn’t set up on the server yet (GOOGLE_CLIENT_SECRET is missing).'
      : `Google sign-in failed${data.error_description ? `: ${data.error_description}` : data.error ? ` (${data.error})` : ''}.`)
  }
  storeToken(data.access_token, data.expires_in || 3600)
  if (data.refresh_token) localStorage.setItem(RT, data.refresh_token)
}

export class AuthExpiredError extends Error {
  constructor() { super('Google session expired'); this.name = 'AuthExpiredError' }
}

export class NotFoundError extends Error {
  constructor() { super('Sync file not found'); this.name = 'NotFoundError' }
}

async function driveFetch(url, options = {}, raw = false) {
  const res = await authFetch(url, options)
  if (res.status === 404) throw new NotFoundError()
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Drive HTTP ${res.status}`)
  }
  return raw ? res : res.json()
}

export async function findSyncFile() {
  const q = encodeURIComponent(`name='${SYNC_FILE_NAME}' and trashed=false`)
  const data = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`)
  return data.files?.[0] || null
}

async function ensureFolder() {
  const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`)
  const data = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`)
  if (data.files?.[0]) return data.files[0].id
  const created = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  return created.id
}

// Resumable uploads: the simple multipart/media protocols cap at 5 MB, which a
// large floor-plan image can exceed. Resumable handles any size.
async function uploadResumable(method, initUrl, metadata, jsonString) {
  const init = await authFetch(initUrl, {
    method,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(metadata),
  })
  if (init.status === 404) throw new NotFoundError()
  if (!init.ok) throw new Error(`Drive upload init failed (${init.status})`)
  const location = init.headers.get('Location')
  if (!location) throw new Error('Drive did not return an upload session')
  const up = await fetch(location, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: jsonString,
  })
  if (!up.ok) throw new Error(`Drive upload failed (${up.status})`)
  return up.json()
}

export async function createSyncFile(jsonString) {
  const folderId = await ensureFolder()
  const created = await uploadResumable(
    'POST',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,version',
    { name: SYNC_FILE_NAME, parents: [folderId], mimeType: 'application/json' },
    jsonString,
  )
  return created // {id, version}
}

// returns {id, version}
export async function updateSyncFile(fileId, jsonString) {
  return uploadResumable(
    'PATCH',
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable&fields=id,version`,
    {},
    jsonString,
  )
}

export async function downloadSyncFile(fileId) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {}, true)
  return res.json()
}

// Cheap "did anything change?" probe. `version` is Drive's own counter, so the
// check never depends on two devices' clocks agreeing.
export async function getSyncFileInfo(fileId) {
  return driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,version,trashed`)
}

/* ── Daily snapshots ──────────────────────────────────────────────────────
 * Once a day the sync file is copied to plant-tracker-YYYY-MM-DD.json in the
 * same folder; the newest SNAPSHOT_KEEP are kept and older ones go to the
 * Drive trash (recoverable for 30 days), never deleted outright. */
export const SNAPSHOT_KEEP = 14
const SNAP_PREFIX = 'plant-tracker-20'

export async function listSnapshots() {
  const q = encodeURIComponent(`name contains '${SNAP_PREFIX}' and trashed=false`)
  const data = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&pageSize=100`)
  return (data.files || [])
    .filter(f => /^plant-tracker-\d{4}-\d{2}-\d{2}\.json$/.test(f.name))
    .sort((a, b) => b.name.localeCompare(a.name))
}

export async function snapshotIfDue(fileId, day) {
  const existing = await listSnapshots()
  if (!existing.some(f => f.name === `plant-tracker-${day}.json`)) {
    const folderId = await ensureFolder()
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `plant-tracker-${day}.json`, parents: [folderId] }),
    })
    existing.unshift({ name: `plant-tracker-${day}.json` })
  }
  for (const old of existing.slice(SNAPSHOT_KEEP)) {
    if (!old.id) continue
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${old.id}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
  }
}

export async function downloadSnapshot(id) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {}, true)
  return res.text()
}
