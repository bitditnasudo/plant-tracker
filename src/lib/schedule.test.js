import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setWindLog, avgWindSince, windTierFor, windAdjustment, MAX_WIND_CUT,
  isGrowingSeason, potCappedBase, waterIntervalDays, waterDaysLeft,
  pendingRain, needsRainAnswer, applyRainAnswer, RAIN_OUTCOME, tripNeed,
  setEt0Climate, recentEt0, dryingFactor, baseIntervalDays, intervalBreakdown,
} from './schedule.js'
import { reminderStart } from './calendarSync.js'

// A fixed "today" in the northern growing season.
const TODAY = '2026-07-15'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`))
  setWindLog({})
  setEt0Climate(null)
})
afterEach(() => vi.useRealTimers())

const plant = (o = {}) => ({ id: 'p', catalogId: 'monstera', isOutside: false, lastWatered: TODAY, ...o })

describe('wind', () => {
  it('tiers by average km/h', () => {
    expect(windTierFor(5).id).toBe('calm')
    expect(windTierFor(15).id).toBe('breezy')
    expect(windTierFor(40).id).toBe('windy')
    expect(windTierFor(null)).toBeNull()
  })

  it('averages only the days since the last watering', () => {
    setWindLog({ '2026-07-10': { max: 100 }, '2026-07-13': { max: 10 }, '2026-07-14': { max: 20 } })
    expect(avgWindSince('2026-07-12')).toBe(15)
  })

  it('a plant watered today falls back to measured days, never the forecast', () => {
    setWindLog({
      '2026-07-12': { max: 10 }, '2026-07-13': { max: 10 }, '2026-07-14': { max: 10 },
      '2026-07-15': { max: 90 }, '2026-07-16': { max: 90 }, // today + tomorrow: forecast
    })
    expect(avgWindSince(TODAY)).toBe(10)
  })

  it('never touches indoor plants', () => {
    setWindLog({ '2026-07-14': { max: 60 } })
    expect(windAdjustment(plant({ lastWatered: '2026-07-13' })).applies).toBe(false)
  })

  it('caps the cut at MAX_WIND_CUT', () => {
    setWindLog({ '2026-07-14': { max: 80 } })
    const adj = windAdjustment(plant({ isOutside: true, lastWatered: '2026-07-13', windSensitivityOverride: 'high' }))
    expect(adj.cut).toBeLessThanOrEqual(MAX_WIND_CUT)
    expect(adj.cut).toBeCloseTo(0.325 * 1.3)
  })
})

// a week of daily ET0 ending yesterday, in the shape the store registers
const et0Week = mm => Object.fromEntries(
  ['2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14'].map(d => [d, { max: 5, mean: 3, et0: mm }]),
)
const QRO = { lat: 20.6, lon: -100.4, low: 3.41, high: 6.86 } // Querétaro 2025: Dec low, Apr high

describe('weather-driven season (ET0)', () => {
  it('averages measured days only, never today or the forecast', () => {
    setWindLog({ ...et0Week(4), '2026-07-15': { et0: 99 }, '2026-07-16': { et0: 99 } })
    expect(recentEt0()).toBe(4)
  })

  it('without climate data it falls back to the calendar', () => {
    setWindLog(et0Week(6))
    expect(dryingFactor(40).source).toBe('calendar')
    expect(baseIntervalDays(plant(), 40)).toBe(7) // July, north: summer figure
  })

  it('slides between the winter and summer interval by evaporation', () => {
    setEt0Climate(QRO)
    // monstera: summer 7, winter 12
    setWindLog(et0Week(6.86))
    expect(baseIntervalDays(plant(), 20.6)).toBe(7)
    setWindLog(et0Week(3.41))
    expect(baseIntervalDays(plant(), 20.6)).toBe(12)
    setWindLog(et0Week(5.135)) // halfway
    expect(dryingFactor(20.6).factor).toBeCloseTo(0.5, 2)
    expect(baseIntervalDays(plant(), 20.6)).toBe(10) // 9.5 rounds up
  })

  it('a hot dry March counts as summer even though the calendar says winter', () => {
    vi.setSystemTime(new Date('2026-03-20T12:00:00'))
    setEt0Climate(QRO)
    setWindLog(Object.fromEntries(['2026-03-13', '2026-03-14', '2026-03-15', '2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19'].map(d => [d, { et0: 6.3 }])))
    expect(isGrowingSeason(new Date(), 20.6)).toBe(false)
    expect(baseIntervalDays(plant(), 20.6)).toBe(8)
  })

  it('old weather from a spell offline is ignored, and the usual month stands in', () => {
    setEt0Climate({ ...QRO, monthly: { '07': 4.0 } })
    setWindLog(Object.fromEntries(['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23'].map(d => [d, { et0: 9 }])))
    expect(recentEt0()).toBeNull()
    const d = dryingFactor(20.6)
    expect(d.source).toBe('month')
    expect(d.recent).toBe(4.0)
    expect(baseIntervalDays(plant(), 20.6)).toBe(11)
  })

  it('no recent weather and no month on record falls back to the calendar', () => {
    setEt0Climate({ ...QRO, monthly: {} })
    expect(dryingFactor(40).source).toBe('calendar')
  })

  it('clamps beyond the yearly range', () => {
    setEt0Climate(QRO)
    setWindLog(et0Week(9))
    expect(dryingFactor(20.6).factor).toBe(1)
    setWindLog(et0Week(1))
    expect(dryingFactor(20.6).factor).toBe(0)
  })

  it('a year with no dry season uses the growing-season figure', () => {
    setEt0Climate({ lat: 1.3, lon: 103.8, low: 4.0, high: 4.3 })
    setWindLog(et0Week(4.1))
    expect(dryingFactor(1.3).source).toBe('flat')
    expect(baseIntervalDays(plant(), 1.3)).toBe(7)
  })

  it('the outdoor pot cap relaxes with the weather, up to double', () => {
    setEt0Climate(QRO)
    const hot = plant({ isOutside: true, windSensitivityOverride: 'high' })
    setWindLog(et0Week(6.86))
    expect(potCappedBase(hot, 20.6)).toBe(4)
    setWindLog(et0Week(3.41))
    expect(potCappedBase(hot, 20.6)).toBe(8)
  })

  it('the breakdown explains the slide', () => {
    setEt0Climate(QRO)
    setWindLog(et0Week(6.86))
    const b = intervalBreakdown(plant(), 20.6)
    expect(b.drying.source).toBe('et0')
    expect([b.summer, b.winter, b.base]).toEqual([7, 12, 7])
  })
})

describe('soil check', () => {
  it('"still damp" pushes the check to tomorrow', () => {
    const due = plant({ lastWatered: '2026-07-01' }) // 7-day monstera: overdue
    expect(waterDaysLeft(due, 40)).toBeLessThan(0)
    expect(waterDaysLeft({ ...due, dampOn: TODAY }, 40)).toBe(1)
  })

  it('a damp check from before the last watering is ignored', () => {
    expect(waterDaysLeft(plant({ lastWatered: TODAY, dampOn: '2026-07-10' }), 40)).toBe(7)
  })
})

describe('season and pot cap', () => {
  it('flips by hemisphere', () => {
    expect(isGrowingSeason(new Date('2026-07-15'), 40)).toBe(true)
    expect(isGrowingSeason(new Date('2026-07-15'), -33)).toBe(false)
    expect(isGrowingSeason(new Date('2026-01-15'), -33)).toBe(true)
  })

  it('applies the outdoor container cap before wind, indoor untouched', () => {
    // monstera summer 7d; outdoor 'normal' cap is 7 → unchanged; 'high' cap 4
    expect(potCappedBase(plant(), 40)).toBe(7)
    expect(potCappedBase(plant({ isOutside: true, windSensitivityOverride: 'high' }), 40)).toBe(4)
  })

  it('a manual interval override always wins', () => {
    expect(waterIntervalDays(plant({ isOutside: true, intervalOverride: 11 }), 40)).toBe(11)
  })

  it('a damp rain answer adds one day', () => {
    const base = waterDaysLeft(plant(), 40)
    expect(waterDaysLeft(plant({ rainDelay: true }), 40)).toBe(base + 1)
  })
})

describe('rain', () => {
  const weather = (rainDaily) => ({ today: TODAY, yesterdayDate: '2026-07-14', yesterdayRainMm: rainDaily['2026-07-14'] ?? 0, rainDaily })

  it('only asks plants set to Outside', () => {
    const w = weather({ '2026-07-14': 6 })
    expect(needsRainAnswer(plant({ lastWatered: '2026-07-10' }), w)).toBe(false)
    expect(needsRainAnswer(plant({ isOutside: true, lastWatered: '2026-07-10' }), w)).toBe(true)
  })

  it('ignores drizzle under the ask threshold and rain before the last watering', () => {
    expect(needsRainAnswer(plant({ isOutside: true, lastWatered: '2026-07-10' }), weather({ '2026-07-14': 0.4 }))).toBe(false)
    expect(needsRainAnswer(plant({ isOutside: true, lastWatered: '2026-07-14' }), weather({ '2026-07-14': 9 }))).toBe(false)
  })

  it('still asks about rain from days ago, summed', () => {
    const r = pendingRain(plant({ isOutside: true, lastWatered: '2026-07-08' }), weather({ '2026-07-11': 3, '2026-07-12': 0, '2026-07-13': 4 }))
    expect(r.days).toEqual(['2026-07-11', '2026-07-13'])
    expect(r.totalMm).toBe(7)
    expect(r.lastDay).toBe('2026-07-13')
  })

  it('soaked dates the watering to the last rain day and covers everything up to yesterday', () => {
    const p = plant({ isOutside: true, lastWatered: '2026-07-08' })
    const w = weather({ '2026-07-11': 3, '2026-07-13': 4 })
    const f = applyRainAnswer(p, w, RAIN_OUTCOME.SOAKED)
    expect(f.lastWatered).toBe('2026-07-13')
    expect(f.lastWateredBy).toBe('rain')
    expect(f.rainAnsweredFor).toBe('2026-07-14')
    expect(needsRainAnswer({ ...p, ...f }, w)).toBe(false)
  })

  it('damp delays a day; dry only records the answer', () => {
    const p = plant({ isOutside: true, lastWatered: '2026-07-08' })
    const w = weather({ '2026-07-14': 2 })
    expect(applyRainAnswer(p, w, RAIN_OUTCOME.DAMP)).toEqual({ rainAnsweredFor: '2026-07-14', rainDelay: true })
    const dry = applyRainAnswer(p, w, RAIN_OUTCOME.DRY)
    expect(dry.lastWatered).toBeUndefined()
    expect(needsRainAnswer({ ...p, ...dry }, w)).toBe(false)
  })
})

describe('calendar reminder time', () => {
  it('uses the reminder hour on the due day', () => {
    const d = reminderStart(2, 9, new Date('2026-07-15T12:00:00'))
    expect(d.getDate()).toBe(17)
    expect(d.getHours()).toBe(9)
  })

  it('moves an overdue reminder to the next whole hour so it still fires', () => {
    const d = reminderStart(-3, 9, new Date('2026-07-15T12:20:00'))
    expect(d.getDate()).toBe(15)
    expect(d.getHours()).toBe(13)
    expect(d.getMinutes()).toBe(0)
  })
})

describe('trip', () => {
  const trip = { from: '2026-07-27', to: '2026-07-30' } // 12 days out, 3 days away
  it('skips plants you will water on schedule before leaving and that last the trip', () => {
    // monstera summer 7d, watered today: due 22nd (before leaving), then 29th → during trip
    expect(tripNeed(plant(), 40, trip)).toEqual({ lasts: true })
    // watered 3 days ago: due 19th, 26th, then 2 Aug → after you're back
    expect(tripNeed(plant({ lastWatered: '2026-07-12' }), 40, trip)).toBeNull()
  })
  it('flags a plant whose interval is shorter than the trip', () => {
    expect(tripNeed(plant({ intervalOverride: 2 }), 40, trip)).toEqual({ lasts: false })
  })
})
