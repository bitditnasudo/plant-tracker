import { differenceInCalendarDays, addDays, parseISO, formatISO, subDays, format } from 'date-fns'
import { getCatalogPlant } from './catalog.js'
import { feedGroup, feedRule, isFeedingSeason, nextSeasonStart, seasonFeedDays, winterFeedDays, FLUSH, flushRestsInWinter } from './feeding.js'

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

/* Field-reported ceilings for OUTDOOR POTTED plants in the growing season.
 *
 * Perenual's watering_general_benchmark is a generic figure that assumes
 * in-ground or sheltered growing — for Allamanda it says 7–10 days. Container
 * growers report something else entirely: potted allamanda every 1–2 days at
 * 21–32°C (greg.app) or 2–3 days in spring/summer; potted lantana "daily or
 * every two days" in hot arid regions; and the general container rule is
 * every 1–2 days in summer, daily above ~29°C, with wind explicitly named as
 * an accelerant (Gardening Know How, Proven Winners, Old Farmer's Almanac).
 *
 * A percentage cut off a 9-day benchmark can never reach 2–3 days, so the
 * ceiling is applied to the base BEFORE wind, and wind then modulates within
 * it. The cap only ever shortens, so species whose base is already
 * container-realistic (zinnia at 3 days) are left alone. Drought-adapted
 * plants are exempt — a barrel cactus in a pot really does go a fortnight.
 */
export const OUTDOOR_POT_CAP_DAYS = { high: 4, normal: 7, low: Infinity }
export const DORMANT_CAP_MULTIPLIER = 2 // evaporation collapses out of season

/* Daily wind history, registered by the store (device-local cache, backfilled
 * from Open-Meteo). Kept module-level so schedule functions stay pure-ish and
 * callers don't have to thread it through every signature. */
let windLog = {}
export function setWindLog(log) { windLog = log || {} }

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
  // (measured days only — the log also holds today's and tomorrow's forecast)
  if (!vals.length) vals = days.filter(d => d < today).slice(-3).map(pick).filter(v => typeof v === 'number')
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

// Growing season by hemisphere (fallback: northern). Only a fallback now —
// see dryingFactor() — for when there is no location or no weather yet.
export function isGrowingSeason(date = new Date(), latitude = 20) {
  const m = date.getMonth() + 1 // 1-12
  return latitude >= 0 ? (m >= 4 && m <= 9) : (m <= 3 || m >= 10)
}

/* ── Weather-driven season (ET0) ──────────────────────────────────────────
 * Each species has a summer and a winter interval. Which one applies used to
 * be a calendar (April–September), which in Querétaro put the hot, bone-dry
 * March in "winter" and the cloudy rainy season in "summer". Instead the
 * location's own evaporation decides: FAO-56 reference evapotranspiration
 * (ET0, from Open-Meteo), which combines the sun, heat, humidity and wind
 * that dry a pot out. The past week's average is placed on this location's
 * yearly range — its least and most evaporative month — and the interval
 * slides between the winter and summer figure in proportion.
 *
 * ET0 is measured outdoors. Indoor pots feel it damped (no direct wind or
 * rain), but dry air and strong light follow the same seasons, so the same
 * position on the range is used for them; the species' own summer/winter
 * figures already describe an indoor plant.
 */
export const ET0_RECENT_DAYS = 7
export const ET0_MIN_RANGE_MM = 0.5 // a flatter year than this has no dry season to follow

let et0Climate = null
export function setEt0Climate(c) { et0Climate = c || null }

// Mean ET0 over the last measured days (forecast days excluded). Only days
// from the past week and a bit count: after a long spell offline the log
// holds old weather, and an old heatwave must not keep shortening intervals.
export const ET0_MAX_AGE_DAYS = 10
export function recentEt0(days = ET0_RECENT_DAYS) {
  const today = formatISO(new Date(), { representation: 'date' })
  const oldest = formatISO(subDays(new Date(), ET0_MAX_AGE_DAYS), { representation: 'date' })
  const vals = Object.keys(windLog).sort()
    .filter(d => d < today && d >= oldest)
    .map(d => windLog[d]?.et0)
    .filter(v => typeof v === 'number')
    .slice(-days)
  if (vals.length < Math.min(3, days)) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

// 0 = this location's least drying conditions (winter figure), 1 = its most
// drying (summer figure). Without a recent week of weather (offline, or the
// first launch) it uses what this month is usually like here; with no
// climate data at all, the calendar.
export function dryingFactor(latitude) {
  const c = et0Climate
  if (c && typeof c.low === 'number' && typeof c.high === 'number') {
    if (c.high - c.low < ET0_MIN_RANGE_MM) {
      return { factor: 1, source: 'flat', recent: recentEt0(), low: c.low, high: c.high }
    }
    let recent = recentEt0()
    let source = 'et0'
    if (recent === null) {
      recent = c.monthly?.[String(new Date().getMonth() + 1).padStart(2, '0')] ?? null
      source = 'month'
    }
    if (recent !== null) {
      const factor = Math.min(1, Math.max(0, (recent - c.low) / (c.high - c.low)))
      return { factor, source, recent, low: c.low, high: c.high }
    }
  }
  const factor = isGrowingSeason(new Date(), latitude) ? 1 : 0
  return { factor, source: 'calendar', recent: null, low: null, high: null }
}

export function baseIntervalDays(plant, latitude) {
  const cat = getCatalogPlant(plant.catalogId)
  if (!cat) return 7
  const { factor } = dryingFactor(latitude)
  return Math.max(1, Math.round(cat.waterWinter + factor * (cat.waterSummer - cat.waterWinter)))
}

// Base interval after the outdoor-container ceiling. Indoor pots dry slowly,
// so they keep the species figure untouched.
export function potCappedBase(plant, latitude) {
  const base = baseIntervalDays(plant, latitude)
  if (!plant.isOutside) return base
  let cap = OUTDOOR_POT_CAP_DAYS[resolveWindSensitivity(plant)] ?? Infinity
  // the ceiling relaxes the same way, up to DORMANT_CAP_MULTIPLIER × in the least drying weather
  if (cap !== Infinity) cap = Math.round(cap * (1 + (1 - dryingFactor(latitude).factor) * (DORMANT_CAP_MULTIPLIER - 1)))
  return Math.min(base, cap)
}

/* ── Learning from the soil checks ───────────────────────────────────────
 * The species figures are generic; your pots, mix and rooms are not. Each
 * hand watering compares how long the plant actually went with the interval
 * the app had scheduled, and moves a per-plant factor halfway towards it:
 *   watered early (it was dry before the check) → shorter from now on;
 *   watered late AFTER a "still damp" check     → longer from now on.
 * Being late with no damp check proves nothing (the reminder may simply have
 * been ignored), so it never lengthens the interval. Each watering moves the
 * factor at most a third, and it stays within half to double the model. */
export const LEARN = { rate: 0.5, stepMin: 0.75, stepMax: 4 / 3, min: 0.5, max: 2, deadband: 0.1 }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function learnedFactor(plant) {
  const f = plant.waterLearn
  return typeof f === 'number' && f > 0 ? clamp(f, LEARN.min, LEARN.max) : 1
}

// Interval from the weather, pot and wind model alone, before learning.
export function modelledIntervalDays(plant, latitude) {
  const base = potCappedBase(plant, latitude)
  const { cut } = windAdjustment(plant)
  return base * (1 - cut)
}

export function waterIntervalDays(plant, latitude) {
  // a manual override always wins — the user's own observation beats the model
  if (plant.intervalOverride > 0) return Math.max(1, Math.round(plant.intervalOverride))
  return Math.max(1, Math.round(modelledIntervalDays(plant, latitude) * learnedFactor(plant)))
}

// The new factor after a hand watering on `date`, or null for no change.
export function learnFromWatering(plant, date, latitude) {
  if (plant.intervalOverride > 0 || !plant.lastWatered || !date) return null
  const observed = differenceInCalendarDays(parseISO(date), parseISO(plant.lastWatered))
  if (observed < 1) return null
  let ratio = observed / waterIntervalDays(plant, latitude)
  const checkedDamp = !!plant.dampOn && plant.dampOn >= plant.lastWatered
  if (ratio > 1 && !checkedDamp) ratio = 1
  if (Math.abs(ratio - 1) < LEARN.deadband) return null
  const step = clamp(1 + LEARN.rate * (ratio - 1), LEARN.stepMin, LEARN.stepMax)
  const next = clamp(learnedFactor(plant) * step, LEARN.min, LEARN.max)
  return Math.round(next * 1000) / 1000
}

// For the UI: how the effective interval was arrived at.
export function intervalBreakdown(plant, latitude) {
  const base = baseIntervalDays(plant, latitude)
  const capped = potCappedBase(plant, latitude)
  const wind = windAdjustment(plant)
  const cat = getCatalogPlant(plant.catalogId)
  return {
    base,
    summer: cat?.waterSummer ?? null,
    winter: cat?.waterWinter ?? null,
    drying: dryingFactor(latitude),
    capped,
    capApplied: capped < base,
    wind,
    modelled: Math.max(1, Math.round(capped * (1 - wind.cut))),
    learned: learnedFactor(plant),
    learnedDays: Math.max(1, Math.round(modelledIntervalDays(plant, latitude) * learnedFactor(plant))),
    override: plant.intervalOverride > 0 ? Math.max(1, Math.round(plant.intervalOverride)) : null,
    effective: waterIntervalDays(plant, latitude),
  }
}

/* The schedule says when to CHECK, not when to pour: every extension source
 * says to feel the soil rather than water by the calendar — about an inch
 * down (UConn, Iowa State; Illinois says two inches, and that wilting can
 * also mean over-watering). Links checked 2026-10-19. If it's still damp,
 * the check comes back the next day. */
export const DAMP_RECHECK_DAYS = 1
export const SOIL_CHECK = {
  how: 'Push a finger into the potting mix: water if it’s dry about an inch (2–3 cm) down, and if it’s still damp, wait and check again tomorrow. Wilting can mean too much water as well as too little, so feel before you pour.',
  sources: [
    { label: 'UConn Extension — watering houseplants', url: 'https://extension.uconn.edu/2013/12/24/watering-houseplants/' },
    { label: 'Iowa State Extension — watering houseplants in winter', url: 'https://yardandgarden.extension.iastate.edu/faq/how-often-should-houseplants-be-watered-during-winter-months' },
    { label: 'University of Illinois Extension — watering', url: 'https://extension.illinois.edu/houseplants/watering' },
  ],
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
  // "still damp" at a soil check: look again tomorrow rather than nag today
  if (plant.dampOn && (!plant.lastWatered || plant.dampOn >= plant.lastWatered)) {
    left = Math.max(left, daysUntil(plant.dampOn, DAMP_RECHECK_DAYS))
  }
  return left
}

/* Feeding follows the plant's cited group rule (feeding.js), not a stored
 * per-species number. Out of season the next feed waits for the season to
 * start again — fertilizer a resting plant can't use stays in the pot as salt.
 * Where winter is mild (and for orchids everywhere) it slows down instead. */
export function feedingPlan(plant, latitude) {
  const cat = getCatalogPlant(plant.catalogId)
  if (!cat) return null
  const today = new Date()
  const rule = feedRule(plant, cat)
  const inSeason = isFeedingSeason(today, latitude)
  const winter = winterFeedDays(rule, latitude)
  const days = inSeason || winter === null ? seasonFeedDays(rule, latitude) : winter
  let next = plant.lastFertilized ? addDays(parseISO(plant.lastFertilized), days) : today
  let resting = false
  // an overdue feed that fell due before the season ended waits too
  const probe = next < today ? today : next
  if (winter === null && !isFeedingSeason(probe, latitude)) {
    next = nextSeasonStart(probe, latitude)
    resting = true
  }
  return {
    group: feedGroup(plant, cat), rule, days, inSeason, resting,
    next, left: differenceInCalendarDays(next, today),
  }
}

export function fertilizeDaysLeft(plant, latitude) {
  return feedingPlan(plant, latitude)?.left ?? null
}

/* Soil flush: plain water through the pot to wash out fertilizer salts.
 * Plants that never had one are due now. Cacti and succulents wait for the
 * growing season — a deep soak on a dormant cactus invites rot. */
export function flushPlan(plant, latitude) {
  const cat = getCatalogPlant(plant.catalogId)
  if (!cat) return null
  const today = new Date()
  const group = feedGroup(plant, cat)
  const days = group === 'orchid' ? FLUSH.orchidDays : FLUSH.days
  let next = plant.lastFlushed ? addDays(parseISO(plant.lastFlushed), days) : today
  let resting = false
  const probe = next < today ? today : next
  if (flushRestsInWinter(group) && !isFeedingSeason(probe, latitude)) {
    next = nextSeasonStart(probe, latitude)
    resting = true
  }
  return { days, resting, next, left: differenceInCalendarDays(next, today) }
}

export function flushDaysLeft(plant, latitude) {
  return flushPlan(plant, latitude)?.left ?? null
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

// Rain days this plant hasn't been asked about yet: measurable rain after its
// last watering and after its last rain answer, within the weather history
// (RAIN_HISTORY_DAYS). Opening the app after a few days away still asks about
// the rain that fell meanwhile, not just yesterday's.
// Where the plant actually sits is the user's call — the species' `outdoor` flag is
// only a hint, so an "indoor" species parked on the balcony still gets asked.
export function pendingRain(plant, weather) {
  if (!weather || !plant.isOutside) return null
  const daily = weather.rainDaily || { [weather.yesterdayDate]: weather.yesterdayRainMm }
  const since = [plant.lastWatered, plant.rainAnsweredFor].filter(Boolean).sort().pop() || ''
  const days = Object.entries(daily)
    .filter(([day, mm]) => day > since && (!weather.today || day < weather.today) && mm >= RAIN_ASK_MM)
    .sort(([a], [b]) => a.localeCompare(b))
  if (!days.length) return null
  return {
    days: days.map(([day]) => day),
    firstDay: days[0][0],
    lastDay: days[days.length - 1][0],
    totalMm: days.reduce((t, [, mm]) => t + mm, 0),
  }
}

// Should the red rain bubble show for this plant?
export function needsRainAnswer(plant, weather) {
  return !!pendingRain(plant, weather)
}

// Apply the user's rain answer. Returns the updated plant object.
// SOAKED is a real watering event — identical to tapping the watering can,
// just dated to the (last) rain day — regardless of what the rain gauge reported.
// The mm figure only drives which option we *suggest*, never what a
// confirmation does; a forecast-grid total says little about what actually
// reached a pot on an exposed balcony. One answer covers every pending day.
export function applyRainAnswer(plant, weather, outcome) {
  // tolerate the old boolean callers
  const o = outcome === true ? RAIN_OUTCOME.SOAKED
    : outcome === false ? RAIN_OUTCOME.DRY
    : outcome

  const pending = pendingRain(plant, weather)
  const yesterday = weather.yesterdayDate ||
    formatISO(subDays(new Date(), 1), { representation: 'date' })
  const rainDay = pending?.lastDay || yesterday
  const updated = { rainAnsweredFor: yesterday > rainDay ? yesterday : rainDay, rainDelay: false }

  if (o === RAIN_OUTCOME.SOAKED) {
    updated.lastWatered = rainDay      // the field waterDaysLeft() reads
    updated.lastWateredBy = 'rain'     // provenance, for the card copy
  } else if (o === RAIN_OUTCOME.DAMP) {
    updated.rainDelay = true           // partial top-up: nudge one day
  }
  return updated
}

// "yesterday" / "since Tue 30 Sep" — for the rain question's copy.
export function rainWhen(pending, weather) {
  if (!pending) return ''
  if (pending.days.length === 1 && pending.firstDay === weather?.yesterdayDate) return 'yesterday'
  if (pending.days.length === 1) return `on ${format(parseISO(pending.firstDay), 'EEE d MMM')}`
  return `since ${format(parseISO(pending.firstDay), 'EEE d MMM')}`
}

// Does this plant need a watering right before a trip? Assumes you keep
// watering on schedule until you leave, so only a watering that would land
// while you're away (departure day through the day before you're back)
// counts. Returns null when it doesn't, else { lasts }: whether one watering
// on departure day carries it until you're home.
export function tripNeed(plant, latitude, trip, now = new Date()) {
  if (!trip?.from || !trip?.to) return null
  const from = parseISO(trip.from)
  const to = parseISO(trip.to)
  const interval = waterIntervalDays(plant, latitude)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let due = addDays(today, waterDaysLeft(plant, latitude))
  while (due < from) due = addDays(due, interval)
  if (due >= to) return null
  return { lasts: interval >= differenceInCalendarDays(to, from) }
}
