import { describe, it, expect, afterEach, vi } from 'vitest'
import { feedGroup, isFeedingSeason, nextSeasonStart, FEED_RULES, SOURCES, FLUSH } from './feeding.js'
import { feedingPlan, fertilizeDaysLeft, flushPlan, flushDaysLeft } from './schedule.js'
import { setCustomCatalog, getCatalogPlant } from './catalog.js'

const LAT = 20.6 // Querétaro: northern hemisphere
const at = iso => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${iso}T12:00:00`)) }
afterEach(() => { vi.useRealTimers(); setCustomCatalog([]) })

const plant = (catalogId, o = {}) => ({ id: 'p', catalogId, isOutside: false, ...o })
const group = (id, o) => feedGroup(plant(id, o), getCatalogPlant(id))

describe('feed groups', () => {
  it('sorts the catalogue into cited groups', () => {
    expect(group('monstera')).toBe('foliage')
    expect(group('snake-plant')).toBe('slowFoliage')
    expect(group('golden-barrel')).toBe('cactus')
    expect(group('christmas-cactus')).toBe('holidayCactus')
    expect(group('burros-tail')).toBe('succulent')
    expect(group('orchid')).toBe('orchid')
    expect(group('basil')).toBe('herb')
    expect(group('tomato')).toBe('container')
  })

  it('a bloomer feeds harder in an outdoor pot than on a windowsill', () => {
    expect(group('zinnia', { isOutside: true })).toBe('container')
    expect(group('zinnia', { isOutside: false })).toBe('floweringIndoor')
  })

  it('Perenual imports get a real rule instead of the flat 30-day placeholder', () => {
    setCustomCatalog([{ id: 'perenual-5942', name: 'New Zealand flax', latin: "Phormium 'Jester'", category: 'foliage', waterSummer: 9, fertilize: 30 }])
    at('2026-07-01')
    expect(feedingPlan(plant('perenual-5942', { lastFertilized: '2026-07-01' }), LAT).days).toBe(60)
  })

  it('every rule cites sources that exist', () => {
    for (const r of Object.values(FEED_RULES)) {
      expect(r.sources.length).toBeGreaterThan(0)
      for (const k of r.sources) expect(SOURCES[k]?.url).toMatch(/^https:\/\//)
    }
    for (const k of [...FLUSH.sources, ...FLUSH.orchidSources]) expect(SOURCES[k]).toBeTruthy()
  })
})

describe('feeding season', () => {
  it('is March–September in the north, mirrored in the south', () => {
    expect(isFeedingSeason(new Date(2026, 2, 1), LAT)).toBe(true)
    expect(isFeedingSeason(new Date(2026, 9, 1), LAT)).toBe(false)
    expect(isFeedingSeason(new Date(2026, 9, 1), -33)).toBe(true)
    expect(isFeedingSeason(new Date(2026, 5, 1), -33)).toBe(false)
  })

  it('finds the next season start', () => {
    expect(nextSeasonStart(new Date(2026, 9, 19), LAT)).toEqual(new Date(2027, 2, 1))
    expect(nextSeasonStart(new Date(2027, 0, 5), LAT)).toEqual(new Date(2027, 2, 1))
  })
})

describe('feeding schedule', () => {
  it('foliage in season: every 60 days', () => {
    at('2026-06-01')
    expect(fertilizeDaysLeft(plant('monstera', { lastFertilized: '2026-05-01' }), LAT)).toBe(29)
  })

  it('a feed that fell due before the season ended waits for March, not "overdue"', () => {
    at('2026-10-19')
    const p = feedingPlan(plant('monstera', { lastFertilized: '2026-07-12' }), LAT)
    expect(p.resting).toBe(true)
    expect(p.next).toEqual(new Date(2027, 2, 1))
    expect(p.left).toBeGreaterThan(0)
  })

  it('never fed + off season: first feed when the season starts', () => {
    at('2026-12-01')
    expect(feedingPlan(plant('monstera'), LAT).resting).toBe(true)
  })

  it('a feed landing past September is pushed to March', () => {
    at('2026-09-01')
    const p = feedingPlan(plant('golden-barrel', { lastFertilized: '2026-08-01' }), LAT)
    expect(p.next).toEqual(new Date(2027, 2, 1))
  })

  it('orchids slow down in winter instead of stopping', () => {
    at('2026-12-01')
    const p = feedingPlan(plant('orchid', { lastFertilized: '2026-11-20' }), LAT)
    expect(p.resting).toBe(false)
    expect(p.days).toBe(28)
    expect(p.left).toBe(17)
  })

  it('in season and overdue stays overdue', () => {
    at('2026-07-15')
    expect(fertilizeDaysLeft(plant('zinnia', { isOutside: true, lastFertilized: '2026-06-25' }), LAT)).toBe(-6)
  })
})

describe('soil flush', () => {
  it('never flushed is due now', () => {
    at('2026-10-19')
    expect(flushDaysLeft(plant('monstera'), LAT)).toBe(0)
  })

  it('every 120 days; orchids monthly', () => {
    at('2026-07-01')
    expect(flushPlan(plant('monstera', { lastFlushed: '2026-07-01' }), LAT).days).toBe(120)
    expect(flushPlan(plant('orchid', { lastFlushed: '2026-07-01' }), LAT).days).toBe(30)
  })

  it('cacti and succulents are not soaked while dormant', () => {
    at('2026-10-19')
    const p = flushPlan(plant('golden-barrel'), LAT)
    expect(p.resting).toBe(true)
    expect(p.next).toEqual(new Date(2027, 2, 1))
    expect(flushPlan(plant('monstera'), LAT).resting).toBe(false)
  })
})
