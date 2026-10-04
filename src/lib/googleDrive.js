// Google Drive sync — same OAuth implicit-redirect flow as the Budget App,
// reusing its OAuth client. Scope is drive.file (only files this app creates).
// The whole app state lives in one JSON file inside a "PLANT TRACKER" folder.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
// drive.file: only files this app creates; calendar.events: watering reminders
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events'
export const SYNC_FILE_NAME = 'plant-tracker-sync.json'
const FOLDER_NAME = 'PLANT TRACKER'

// token keys are prefixed: the Budget App shares localhost:5173 in dev
const TK = 'pt_g_token'
const TE = 'pt_g_expiry'

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

export function clearToken() {
  _token = null
  localStorage.removeItem(TK)
  localStorage.removeItem(TE)
}

export function isAuthenticated() { return !!getStoredToken() }

// A random `state` travels to Google and back; the callback only accepts a
// token whose state matches, so a crafted /auth/callback#access_token=… link
// can't point the app at someone else's Drive. (localStorage, like the token
// itself: an installed iOS PWA can lose sessionStorage across the redirect.)
const STATE_KEY = 'pt_g_state'

export function signIn() {
  const state = crypto.randomUUID()
  localStorage.setItem(STATE_KEY, state)
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: window.location.origin + '/auth/callback',
    response_type: 'token',
    scope: SCOPES,
    prompt: 'select_account',
    state,
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// One-shot: true only for the state this tab sent.
export function consumeAuthState(returned) {
  const sent = localStorage.getItem(STATE_KEY)
  localStorage.removeItem(STATE_KEY)
  return !!sent && sent === returned
}

export class AuthExpiredError extends Error {
  constructor() { super('Google session expired'); this.name = 'AuthExpiredError' }
}

export class NotFoundError extends Error {
  constructor() { super('Sync file not found'); this.name = 'NotFoundError' }
}

async function driveFetch(url, options = {}, raw = false) {
  const token = getStoredToken()
  if (!token) throw new AuthExpiredError()
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  if (res.status === 401) {
    clearToken()
    throw new AuthExpiredError()
  }
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
  const token = getStoredToken()
  if (!token) throw new AuthExpiredError()
  const init = await fetch(initUrl, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(metadata),
  })
  if (init.status === 401) { clearToken(); throw new AuthExpiredError() }
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
