// Care reminders as Google Calendar events. Google delivers the actual
// notifications (native push on every signed-in device + email), so the web
// app needs no backend. One event per plant per care kind — watering, and with
// settings.calendarCare also misting and feeding — on its next due date,
// tagged with extendedProperties so we can update/remove our own events only.
import { addDays, formatISO } from 'date-fns'
import { getStoredToken, clearToken, AuthExpiredError } from './googleDrive.js'
import { getCatalogPlant } from './catalog.js'
import { waterDaysLeft, mistDaysLeft, fertilizeDaysLeft } from './schedule.js'

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

const KINDS = [
  { kind: 'water', emoji: '💧', verb: 'Water', left: (p, lat) => waterDaysLeft(p, lat), always: true },
  { kind: 'mist',  emoji: '💨', verb: 'Mist',  left: p => mistDaysLeft(p) },
  { kind: 'feed',  emoji: '🌱', verb: 'Feed',  left: p => fertilizeDaysLeft(p) },
]

const pad = n => String(n).padStart(2, '0')

// Due date at the reminder hour. An overdue reminder (or one due today whose
// hour has passed) goes to the next whole hour instead, so it actually fires
// rather than sitting silently in the past.
export function reminderStart(daysLeft, hour, now = new Date()) {
  const due = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour), Math.max(0, daysLeft))
  if (due > now) return due
  const next = new Date(now)
  next.setMinutes(0, 0, 0)
  next.setHours(next.getHours() + 1)
  return next
}
const localDateTime = d =>
  `${formatISO(d, { representation: 'date' })}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`

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

const LIST_URL = `${CAL}?privateExtendedProperty=${encodeURIComponent('ptApp=plant-tracker')}&maxResults=2500&singleEvents=true`

export async function syncCalendarReminders(plants, settings = {}) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const hour = Number.isInteger(settings.reminderHour) ? settings.reminderHour : 9
  const lat = settings.location?.lat

  // our previously created events, keyed by plant id + kind (events made
  // before mist/feed reminders existed carry no kind: they are watering)
  const data = await calFetch(LIST_URL)
  const existing = new Map()
  for (const ev of data?.items || []) {
    const pr = ev.extendedProperties?.private || {}
    if (pr.ptPlantId) existing.set(`${pr.ptPlantId}:${pr.ptKind || 'water'}`, ev)
  }

  const seen = new Set()
  for (const p of plants) {
    const cat = getCatalogPlant(p.catalogId)
    if (!cat) continue
    const name = p.nickname || cat.name
    for (const k of KINDS) {
      if (!k.always && !settings.calendarCare) continue
      const left = k.left(p, lat)
      if (left === null || left === undefined) continue // e.g. a species that isn't misted
      const key = `${p.id}:${k.kind}`
      seen.add(key)
      const start = reminderStart(left, hour)
      const end = new Date(start.getTime() + 30 * 60 * 1000)
      const body = {
        summary: `${k.emoji} ${k.verb} ${name}`,
        description: 'Plant Tracker reminder — open the app and log it when done.',
        start: { dateTime: localDateTime(start), timeZone: tz },
        end: { dateTime: localDateTime(end), timeZone: tz },
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 0 }, { method: 'email', minutes: 0 }],
        },
        extendedProperties: { private: { ptApp: 'plant-tracker', ptPlantId: p.id, ptKind: k.kind } },
      }
      const ev = existing.get(key)
      if (!ev) {
        await calFetch(CAL, { method: 'POST', body: JSON.stringify(body) })
      } else if (!(ev.start?.dateTime || '').startsWith(localDateTime(start).slice(0, 16)) || ev.summary !== body.summary) {
        await calFetch(`${CAL}/${ev.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      }
    }
  }

  // clean up events for plants (or reminder kinds) that are gone
  for (const [key, ev] of existing) {
    if (!seen.has(key)) await calFetch(`${CAL}/${ev.id}`, { method: 'DELETE' })
  }
}

// remove every event we ever created (used when the toggle is switched off)
export async function clearCalendarReminders() {
  const data = await calFetch(LIST_URL)
  for (const ev of data?.items || []) {
    await calFetch(`${CAL}/${ev.id}`, { method: 'DELETE' })
  }
}
