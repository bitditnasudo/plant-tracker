import { differenceInCalendarDays, addDays, parseISO, formatISO, subDays } from 'date-fns'
import { getCatalogPlant } from './catalog.js'

// Rain rules (see README): rain never auto-waters a plant — pots under eaves or
// dense foliage may stay dry, so the user confirms via the red bubble first.
// Confirmed rain >= FULL_RAIN_MM counts as a full watering; lighter confirmed
// rain only pushes the schedule one day.
export const RAIN_ASK_MM = 1   // yesterday's rain needed before we even ask
export const FULL_RAIN_MM = 5  // rain we *suggest* counts as a full soak

// The user is the sensor: whatever the gauge says, they decide what the pot got.
export const RAIN_OUTCOME = { SOAKED: 'soaked', DAMP: 'damp', DRY: 'dry' }

// Wind/exposure multipliers on the base watering interval. Wind raises
// evapotranspiration and dries potting mix faster than still air.
export const EXPOSURE_LEVELS = {
  sheltered: { label: 'Sheltered', factor: 1,    hint: 'indoors, or a protected corner' },
  moderate:  { label: 'Moderate',  factor: 0.85, hint: 'patio or courtyard, some breeze' },
  high:      { label: 'High wind', factor: 0.6,  hint: 'exposed balcony, rooftop, high-rise' },
}

// Drought-adapted plants lose far less to wind than thin-leaved ones, so the
// exposure effect is damped for them — a barrel cactus on a windy balcony
// should not get watered like an allamanda.
function windSensitivity(cat) {
  if (!cat) return 1
  if (cat.category === 'cactus' || cat.category === 'succulent') return 0.35
  if (cat.waterSummer >= 12) return 0.5 // very drought tolerant (yucca, ZZ, snake plant…)
  return 1
}

// Explicit per-plant setting wins; otherwise outdoor plants assume some breeze.
export function resolveExposure(plant) {
  if (plant.exposure && EXPOSURE_LEVELS[plant.exposure]) return plant.exposure
  return plant.isOutside ? 'moderate' : 'sheltered'
}

// Growing season by hemisphere (fallback: northern)
export function isGrowingSeason(date = new Date(), latitude = 20) {
  const m = date.getMonth() + 1 // 1-12
  return latitude >= 0 ? (m >= 4 && m <= 9) : (m <= 3 || m >= 10)
}

export function baseIntervalDays(plant, latitude) {
  const cat = getCatalogPlant(plant.catalogId)
  if (!cat) return 7
  return isGrowingSeason(new Date(), latitude) ? cat.waterSummer : cat.waterWinter
}

export function waterIntervalDays(plant, latitude) {
  // a manual override always wins — the user's own observation beats the model
  if (plant.intervalOverride > 0) return Math.max(1, Math.round(plant.intervalOverride))
  const cat = getCatalogPlant(plant.catalogId)
  const base = baseIntervalDays(plant, latitude)
  const { factor } = EXPOSURE_LEVELS[resolveExposure(plant)] || EXPOSURE_LEVELS.sheltered
  const damped = 1 - (1 - factor) * windSensitivity(cat)
  return Math.max(1, Math.round(base * damped))
}

// For the UI: how the effective interval was arrived at.
export function intervalBreakdown(plant, latitude) {
  return {
    base: baseIntervalDays(plant, latitude),
    exposure: resolveExposure(plant),
    override: plant.intervalOverride > 0 ? Math.max(1, Math.round(plant.intervalOverride)) : null,
    effective: waterIntervalDays(plant, latitude),
  }
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
// SOAKED is a real watering event — identical to tapping the watering can,
// just dated to the rain day — regardless of what the rain gauge reported.
// The mm figure only drives which option we *suggest*, never what a
// confirmation does; a forecast-grid total says little about what actually
// reached a pot on an exposed balcony.
export function applyRainAnswer(plant, weather, outcome) {
  // tolerate the old boolean callers
  const o = outcome === true ? RAIN_OUTCOME.SOAKED
    : outcome === false ? RAIN_OUTCOME.DRY
    : outcome

  const rainDay = weather.yesterdayDate ||
    formatISO(subDays(new Date(), 1), { representation: 'date' })
  const updated = { ...plant, rainAnsweredFor: rainDay, rainDelay: false }

  if (o === RAIN_OUTCOME.SOAKED) {
    updated.lastWatered = rainDay      // the field waterDaysLeft() reads
    updated.lastWateredBy = 'rain'     // provenance, for the card copy
  } else if (o === RAIN_OUTCOME.DAMP) {
    updated.rainDelay = true           // partial top-up: nudge one day
  }
  return updated
}
