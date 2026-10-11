// Measured light for plants: what a spot actually gets (from the lightmap export) vs what a plant needs.
//
// The light grid is daylight simulated for a clear day and calibrated to handheld lux readings:
// per 20 cm cell and height layer, lux by hour, DLI (daily light integral, mol/m²/day of photosynthetic
// light) and hours of direct sun. Cloudy days give less, so these are the best-case figures for a spot.

// Daily light (mol/m²/day) <-> the average daytime lux a meter shows: 1 mol/m²/day of daylight is about
// 1,250 lx held for 12 hours (54 lux per µmol/m²/s).
export const LUX_PER_DLI = 1250
export const dliToLux = dli => dli * LUX_PER_DLI

// What each catalogue light level needs, from the usual houseplant bands in lux (low light ~500-2,500 lx,
// bright indirect ~2,500-10,000 lx, direct sun 10,000+), as daytime averages. Indoor plants live on far
// less than greenhouse targets: an orchid doing well at ~1,900 lx is "ideal" here. sun hours = time in a
// direct beam that day.
export const NEEDS = {
  shade:   { min: 0.2,  ideal: [0.4, 2.4], maxSun: 1 },   //   250 lx min,   500-3,000 lx ideal
  partial: { min: 0.65, ideal: [1.2, 8],   maxSun: 4 },   //   800 lx min, 1,500-10,000 lx ideal
  direct:  { min: 4,    ideal: [8, 35],    minSun: 2 },   // 5,000 lx min, 10,000+ lx ideal
}

// "1,500–10,000 lx" for display
export const fmtLux = v => (v >= 10000 ? `${Math.round(v / 1000)}k`
  : v >= 1000 ? (Math.round(v / 100) * 100).toLocaleString('en-US') : String(Math.round(v / 10) * 10))
export const needLux = need => `${fmtLux(dliToLux(need.ideal[0]))}–${fmtLux(dliToLux(need.ideal[1]))} lx`

export const STATUS = {
  dark:   { label: 'Too dark',      cls: 'danger' },
  low:    { label: 'A bit dark',    cls: 'warn' },
  ideal:  { label: 'Ideal light',   cls: 'ok' },
  bright: { label: 'Bright',        cls: 'ok' },
  sun:    { label: 'Too much sun',  cls: 'warn' },
  harsh:  { label: 'Far too bright', cls: 'danger' },
}

export const needFor = light => NEEDS[light] || NEEDS.partial

// How a spot suits a plant: one of the STATUS keys, plus a short hint.
export function judge(lightLevel, spot) {
  if (!spot) return null
  const need = needFor(lightLevel)
  const { dli, sunHours } = spot
  const [lo, hi] = need.ideal
  let status
  if (dli < need.min) status = 'dark'
  else if (dli < lo) status = 'low'
  else if (need.maxSun !== undefined && sunHours > need.maxSun + 2) status = 'harsh'
  else if (need.maxSun !== undefined && sunHours > need.maxSun) status = 'sun'
  else if (dli > hi * 2) status = 'harsh'
  else if (dli > hi) status = 'bright'
  else status = 'ideal'
  const hint = status === 'dark' || status === 'low' ? 'closer to a window, or higher up'
    : status === 'sun' || status === 'harsh' ? 'out of the direct sun, a little back from the window'
      : null
  return { status, ...STATUS[status], hint, need, dli, sunHours }
}

// --- the light grid ----------------------------------------------------------------------------------

let cache = { text: null, data: null }

// Parse the stored light blob once (it is a few hundred kB) and index it by lattice cell and layer.
export function parseLight(text) {
  if (!text) return null
  if (cache.text === text) return cache.data
  const raw = JSON.parse(text)
  const heights = raw.heights?.length ? raw.heights : [...new Set(raw.cells.map(c => c.h ?? 0.75))].sort((a, b) => a - b)
  const index = new Map()
  for (const c of raw.cells) if (c.ix !== undefined) index.set(`${c.ix},${c.iy},${c.h ?? heights[0]}`, c)
  const data = { ...raw, heights, index }
  cache = { text, data }
  return data
}

// The cell at layer h nearest to (x, y): the lattice cell itself, else the closest within ~3 cells
// (spots right against a wall fall outside the grid's wall margin).
function cellNear(L, x, y, h, room) {
  const g = L.grid
  if (g && L.index.size) {
    const ix = Math.round((x - g.x0) / g.spacing), iy = Math.round((y - g.y0) / g.spacing)
    let best = null, bestD = Infinity
    for (let r = 0; r <= 3 && !best; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const c = L.index.get(`${ix + dx},${iy + dy},${h}`)
        if (!c || (room && c.room !== room && r > 0)) continue
        const d = (c.x - x) ** 2 + (c.y - y) ** 2
        if (d < bestD) { best = c; bestD = d }
      }
    }
    return best
  }
  // exports without a lattice index: plain nearest neighbour
  let best = null, bestD = Infinity
  for (const c of L.cells) {
    if ((c.h ?? h) !== h) continue
    const d = (c.x - x) ** 2 + (c.y - y) ** 2
    if (d < bestD) { best = c; bestD = d }
  }
  return bestD < 0.6 ** 2 ? best : null
}

// Light at a plant's 3D position {x, y, h, room}: interpolated between the two height layers around h.
export function lightAt(L, pos) {
  if (!L || !pos) return null
  const hs = L.heights
  const h = Math.min(Math.max(pos.h || 0, hs[0]), hs[hs.length - 1])
  let i = 0
  while (i < hs.length - 2 && hs[i + 1] < h) i++
  const h0 = hs[i], h1 = hs[Math.min(i + 1, hs.length - 1)]
  const a = cellNear(L, pos.x, pos.y, h0, pos.room), b = cellNear(L, pos.x, pos.y, h1, pos.room)
  if (!a && !b) return null
  if (!a || !b || h1 === h0) {
    const c = a || b
    return { dli: c.dli, sunHours: c.sun_hours, peakLux: c.peak_lux, lux: c.lux, room: c.room }
  }
  const t = (h - h0) / (h1 - h0)
  const mix = (u, v) => u + (v - u) * t
  return {
    dli: round2(mix(a.dli, b.dli)), sunHours: round2(mix(a.sun_hours, b.sun_hours)),
    peakLux: Math.round(mix(a.peak_lux, b.peak_lux)), lux: a.lux.map((v, k) => Math.round(mix(v, b.lux[k]))), room: a.room,
  }
}

const round2 = v => Math.round(v * 100) / 100

// How far a spot is from what the plant wants (0 = ideal; bigger = worse), for ranking.
function penalty(need, dli, sun) {
  const [lo, hi] = need.ideal
  let p = 0
  if (dli < lo) p += Math.log(lo / Math.max(dli, 0.05))
  if (dli > hi) p += Math.log(dli / hi) * 0.7
  if (need.maxSun !== undefined && sun > need.maxSun) p += (sun - need.maxSun) * 0.4
  if (need.minSun !== undefined && sun < need.minSun) p += (need.minSun - sun) * 0.25
  return p
}

// The best few spots for a plant at height layer nearest `h`, spread at least `spread` metres apart.
// Among equally good spots the middle of the plant's range wins (safer than the brightest edge), and its
// current room (`room`) gets a small preference so it isn't sent across the home for a marginal gain.
// Outdoor rooms (balcony) only when the species can live outside.
export function bestSpots(L, rooms, lightLevel, { h = 0, outdoorOk = false, count = 3, spread = 0.6, room = null } = {}) {
  if (!L) return []
  const need = needFor(lightLevel)
  const layer = L.heights.reduce((best, x) => (Math.abs(x - h) < Math.abs(best - h) ? x : best), L.heights[0])
  const outdoor = new Set((rooms || []).filter(r => r.outdoor).map(r => r.name))
  const centre = Math.sqrt(need.ideal[0] * need.ideal[1])
  const score = c => penalty(need, c.dli, c.sun_hours) + (room && c.room !== room ? 0.15 : 0)
    + 0.05 * Math.abs(Math.log(Math.max(c.dli, 0.05) / centre))
  const ranked = L.cells
    .filter(c => (c.h ?? layer) === layer && (outdoorOk || !outdoor.has(c.room)))
    .map(c => ({ c, p: score(c) }))
    .sort((u, v) => u.p - v.p)
  const out = []
  for (const { c } of ranked) {
    if (out.some(o => (o.x - c.x) ** 2 + (o.y - c.y) ** 2 < spread ** 2)) continue
    out.push({ x: c.x, y: c.y, room: c.room, h: layer, dli: c.dli, sunHours: c.sun_hours, ...judge(lightLevel, { dli: c.dli, sunHours: c.sun_hours }) })
    if (out.length >= count) break
  }
  return out
}

// Colour for a DLI value on a log scale (0.15 .. 30 mol/m²/day), turbo-like: dark blue -> green -> red.
const RAMP = [[48, 18, 59], [70, 134, 251], [26, 228, 182], [162, 252, 60], [250, 187, 45], [228, 70, 10], [122, 4, 3]]
export function dliColor(dli) {
  const lo = Math.log10(0.15), hi = Math.log10(30)   // ~200 lx .. ~37,000 lx daytime average
  let t = (Math.log10(Math.max(dli, 0.01)) - lo) / (hi - lo)
  t = Math.min(1, Math.max(0, t)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i
  return RAMP[i].map((a, k) => Math.round(a + (RAMP[i + 1][k] - a) * f))
}
