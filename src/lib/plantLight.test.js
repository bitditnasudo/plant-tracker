import { describe, expect, it } from 'vitest'
import { bestSpots, dliColor, dliToLux, fmtLux, judge, lightAt, LUX_PER_DLI, NEEDS, needLux, parseLight } from './plantLight.js'

// A 4 x 2 lattice (0.2 m cells) in two rooms, two layers: brighter by the "window" (high ix) and up high.
function grid() {
  const cells = []
  for (const h of [0.1, 0.75]) {
    for (let ix = 0; ix < 4; ix++) for (let iy = 0; iy < 2; iy++) {
      const dli = (ix + 1) * 2 * (h > 0.5 ? 2 : 1)          // 2..8 on the floor, 4..16 at table height
      const sun = ix === 3 ? (h > 0.5 ? 3 : 1) : 0
      cells.push({ room: ix < 3 ? 'Living Room' : 'Balcony', ix, iy, h, x: ix * 0.2, y: iy * 0.2, dli, sun_hours: sun, peak_lux: dli * 1000, lux: [dli * 100, dli * 200] })
    }
  }
  return JSON.stringify({ hours: [9, 10], cells, grid: { x0: 0, y0: 0, spacing: 0.2, nx: 4, ny: 2 }, heights: [0.1, 0.75] })
}
const rooms = [{ name: 'Living Room' }, { name: 'Balcony', outdoor: true }]

describe('lightAt', () => {
  const L = parseLight(grid())
  it('reads the cell under a spot on its layer', () => {
    expect(lightAt(L, { x: 0.41, y: 0.02, h: 0.1, room: 'Living Room' })).toMatchObject({ dli: 6, sunHours: 0 })
  })
  it('interpolates between layers by height', () => {
    const mid = lightAt(L, { x: 0.4, y: 0, h: 0.425, room: 'Living Room' })
    expect(mid.dli).toBeCloseTo(9, 6)          // halfway between 6 (floor) and 12 (table)
    expect(mid.lux).toEqual([900, 1800])
  })
  it('clamps above the top layer and finds the nearest cell off the lattice', () => {
    expect(lightAt(L, { x: 0.4, y: 0, h: 2, room: 'Living Room' }).dli).toBe(12)
    expect(lightAt(L, { x: 0.45, y: -0.25, h: 0.75, room: 'Living Room' }).dli).toBe(12) // just outside the grid
    expect(lightAt(L, { x: 9, y: 9, h: 0 })).toBe(null)
  })
  it('parses once per blob', () => {
    const t = grid()
    expect(parseLight(t)).toBe(parseLight(t))
  })
})

describe('judge', () => {
  it('rates a spot against the plant light level', () => {
    expect(judge('partial', { dli: 0.6, sunHours: 0 }).status).toBe('dark')   // ~750 lx
    expect(judge('partial', { dli: 1.0, sunHours: 0 }).status).toBe('low')    // ~1,250 lx
    expect(judge('partial', { dli: 8, sunHours: 1 }).status).toBe('ideal')
    expect(judge('shade', { dli: 4, sunHours: 2 }).status).toBe('sun')
    expect(judge('shade', { dli: 4, sunHours: 5 }).status).toBe('harsh')
    expect(judge('direct', { dli: 20, sunHours: 5 }).status).toBe('ideal')
    expect(judge('direct', { dli: 20, sunHours: 5 }).cls).toBe('ok')
    expect(judge('partial', null)).toBe(null)
  })
  it('calls an orchid at ~1,900 lx all day ideal (indoor plants live on far less than greenhouse targets)', () => {
    const dli = 1900 / LUX_PER_DLI
    expect(judge('partial', { dli, sunHours: 0 }).status).toBe('ideal')
    expect(needLux(NEEDS.partial)).toBe('1,500–10k lx')
    expect(fmtLux(dliToLux(dli))).toBe('1,900')
  })
})

describe('bestSpots', () => {
  const L = parseLight(grid())
  it('ranks spots by how well they suit the plant, spread apart, indoors unless it can live outside', () => {
    const indoor = bestSpots(L, rooms, 'partial', { h: 0.75, spread: 0.3 })
    expect(indoor.every(s => s.room === 'Living Room')).toBe(true)
    expect(indoor[0]).toMatchObject({ status: 'ideal', h: 0.75 })
    expect(indoor[0].dli).toBeGreaterThanOrEqual(NEEDS.partial.ideal[0])
    for (let i = 1; i < indoor.length; i++) {
      for (let j = 0; j < i; j++) expect(Math.hypot(indoor[i].x - indoor[j].x, indoor[i].y - indoor[j].y)).toBeGreaterThanOrEqual(0.3)
    }
    const sunLover = bestSpots(L, rooms, 'direct', { h: 0.75, outdoorOk: true })
    expect(sunLover[0].room).toBe('Balcony')
  })
})

it('colours DLI from dark blue to red', () => {
  expect(dliColor(0.1)).toEqual([48, 18, 59])
  expect(dliColor(100)).toEqual([122, 4, 3])
})

describe('bestSpots preferences', () => {
  const L = parseLight(grid())
  it('prefers the middle of the ideal range over its bright edge', () => {
    // partial wants 1.2-8 (centre ~3.1): at table height the lattice offers 4, 8, 12, 16 -> 4 wins over 8
    expect(bestSpots(L, rooms, 'partial', { h: 0.75, spread: 0.1 })[0].dli).toBe(4)
  })
  it("keeps the own-room preference small: a clearly better spot elsewhere still wins", () => {
    const s = bestSpots(L, rooms, 'direct', { h: 0.75, outdoorOk: true, room: 'Living Room' })
    expect(s[0].room).toBe('Balcony') // 16 + 3 h sun on the balcony still beats 12 + no sun indoors
  })
})
