import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setWindLog, avgWindSince, windTierFor, windAdjustment, MAX_WIND_CUT,
  isGrowingSeason, potCappedBase, waterIntervalDays, waterDaysLeft,
  pendingRain, needsRainAnswer, applyRainAnswer, RAIN_OUTCOME,
} from './schedule.js'
import { reminderStart } from './calendarSync.js'

// A fixed "today" in the northern growing season.
const TODAY = '2026-07-15'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`))
  setWindLog({})
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
