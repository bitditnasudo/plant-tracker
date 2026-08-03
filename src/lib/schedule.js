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

/* ── Wind-driven interval adjustment (outdoor plants only) ──────────────────
 * Wind raises evapotranspiration, so potting mix on an exposed balcony dries
 * far faster than the species' book interval assumes. We average real wind
 * over the days a plant has actually been sitting there since its last
 * watering, then cut the interval by a tier, modulated by how much the
 * species cares about wind. All knobs below are tunable.
 */

// Which daily figure represents "the wind that day". 'max' is each day's peak
// sustained wind and is the same scale as the number on the dashboard weather
// card; 'mean' is the 24h average and runs roughly a third of it.
export const WIND_DAILY_METRIC = 'max'

export const WIND_FALLBACK_WINDOW = 7 // days to average when lastWatered is unknown

// Tiers on the average wind since last watering.
export const WIND_TIERS = [
  { id: 'calm',   label: 'Calm',   belowKmh: 10,       cut: 0     }, // < 10 km/h  → no change
  { id: 'breezy', label: 'Breezy', belowKmh: 20,       cut: 0.175 }, // 10–20 km/h → ~17.5% shorter
  { id: 'windy',  label: 'Windy',  belowKmh: Infinity, cut: 0.325 }, // > 20 km/h  → ~32.5% shorter
]

// Species modulation of the tier cut, derived automatically (see perenual.js).
export const WIND_SENSITIVITY = {
  low:    { label: 'Low',    factor: 0.3, hint: 'drought-adapted — wind barely matters' },
  normal: { label: 'Normal', factor: 1,   hint: 'typical foliage' },
  high:   { label: 'High',   factor: 1.3, hint: 'soft broad leaves or thirsty bloomer — dries fast in wind' },
}

export const MAX_WIND_CUT = 0.6 // never shorten by more than this, whatever the maths says

/* Daily wind history, registered by the store (device-local cache, backfilled
 * from Open-Meteo). Kept module-level so schedule functions stay pure-ish and
 * callers don't have to thread it through every signature. */
let windLog = {}
export function setWindLog(log) { windLog = log || {} }
export function getWindLog() { return windLog }

// Average wind (km/h) over the days since `sinceISO`, exclusive of that day.
// Returns null when we have no usable data — callers then skip the adjustment.
export function avgWindSince(sinceISO) {
  const days = Object.keys(windLog).sort()
  if (!days.length) return null
  const today = formatISO(new Date(), { representation: 'date' })
  const from = sinceISO || formatISO(subDays(new Date(), WIND_FALLBACK_WINDOW), { representation: 'date' })

  const pick = d => windLog[d]?.[WIND_DAILY_METRIC]
  let vals = days.filter(d => d > from && d <= today).map(pick).filter(v => typeof v === 'number')
  // watered today (empty window) or history doesn't reach back that far
  if (!vals.length) vals = days.slice(-3).map(pick).filter(v => typeof v === 'number')
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export function windTierFor(avgKmh) {
  if (typeof avgKmh !== 'number') return null
  return WIND_TIERS.find(t => avgKmh < t.belowKmh) || WIND_TIERS[WIND_TIERS.length - 1]
}

/* Wind sensitivity, derived automatically — never entered by hand.
 *
 * Confirmed against the live v2/species/details payload (Allamanda id 662):
 * the response carries `drought_tolerant` (a boolean, not documented on the
 * public field list), `type` ("Broadleaf evergreen"), `watering` ("Frequent"),
 * `growth_rate`, `care_level`, `flowers`, `salt_tolerant` and `tropical`.
 * The richer xWatering* fields exist but are Supreme-tier placeholders.
 *
 * Species above ~id 3000 return HTTP 429 on the free tier with no care data
 * at all (verified with 90/100 daily requests still unused), so this must
 * also work from name/taxonomy alone — that is what the regex is for.
 */
export function deriveWindSensitivity(d = {}) {
  const type = String(d.type || '').toLowerCase()
  const watering = String(d.watering || '').toLowerCase()
  const hay = [
    d.common_name, (d.scientific_name || []).join(' '), d.family, d.name, d.latin, type,
  ].filter(Boolean).join(' ').toLowerCase()

  // ── low: loses little to wind ──
  if (d.drought_tolerant === true) return 'low'
  if (/cact|succulent|agave|aloe|euphorbia|crassula|sedum|echeveria|haworthia|yucca|sansevieria|phormium|flax|lavand|rosmarin|olive/.test(hay)) return 'low'
  if (watering === 'minimum') return 'low'

  // ── high: thirsty AND soft/broad/flowering foliage ──
  const soft = /broadleaf|herbaceous|flower|fern|vine|annual/.test(type) || d.flowers === true
  if (watering === 'frequent' && soft) return 'high'
  if (watering === 'frequent' && String(d.growth_rate || '').toLowerCase() === 'high') return 'high'

  return 'normal'
}

// Fallback for plants with no stored classification: bundled catalogue
// species, species whose care data the free tier withholds, and anything
// added before this feature existed. Taxonomy first, then the care numbers.
export function deriveWindSensitivityFromCatalog(cat) {
  if (!cat) return 'normal'
  if (cat.windSensitivity && WIND_SENSITIVITY[cat.windSensitivity]) return cat.windSensitivity

  const byName = deriveWindSensitivity({ common_name: cat.name, scientific_name: [cat.latin], type: cat.category })
  if (byName !== 'normal') return byName

  if (cat.category === 'cactus' || cat.category === 'succulent') return 'low'
  if (cat.waterSummer >= 12) return 'low'   // yucca, snake plant, ZZ…
  if (cat.waterSummer <= 4) return 'high'   // basil, ferns, zinnia…
  return 'normal'
}

// Manual override → value stored on the plant at add time → catalogue fallback.
export function resolveWindSensitivity(plant, cat = getCatalogPlant(plant.catalogId)) {
  const o = plant.windSensitivityOverride
  if (o && WIND_SENSITIVITY[o]) return o
  const s = plant.windSensitivity
  if (s && WIND_SENSITIVITY[s]) return s
  return deriveWindSensitivityFromCatalog(cat)
}

// The whole wind picture for one plant. Indoor plants are never touched.
export function windAdjustment(plant) {
  const none = { applies: false, avgKmh: null, tier: null, sensitivity: null, cut: 0 }
  if (!plant.isOutside) return none
  const avgKmh = avgWindSince(plant.lastWatered)
  const tier = windTierFor(avgKmh)
  if (!tier) return none
  const sensitivity = resolveWindSensitivity(plant)
  const cut = Math.min(MAX_WIND_CUT, tier.cut * WIND_SENSITIVITY[sensitivity].factor)
  return { applies: true, avgKmh, tier, sensitivity, cut }
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
  const base = baseIntervalDays(plant, latitude)
  const { cut } = windAdjustment(plant)
  return Math.max(1, Math.round(base * (1 - cut)))
}

// For the UI: how the effective interval was arrived at.
export function intervalBreakdown(plant, latitude) {
  const base = baseIntervalDays(plant, latitude)
  const wind = windAdjustment(plant)
  return {
    base,
    wind,
    modelled: Math.max(1, Math.round(base * (1 - wind.cut))),
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
