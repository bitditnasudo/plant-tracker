// Watering reminders as Google Calendar events. Google delivers the actual
// notifications (native push on every signed-in device + email), so the web
// app needs no backend. One event per plant on its next watering date,
// tagged with extendedProperties so we can update/remove our own events only.
import { addDays, formatISO } from 'date-fns'
import { getStoredToken, clearToken, AuthExpiredError } from './googleDrive.js'
import { getCatalogPlant } from './catalog.js'
import { waterDaysLeft } from './schedule.js'

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const REMINDER_HOUR = '09:00' // local time the reminder fires

export class CalendarScopeError extends Error {
  constructor() {
    super('Calendar permission missing — press "Connect Google Drive" again and make sure the calendar checkbox is ticked on Google\'s consent screen')
    this.name = 'CalendarScopeError'
  }
}

async function calFetch(url, options = {}) {
  const token = getStoredToken()
  if (!token) throw new AuthExpiredError()
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  if (res.status === 401) { clearToken(); throw new AuthExpiredError() }
  if (res.status === 403) {
    // distinguish "API not enabled in the Cloud project" from a missing scope
    const e = await res.json().catch(() => ({}))
    const reason = e?.error?.errors?.[0]?.reason || e?.error?.status || ''
    const msg = e?.error?.message || ''
    if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED' ||
        msg.includes('has not been used') || msg.includes('is disabled')) {
      throw new Error('The Google Calendar API is not enabled in your Google Cloud project. Enable it (APIs & Services → Library → "Google Calendar API"), wait a minute, then retry.')
    }
    throw new CalendarScopeError()
  }
  if (res.status === 204 || res.status === 410) return null // deleted / already gone
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e?.error?.message || `Calendar HTTP ${res.status}`)
  }
  return res.json()
}

export async function syncCalendarReminders(plants, latitude) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  // our previously created events, keyed by plant id
  const listUrl = `${CAL}?privateExtendedProperty=${encodeURIComponent('ptApp=plant-tracker')}&maxResults=250&singleEvents=true`
  const data = await calFetch(listUrl)
  const existing = new Map()
  for (const ev of data?.items || []) {
    const pid = ev.extendedProperties?.private?.ptPlantId
    if (pid) existing.set(pid, ev)
  }

  const seen = new Set()
  for (const p of plants) {
    const cat = getCatalogPlant(p.catalogId)
    if (!cat) continue
    seen.add(p.id)
    const left = waterDaysLeft(p, latitude)
    const date = formatISO(addDays(new Date(), Math.max(0, left)), { representation: 'date' })
    const body = {
      summary: `💧 Water ${p.nickname || cat.name}`,
      description: 'Plant Tracker watering reminder — open the app and tap the watering can when done.',
      start: { dateTime: `${date}T${REMINDER_HOUR}:00`, timeZone: tz },
      end: { dateTime: `${date}T${REMINDER_HOUR.slice(0, 3)}30:00`, timeZone: tz },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 0 }, { method: 'email', minutes: 0 }],
      },
      extendedProperties: { private: { ptApp: 'plant-tracker', ptPlantId: p.id } },
    }
    const ev = existing.get(p.id)
    if (!ev) {
      await calFetch(CAL, { method: 'POST', body: JSON.stringify(body) })
    } else if (!(ev.start?.dateTime || '').startsWith(date)) {
      await calFetch(`${CAL}/${ev.id}`, { method: 'PATCH', body: JSON.stringify(body) })
    }
  }

  // clean up events for plants that no longer exist
  for (const [pid, ev] of existing) {
    if (!seen.has(pid)) await calFetch(`${CAL}/${ev.id}`, { method: 'DELETE' })
  }
}

// remove every event we ever created (used when the toggle is switched off)
export async function clearCalendarReminders() {
  const listUrl = `${CAL}?privateExtendedProperty=${encodeURIComponent('ptApp=plant-tracker')}&maxResults=250&singleEvents=true`
  const data = await calFetch(listUrl)
  for (const ev of data?.items || []) {
    await calFetch(`${CAL}/${ev.id}`, { method: 'DELETE' })
  }
}
