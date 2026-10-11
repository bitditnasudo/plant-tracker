// 3D apartment model + measured light, produced by the lightmap project (`lightmap export`):
//   apartment.glb         the Revit model cut like a dollhouse (glTF, metres, Y up)
//   lightmap_export.json  rooms, windows, north and the light grid, in the model's own metres
//
// Coordinates: everything in state is MODEL metres (x, y on the floor plan, height above the room floor).
// three.js / glTF axes are (x, z_up, -y): toThree() / fromThree() convert.

export const EXPORT_FORMAT = 'lightmap-export'

// Validate lightmap_export.json and split it into the small part kept in state (synced with the plan)
// and the big light grid kept as a blob.
export function parseLightmapExport(text) {
  let doc
  try { doc = JSON.parse(text) } catch { throw new Error('lightmap_export.json is not valid JSON') }
  if (doc?.format !== EXPORT_FORMAT) throw new Error('This is not a lightmap export (lightmap_export.json)')
  if (!Array.isArray(doc.rooms) || !doc.rooms.length) throw new Error('The export has no rooms')
  const meta = {
    version: doc.version,
    north: doc.north_bearing_of_model_y_deg ?? 0,
    cutHeight: doc.cut_height_m,
    date: doc.date,
    rooms: doc.rooms.map(r => ({ name: r.name, floorZ: r.floor_z, outdoor: !!r.outdoor, area: r.area_m2, outline: r.outline })),
    windows: (doc.windows || []).map(w => ({ id: w.id, room: w.room, center: w.center, facing: w.facing, facingDeg: w.facing_deg })),
    light: doc.light ? {
      hours: doc.light.hours, cellSize: doc.light.cell_size_m, workPlane: doc.light.work_plane_height_m,
      calibrated: !!doc.light.calibrated, note: doc.light.dli_note, rooms: doc.light.rooms,
      holdoutError: doc.light.holdout_median_abs_pct_error, heights: doc.light.heights_m || [doc.light.work_plane_height_m],
    } : null,
  }
  // the lattice + layers let lightAt() find a spot's cell directly (see plantLight.js)
  const light = doc.light ? JSON.stringify({
    hours: doc.light.hours, cells: doc.light.cells, grid: doc.light.grid || null, heights: doc.light.heights_m || null,
  }) : null
  return { meta, light }
}

export const toThree = (x, y, z) => [x, z, -y]
export const fromThree = v => ({ x: v.x, y: -v.z, z: v.y })

export function pointInPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function roomAt(rooms, x, y) {
  return rooms.find(r => r.outline && pointInPolygon(x, y, r.outline)) || null
}

// Area-weighted centroid of a room outline (falls back to the vertex mean for degenerate outlines).
export function roomCenter(room) {
  const p = room.outline
  let a = 0, cx = 0, cy = 0
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const f = p[j][0] * p[i][1] - p[i][0] * p[j][1]
    a += f; cx += (p[j][0] + p[i][0]) * f; cy += (p[j][1] + p[i][1]) * f
  }
  if (Math.abs(a) < 1e-9) {
    return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]
  }
  return [cx / (3 * a), cy / (3 * a)]
}

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Which model room a 2D light zone corresponds to, by name ("Living room" ~ "Living Room", "Bedroom" ~ "Bedroom 2").
export function matchRoom(rooms, zoneName) {
  const z = norm(zoneName)
  if (!z) return null
  return rooms.find(r => norm(r.name) === z)
    || rooms.find(r => norm(r.name).startsWith(z) || z.startsWith(norm(r.name)))
    || rooms.find(r => norm(r.name).includes(z) || z.includes(norm(r.name)))
    || null
}

// Starting 3D positions for plants that have none, from the 2D light zone they sit in: plants of one room are
// spread on a small ring around its centre (still inside the outline) so they don't stack. Returns {id: pos3d}.
export function autoPlace(plants, zones, rooms) {
  const out = {}
  const byRoom = new Map()
  for (const p of plants) {
    if (p.pos3d) continue
    const zone = zones.find(z => z.id === p.zoneId)
    const room = zone && matchRoom(rooms, zone.name)
    if (!room) continue
    if (!byRoom.has(room.name)) byRoom.set(room.name, [])
    byRoom.get(room.name).push(p)
  }
  for (const [name, list] of byRoom) {
    const room = rooms.find(r => r.name === name)
    const [cx, cy] = roomCenter(room)
    list.forEach((p, i) => {
      let x = cx, y = cy
      if (list.length > 1) {
        for (const radius of [0.45, 0.3, 0.15, 0]) {
          const a = (2 * Math.PI * i) / list.length
          x = cx + radius * Math.cos(a); y = cy + radius * Math.sin(a)
          if (pointInPolygon(x, y, room.outline)) break
        }
      }
      out[p.id] = { x: round3(x), y: round3(y), h: 0, room: room.name }
    })
  }
  return out
}

export const round3 = v => Math.round(v * 1000) / 1000

// Read a File as a data URL (the glb is stored and synced like the floor-plan image).
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export async function dataURLToArrayBuffer(url) {
  return (await fetch(url)).arrayBuffer()
}
