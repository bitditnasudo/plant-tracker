// Google Drive sync — same OAuth implicit-redirect flow as the Budget App,
// reusing its OAuth client. Scope is drive.file (only files this app creates).
// The whole app state lives in one JSON file inside a "PLANT TRACKER" folder.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPES = 'https://www.googleapis.com/auth/drive.file'
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

export function signIn() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: window.location.origin + '/auth/callback',
    response_type: 'token',
    scope: SCOPES,
    prompt: 'select_account',
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export class AuthExpiredError extends Error {
  constructor() { super('Google session expired'); this.name = 'AuthExpiredError' }
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

export async function createSyncFile(jsonString) {
  const folderId = await ensureFolder()
  const boundary = 'pt-sync-' + Date.now()
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: SYNC_FILE_NAME, parents: [folderId], mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    jsonString +
    `\r\n--${boundary}--`
  const created = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
  )
  return created.id
}

export async function updateSyncFile(fileId, jsonString) {
  return driveFetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: jsonString },
  )
}

export async function downloadSyncFile(fileId) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {}, true)
  return res.json()
}
