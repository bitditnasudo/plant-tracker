import { describe, expect, it } from 'vitest'
import { autoPlace, fromThree, matchRoom, parseLightmapExport, pointInPolygon, roomAt, roomCenter, toThree } from './model3d.js'

const square = (x0, y0, s) => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s], [x0, y0]]
const rooms = [
  { name: 'Living Room', floorZ: 0, outline: square(0, 0, 4) },
  { name: 'Bedroom 2', floorZ: 0, outline: square(5, 0, 3) },
  { name: 'Balcony', floorZ: 0, outdoor: true, outline: square(5, -1, 1) },
]

describe('coordinates', () => {
  it('model (x, y, z-up) <-> three (x, y-up, -y) round-trips', () => {
    const [X, Y, Z] = toThree(1.5, -2.25, 0.8)
    expect([X, Y, Z]).toEqual([1.5, 0.8, 2.25])
    expect(fromThree({ x: X, y: Y, z: Z })).toEqual({ x: 1.5, y: -2.25, z: 0.8 })
  })
})

describe('rooms', () => {
  it('finds the room under a point', () => {
    expect(pointInPolygon(2, 2, rooms[0].outline)).toBe(true)
    expect(roomAt(rooms, 6, 1).name).toBe('Bedroom 2')
    expect(roomAt(rooms, 4.5, 1)).toBe(null)
  })
  it('centre of a square is its middle', () => {
    expect(roomCenter(rooms[0])).toEqual([2, 2])
  })
  it('matches 2D zone names to model rooms loosely', () => {
    expect(matchRoom(rooms, 'living room').name).toBe('Living Room')
    expect(matchRoom(rooms, 'Bedroom').name).toBe('Bedroom 2')
    expect(matchRoom(rooms, 'Garage')).toBe(null)
    expect(matchRoom(rooms, '')).toBe(null)
  })
})

describe('autoPlace', () => {
  const zones = [{ id: 'z1', name: 'Living room' }, { id: 'z2', name: 'Kitchen' }]
  it('places plants of a matched zone inside the room, spread apart, and skips the rest', () => {
    const plants = [
      { id: 'a', zoneId: 'z1' }, { id: 'b', zoneId: 'z1' }, { id: 'c', zoneId: 'z1' },
      { id: 'd', zoneId: 'z2' },                       // no Kitchen in the model
      { id: 'e', zoneId: 'z1', pos3d: { x: 1, y: 1, h: 0, room: 'Living Room' } }, // already placed
      { id: 'f' },                                     // no zone
    ]
    const out = autoPlace(plants, zones, rooms)
    expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c'])
    for (const p of Object.values(out)) {
      expect(p.room).toBe('Living Room')
      expect(pointInPolygon(p.x, p.y, rooms[0].outline)).toBe(true)
      expect(p.h).toBe(0)
    }
    const pts = Object.values(out)
    expect(new Set(pts.map(p => `${p.x},${p.y}`)).size).toBe(3)
  })
})

describe('parseLightmapExport', () => {
  const doc = {
    format: 'lightmap-export', version: 1, north_bearing_of_model_y_deg: 0, cut_height_m: 2.2, date: '2026-08-30',
    rooms: [{ name: 'Study', floor_z: 0, outdoor: false, area_m2: 7.3, outline: square(0, 0, 2) }],
    windows: [{ id: 'W0', room: 'Study', center: [1, 0, 1.5], facing: 'SE', facing_deg: 140 }],
    light: { hours: [7, 8], cell_size_m: 0.2, work_plane_height_m: 0.75, calibrated: true, dli_note: 'n',
      rooms: { Study: { median_dli: 1.4 } }, holdout_median_abs_pct_error: 26,
      cells: [{ room: 'Study', x: 1, y: 1, z: 0.75, lux: [100, 200], dli: 0.02, sun_hours: 0, peak_lux: 200, median_lux: 150 }] },
  }
  it('keeps the small part for state and the cells as a blob', () => {
    const { meta, light } = parseLightmapExport(JSON.stringify(doc))
    expect(meta.rooms[0]).toMatchObject({ name: 'Study', floorZ: 0, outdoor: false })
    expect(meta.light).toMatchObject({ calibrated: true, cellSize: 0.2, holdoutError: 26 })
    expect(meta.light.cells).toBeUndefined()
    expect(JSON.parse(light).cells).toHaveLength(1)
  })
  it('rejects other files', () => {
    expect(() => parseLightmapExport('{"state":{}}')).toThrow(/not a lightmap export/)
    expect(() => parseLightmapExport('nope')).toThrow(/not valid JSON/)
  })
})
