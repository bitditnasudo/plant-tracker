import { differenceInCalendarDays, addDays, parseISO, formatISO, subDays } from 'date-fns'
import { getCatalogPlant } from './catalog.js'

// Rain rules (see README): rain never auto-waters a plant — pots under eaves or
// dense foliage may stay dry, so the user confirms via the red bubble first.
// Confirmed rain >= FULL_RAIN_MM counts as a full watering; lighter confirmed
// rain only pushes the schedule one day.
export const RAIN_ASK_MM = 1   // yesterday's rain needed before we even ask
export const FULL_RAIN_MM = 5  // confirmed rain that counts as a full watering

// Growing season by hemisphere (fallback: northern)
export function isGrowingSeason(date = new Date(), latitude = 20) {
  const m = date.getMonth() + 1 // 1-12
  return latitude >= 0 ? (m >= 4 && m <= 9) : (m <= 3 || m >= 10)
}

export function waterIntervalDays(plant, latitude) {
  const cat = getCatalogPlant(plant.catalogId)
  if (!cat) return 7
  return isGrowingSeason(new Date(), latitude) ? cat.waterSummer : cat.waterWinter
}

function daysUntil(lastISO, intervalDays) {
  if (!lastISO) return 0 // never done -> due now
  const next = addDays(parseISO(lastISO), intervalDays)
  return differenceInCalendarDays(next, new Date())
}

export function waterDaysLeft(plant, latitude) {
  let left = daysUntil(plant.lastWatered, waterIntervalDays(plant, latitude))
  // light confirmed rain delays by one day
  if (plant.rainDelay) left += 1
  return left
}

export function fertilizeDaysLeft(plant) {
  const cat = getCatalogPlant(plant.catalogId)
  if (!cat) return null
  return daysUntil(plant.lastFertilized, cat.fertilize)
}

export function mistDaysLeft(plant) {
  const cat = getCatalogPlant(plant.catalogId)
  if (!cat || !cat.mist) return null
  return daysUntil(plant.lastMisted, cat.mist)
}

export function daysLeftLabel(days) {
  if (days === null || days === undefined) return ''
  if (days < 0) return `${-days}d overdue`
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days`
}

// Should the red rain bubble show for this plant?
// Outdoor plant + measurable rain yesterday + not yet answered for that date.
export function needsRainAnswer(plant, weather) {
  if (!weather || weather.yesterdayRainMm < RAIN_ASK_MM) return false
  const cat = getCatalogPlant(plant.catalogId)
  if (!cat || !cat.outdoor || !plant.isOutside) return false
  // watered on or after the rain day — the rain can't add anything
  if (plant.lastWatered && plant.lastWatered >= weather.yesterdayDate) return false
  return plant.rainAnsweredFor !== weather.yesterdayDate
}

// Apply the user's rain answer. Returns the updated plant object.
export function applyRainAnswer(plant, weather, gotWet) {
  const updated = { ...plant, rainAnsweredFor: weather.yesterdayDate, rainDelay: false }
  if (gotWet) {
    if (weather.yesterdayRainMm >= FULL_RAIN_MM) {
      // treat as watered yesterday
      updated.lastWatered = formatISO(subDays(new Date(), 1), { representation: 'date' })
    } else {
      updated.rainDelay = true
    }
  }
  return updated
}
