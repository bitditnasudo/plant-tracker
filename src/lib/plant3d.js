// Low-poly "clay" 3D plants for the 3D plan, one builder per built-in icon shape (catalog `icon`).
//
// Everything is in metres at a typical real-world size for the species shape (a succulent ~14 cm tall, a
// Monstera ~80 cm), standing on y = 0. The pot follows the plant's chosen material and colour, flowers its
// bloom colour (potOptions.resolveAppearance). Shapes vary a little per plant (seeded by its id), so two plants
// of one species don't look cloned.
import * as THREE from 'three'

// app palette (PlantIcons.jsx) + a few clay greens
const C = {
  leafDark: '#2D6A4F', leaf: '#40916C', leafLight: '#74C69D', leafPale: '#95D5B2', succulent: '#7FB89A',
  cactus: '#4F8F5B', stem: '#5E8C4A', trunk: '#8B6B4A', bark: '#6F5136', soil: '#8A6A4A', yellowEdge: '#E9D36B',
  bamboo: '#7FB24A', white: '#FBFAF6', yellow: '#F5CE42', rose: '#E5476B',
}
const POT_NATURAL = {
  terracotta: '#CF8A52', glazed: '#EDE6DA', plastic: '#4F5B52', concrete: '#B9B4AC', basket: '#C9A46B',
  growbag: '#3E3A36', metal: '#9AA3A8', glass: '#CFEAF1',
}
const POT_COLOR = {
  terracotta: '#D18C4B', white: '#F2EDE4', black: '#2B2B2B', grey: '#5E5E62', sand: '#D9C3A0',
  sage: '#9DB59A', mint: '#BFE3CF', blue: '#7C99B4', pink: '#DDA9B2',
}
const BLOOM = {
  white: '#FBFAF6', cream: '#F4EBD0', yellow: '#F5CE42', orange: '#F29A3B', coral: '#F2765E', red: '#C8323C',
  pink: '#F3A6BD', magenta: '#C2337A', purple: '#8E5CC2', blue: '#5D7FD6',
}
const MIXED = ['#F3A6BD', '#F5CE42', '#C8323C', '#FBFAF6', '#8E5CC2']

// --- small helpers -------------------------------------------------------------------------------

export function seeded(str = '') {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => {
    h += 0x6D2B79F5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clay = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...extra })

function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  m.scale.set(sx, sy, sz)
  return m
}

// A flat, slightly thick leaf lying in the XY plane, base at the origin, tip at +Y.
// shape: 'lance' | 'heart' | 'strap' | 'round' | 'sword'; holes: 0-4 (monstera)
function leafGeometry(length, width, shape = 'lance', holes = 0, thickness = null) {
  const s = new THREE.Shape()
  const w = width / 2
  if (shape === 'heart') {
    s.moveTo(0, 0)
    s.bezierCurveTo(-w * 1.3, length * 0.05, -w * 1.1, length * 0.75, 0, length)
    s.bezierCurveTo(w * 1.1, length * 0.75, w * 1.3, length * 0.05, 0, 0)
  } else if (shape === 'round') {
    s.moveTo(0, 0)
    s.bezierCurveTo(-w * 1.4, length * 0.2, -w * 1.2, length, 0, length)
    s.bezierCurveTo(w * 1.2, length, w * 1.4, length * 0.2, 0, 0)
  } else if (shape === 'strap' || shape === 'sword') {
    const tip = shape === 'sword' ? 0.9 : 0.85
    s.moveTo(-w * 0.8, 0)
    s.lineTo(-w, length * 0.5)
    s.lineTo(-w * 0.6, length * tip)
    s.lineTo(0, length)
    s.lineTo(w * 0.6, length * tip)
    s.lineTo(w, length * 0.5)
    s.lineTo(w * 0.8, 0)
    s.lineTo(-w * 0.8, 0)
  } else { // lance
    s.moveTo(0, 0)
    s.quadraticCurveTo(-w * 1.6, length * 0.45, 0, length)
    s.quadraticCurveTo(w * 1.6, length * 0.45, 0, 0)
  }
  for (let i = 0; i < holes; i++) {
    const side = i % 2 ? 1 : -1
    const hy = length * (0.35 + 0.15 * Math.floor(i / 2))
    const h = new THREE.Path()
    h.absellipse(side * w * 0.45, hy, w * 0.16, length * 0.06, 0, Math.PI * 2, false, 0)
    s.holes.push(h)
  }
  const depth = thickness ?? Math.max(0.002, width * 0.04)
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 3 })
  g.translate(0, 0, -depth / 2)
  return g
}

// Place a leaf: from base (x, y, z), heading `yaw` around the stem, tilted `tilt` from vertical.
function leafAt(geo, mat, { x = 0, y = 0, z = 0, yaw = 0, tilt = 0.5, roll = 0 }) {
  const holder = new THREE.Group()
  holder.position.set(x, y, z)
  holder.rotation.y = yaw
  const leaf = new THREE.Mesh(geo, mat)
  leaf.rotation.x = tilt // tip leans out along +Z
  leaf.rotation.z = roll
  holder.add(leaf)
  return holder
}

function stem(from, to, radius, mat) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
  const len = a.distanceTo(b)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius, len, 5), mat)
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return m
}

// --- pot ---------------------------------------------------------------------------------------------

function potColor(app) {
  const mat = app?.material?.id || 'terracotta'
  const col = app?.color?.id || 'natural'
  return col !== 'natural' && POT_COLOR[col] ? POT_COLOR[col] : POT_NATURAL[mat] || POT_NATURAL.terracotta
}

// Returns { group, rimY, r } — plants grow from rimY (the soil surface).
export function buildPot(app, r, h, shape = 'pot') {
  const g = new THREE.Group()
  const matId = app?.material?.id || 'terracotta'
  const glass = matId === 'glass'
  const col = potColor(app)
  const mat = glass
    ? clay(col, { transparent: true, opacity: 0.35, roughness: 0.2, depthWrite: false })
    : clay(col, matId === 'glazed' ? { roughness: 0.45 } : matId === 'metal' ? { roughness: 0.5, metalness: 0.4 } : {})
  if (shape === 'dish') {
    g.add(mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 10), mat, { y: h / 2 }))
  } else if (shape === 'vase') {
    g.add(mesh(new THREE.CylinderGeometry(r, r * 0.9, h, 10, 1, true), mat, { y: h / 2 }))
    g.add(mesh(new THREE.CircleGeometry(r * 0.9, 10).rotateX(-Math.PI / 2), mat, { y: 0.002 }))
  } else {
    const body = matId === 'growbag' ? new THREE.CylinderGeometry(r, r, h, 9) : new THREE.CylinderGeometry(r * 0.96, r * 0.76, h * 0.86, 9)
    g.add(mesh(body, mat, { y: h * 0.43 }))
    if (matId !== 'growbag' && matId !== 'basket') {
      g.add(mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.0, h * 0.16, 9), mat, { y: h * 0.92 })) // rim
    }
  }
  const soilY = shape === 'vase' ? h * 0.35 : h * 0.93
  if (shape !== 'vase') g.add(mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.006, 9), clay(C.soil), { y: soilY }))
  else g.add(mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, h * 0.35, 8), clay('#9CC9D6', { transparent: true, opacity: 0.5 }), { y: h * 0.175 }))
  return { group: g, rimY: soilY, r }
}

const bloomColor = (app, fallback, rnd) => {
  const id = app?.bloom?.id || 'none'
  if (id === 'none') return null
  if (id === 'natural') return fallback
  if (id === 'mixed') return MIXED[Math.floor(rnd() * MIXED.length)]
  return BLOOM[id] || fallback
}

// --- the 17 shapes -----------------------------------------------------------------------------------
// Each: (rnd, app) => THREE.Group standing on y = 0, real-world metres.

const SHAPES = {
  succulent(rnd, app) {
    const { group, rimY } = buildPot(app, 0.055, 0.07)
    const mat = clay(C.succulent), tipMat = clay('#C98A9A')
    const leaf = new THREE.ConeGeometry(0.014, 0.05, 4)
    for (const [ring, n, tilt, len] of [[0, 9, 1.25, 1.1], [1, 7, 0.85, 0.95], [2, 5, 0.45, 0.8]]) {
      for (let i = 0; i < n; i++) {
        const yaw = (i / n) * Math.PI * 2 + ring * 0.4 + rnd() * 0.2
        const h = new THREE.Group()
        h.position.y = rimY + 0.014 + ring * 0.01 // rosette sits proud of the rim, not sunk into the pot
        h.rotation.y = yaw
        const l = mesh(leaf, i % 3 === 0 && ring === 0 ? tipMat : mat, { rx: tilt, sx: 1.3, sz: 0.55, sy: len })
        l.position.set(0, Math.cos(tilt) * 0.025 * len, Math.sin(tilt) * 0.025 * len)
        h.add(l)
        group.add(h)
      }
    }
    return group
  },

  cactus(rnd, app) {
    const { group, rimY } = buildPot(app, 0.06, 0.08)
    const mat = clay(C.cactus)
    const H = 0.15 + rnd() * 0.05
    group.add(mesh(new THREE.CylinderGeometry(0.034, 0.038, H, 8), mat, { y: rimY + H / 2 }))
    group.add(mesh(new THREE.SphereGeometry(0.034, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat, { y: rimY + H }))
    if (rnd() > 0.35) { // one arm
      const side = rnd() > 0.5 ? 1 : -1, ay = rimY + H * (0.45 + rnd() * 0.2)
      group.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.035, 6), mat, { x: side * 0.045, y: ay, rz: Math.PI / 2 }))
      group.add(mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.06, 6), mat, { x: side * 0.062, y: ay + 0.03 }))
    }
    const b = bloomColor(app, '#F2765E', rnd)
    if (b) group.add(mesh(new THREE.IcosahedronGeometry(0.014, 0), clay(b), { y: rimY + H + 0.03, sy: 0.6 }))
    return group
  },

  sprout(rnd, app) {
    const { group, rimY } = buildPot(app, 0.06, 0.07)
    const st = clay(C.stem), lf = clay(C.leafLight)
    const n = 5 + Math.floor(rnd() * 3)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.5, d = 0.012 + rnd() * 0.02, h = 0.08 + rnd() * 0.06
      const top = [Math.cos(a) * (d + 0.015), rimY + h, Math.sin(a) * (d + 0.015)]
      group.add(stem([Math.cos(a) * d, rimY, Math.sin(a) * d], top, 0.0025, st))
      group.add(mesh(new THREE.IcosahedronGeometry(0.016, 0), lf, { x: top[0], y: top[1], z: top[2], sy: 0.45, ry: a }))
    }
    return group
  },

  flowerBunch(rnd, app) {
    const { group, rimY } = buildPot(app, 0.07, 0.08)
    const lf = clay(C.leaf), lfD = clay(C.leafDark)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd() * 0.4
      group.add(mesh(new THREE.IcosahedronGeometry(0.04, 0), i % 2 ? lf : lfD,
        { x: Math.cos(a) * 0.035, y: rimY + 0.04 + rnd() * 0.02, z: Math.sin(a) * 0.035, sy: 0.55 }))
    }
    const b = bloomColor(app, '#E5476B', rnd)
    if (b) {
      const fm = clay(b)
      for (let i = 0; i < 9; i++) {
        const a = rnd() * Math.PI * 2, d = rnd() * 0.04
        group.add(mesh(new THREE.IcosahedronGeometry(0.014, 0), fm, { x: Math.cos(a) * d, y: rimY + 0.09 + rnd() * 0.035, z: Math.sin(a) * d }))
      }
    }
    return group
  },

  daisy(rnd, app) {
    const { group, rimY } = buildPot(app, 0.07, 0.08)
    const lf = clay(C.leaf), st = clay(C.stem)
    for (let i = 0; i < 6; i++) {
      group.add(mesh(new THREE.IcosahedronGeometry(0.035, 0), lf,
        { x: Math.cos(i) * 0.03, y: rimY + 0.03, z: Math.sin(i) * 0.03, sy: 0.5 }))
    }
    const petal = clay(bloomColor(app, C.white, rnd) || C.leafLight), eye = clay(C.yellow)
    const n = 3 + Math.floor(rnd() * 3)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(), d = 0.03 + rnd() * 0.02, h = 0.17 + rnd() * 0.07
      const top = [Math.cos(a) * d, rimY + h, Math.sin(a) * d]
      group.add(stem([0, rimY, 0], top, 0.0025, st))
      group.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.004, 10), petal, { x: top[0], y: top[1], z: top[2], rx: 0.3 * rnd() }))
      group.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.008, 6), eye, { x: top[0], y: top[1] + 0.004, z: top[2] }))
    }
    return group
  },

  tulip(rnd, app) {
    const { group, rimY } = buildPot(app, 0.065, 0.08)
    const lf = clay(C.leafLight), st = clay(C.stem)
    const strap = leafGeometry(0.16, 0.035, 'strap')
    for (let i = 0; i < 5; i++) group.add(leafAt(strap, lf, { y: rimY, yaw: (i / 5) * Math.PI * 2 + rnd(), tilt: 0.25 + rnd() * 0.2 }))
    const cup = new THREE.LatheGeometry([[0, 0], [0.012, 0.004], [0.02, 0.02], [0.018, 0.04], [0.012, 0.045]].map(p => new THREE.Vector2(...p)), 6)
    const fm = clay(bloomColor(app, C.rose, rnd) || C.leafLight)
    const n = 2 + Math.floor(rnd() * 3)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(), top = [Math.cos(a) * 0.02, rimY + 0.22 + rnd() * 0.07, Math.sin(a) * 0.02]
      group.add(stem([0, rimY, 0], top, 0.003, st))
      group.add(mesh(cup, fm, { x: top[0], y: top[1], z: top[2] }))
    }
    return group
  },

  rose(rnd, app) {
    const { group, rimY } = buildPot(app, 0.08, 0.09)
    const lf = clay(C.leafDark), st = clay(C.stem)
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 0.05
      group.add(mesh(new THREE.IcosahedronGeometry(0.04, 0), lf, { x: Math.cos(a) * d, y: rimY + 0.06 + rnd() * 0.17, z: Math.sin(a) * d, sy: 0.7 }))
    }
    const b = bloomColor(app, C.rose, rnd)
    if (b) {
      const fm = clay(b)
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rnd(), top = [Math.cos(a) * 0.035, rimY + 0.27 + rnd() * 0.06, Math.sin(a) * 0.035]
        group.add(stem([0, rimY + 0.1, 0], top, 0.003, st))
        group.add(mesh(new THREE.DodecahedronGeometry(0.022, 0), fm, { x: top[0], y: top[1], z: top[2] }))
      }
    }
    return group
  },

  leafVine(rnd, app) {
    const { group, rimY, r } = buildPot(app, 0.075, 0.09)
    const lf = clay(C.leaf), lfL = clay(C.leafLight), st = clay(C.stem)
    const heart = leafGeometry(0.06, 0.05, 'heart')
    for (let i = 0; i < 9; i++) { // mound on top
      group.add(leafAt(heart, i % 3 ? lf : lfL, { y: rimY + 0.01 + rnd() * 0.04, yaw: rnd() * Math.PI * 2, tilt: 0.6 + rnd() * 0.6 }))
    }
    const vines = 2 + Math.floor(rnd() * 3)
    for (let v = 0; v < vines; v++) { // trailing over the rim
      const a = (v / vines) * Math.PI * 2 + rnd() * 0.6, drop = 0.12 + rnd() * 0.15
      const dx = Math.cos(a), dz = Math.sin(a)
      const p0 = [dx * r * 0.9, rimY + 0.01, dz * r * 0.9], p1 = [dx * (r + 0.02), rimY - drop, dz * (r + 0.02)]
      group.add(stem(p0, p1, 0.002, st))
      for (let k = 1; k <= 3; k++) {
        const t = k / 3.5
        group.add(leafAt(heart, lf, { x: p0[0] + (p1[0] - p0[0]) * t, y: p0[1] + (p1[1] - p0[1]) * t, z: p0[2] + (p1[2] - p0[2]) * t, yaw: a + (k % 2 ? 0.6 : -0.6), tilt: 2.2, }))
      }
    }
    return group
  },

  grassy(rnd, app) {
    const { group, rimY } = buildPot(app, 0.08, 0.1)
    const mats = [clay(C.leaf), clay(C.leafLight), clay(C.leafDark)]
    const n = 12 + Math.floor(rnd() * 6)
    for (let i = 0; i < n; i++) {
      const L = 0.22 + rnd() * 0.16
      group.add(leafAt(leafGeometry(L, 0.018, 'strap'), mats[i % 3], { y: rimY, yaw: (i / n) * Math.PI * 2 + rnd() * 0.3, tilt: 0.3 + rnd() * 0.7 }))
    }
    return group
  },

  fern(rnd, app) {
    const { group, rimY } = buildPot(app, 0.08, 0.1)
    const mats = [clay(C.leafLight), clay(C.leaf)]
    const n = 10 + Math.floor(rnd() * 4)
    for (let i = 0; i < n; i++) {
      const L = 0.22 + rnd() * 0.12
      group.add(leafAt(leafGeometry(L, 0.06, 'lance'), mats[i % 2], { y: rimY, yaw: (i / n) * Math.PI * 2 + rnd() * 0.3, tilt: 0.7 + rnd() * 0.5 }))
    }
    return group
  },

  peaceLily(rnd, app) {
    const { group, rimY } = buildPot(app, 0.08, 0.1)
    const lf = clay(C.leafDark), st = clay(C.stem)
    for (let i = 0; i < 8; i++) {
      const yaw = (i / 8) * Math.PI * 2 + rnd() * 0.4, tilt = 0.25 + rnd() * 0.35, base = 0.12 + rnd() * 0.08
      const tip = [Math.sin(yaw) * Math.sin(tilt) * base, rimY + Math.cos(tilt) * base, Math.cos(yaw) * Math.sin(tilt) * base]
      group.add(stem([0, rimY, 0], tip, 0.003, st))
      group.add(leafAt(leafGeometry(0.17, 0.07, 'lance'), lf, { x: tip[0], y: tip[1], z: tip[2], yaw, tilt: tilt + 0.25 }))
    }
    const b = bloomColor(app, C.white, rnd) || (app?.bloom?.id === 'none' ? null : C.white)
    if (b) {
      for (let i = 0; i < 2; i++) {
        const yaw = rnd() * Math.PI * 2, top = [Math.sin(yaw) * 0.04, rimY + 0.38 + rnd() * 0.08, Math.cos(yaw) * 0.04]
        group.add(stem([0, rimY, 0], top, 0.0025, st))
        group.add(leafAt(leafGeometry(0.1, 0.06, 'lance', 0, 0.006), clay(b), { x: top[0], y: top[1], z: top[2], yaw, tilt: -0.1 }))
        group.add(mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.05, 5), clay('#F1E7B8'), { x: top[0], y: top[1] + 0.03, z: top[2] }))
      }
    }
    return group
  },

  snakePlant(rnd, app) {
    const { group, rimY } = buildPot(app, 0.075, 0.1)
    const lf = clay(C.leafDark), edge = clay(C.yellowEdge)
    const n = 5 + Math.floor(rnd() * 3)
    for (let i = 0; i < n; i++) {
      const L = 0.35 + rnd() * 0.18, yaw = (i / n) * Math.PI * 2 + rnd() * 0.5, tilt = 0.05 + rnd() * 0.15
      const x = Math.cos(yaw) * 0.02, z = Math.sin(yaw) * 0.02
      group.add(leafAt(leafGeometry(L, 0.042, 'sword', 0, 0.008), lf, { x, y: rimY, z, yaw, tilt }))
      group.add(leafAt(leafGeometry(L * 1.02, 0.054, 'sword', 0, 0.004), edge, { x, y: rimY - 0.002, z, yaw, tilt }))
    }
    return group
  },

  monstera(rnd, app) {
    const { group, rimY } = buildPot(app, 0.12, 0.16)
    const lf = clay(C.leafDark), lf2 = clay(C.leaf), st = clay(C.stem)
    const n = 6 + Math.floor(rnd() * 3)
    for (let i = 0; i < n; i++) {
      const yaw = (i / n) * Math.PI * 2 + rnd() * 0.5, tilt = 0.2 + rnd() * 0.45, len = 0.28 + rnd() * 0.16
      const tip = [Math.sin(yaw) * Math.sin(tilt) * len, rimY + Math.cos(tilt) * len, Math.cos(yaw) * Math.sin(tilt) * len]
      group.add(stem([0, rimY, 0], tip, 0.005, st))
      group.add(leafAt(leafGeometry(0.32, 0.28, 'heart', 2 + Math.floor(rnd() * 3)), i % 2 ? lf : lf2,
        { x: tip[0], y: tip[1], z: tip[2], yaw, tilt: tilt + 0.9 + rnd() * 0.3 }))
    }
    return group
  },

  bamboo(rnd, app) {
    const glassish = app?.material?.id === 'glass' || !app?.material
    const { group, rimY } = buildPot(glassish ? { ...app, material: { id: 'glass' } } : app, 0.05, 0.12, glassish ? 'vase' : 'pot')
    const st = clay(C.bamboo), node = clay('#5E8C3A'), lf = clay(C.leafLight)
    const n = 3 + Math.floor(rnd() * 3)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = Math.cos(a) * 0.018, z = Math.sin(a) * 0.018
      const H = 0.22 + rnd() * 0.2
      group.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, H, 6), st, { x, y: 0.01 + H / 2, z }))
      for (let y = 0.08; y < H; y += 0.08) group.add(mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.006, 6), node, { x, y: 0.01 + y, z }))
      for (let k = 0; k < 3; k++) group.add(leafAt(leafGeometry(0.07, 0.02, 'lance'), lf, { x, y: 0.01 + H, z, yaw: rnd() * Math.PI * 2, tilt: 0.6 + rnd() * 0.4 }))
    }
    return group
  },

  palm(rnd, app) {
    const { group, rimY } = buildPot(app, 0.13, 0.18)
    const tr = clay(C.trunk), lf = clay(C.leaf)
    const T = 0.35 + rnd() * 0.15
    group.add(mesh(new THREE.CylinderGeometry(0.022, 0.03, T, 6), tr, { y: rimY + T / 2 }))
    const n = 7 + Math.floor(rnd() * 3)
    for (let i = 0; i < n; i++) {
      group.add(leafAt(leafGeometry(0.42 + rnd() * 0.12, 0.09, 'lance'), lf,
        { y: rimY + T, yaw: (i / n) * Math.PI * 2 + rnd() * 0.3, tilt: 0.9 + rnd() * 0.5 }))
    }
    return group
  },

  tree(rnd, app) {
    const { group, rimY } = buildPot(app, 0.14, 0.2)
    const tr = clay(C.bark), mats = [clay(C.leafDark), clay(C.leaf)]
    const T = 0.55 + rnd() * 0.2
    group.add(mesh(new THREE.CylinderGeometry(0.014, 0.022, T, 6), tr, { y: rimY + T / 2 }))
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, d = 0.04 + rnd() * 0.1
      group.add(mesh(new THREE.DodecahedronGeometry(0.07 + rnd() * 0.04, 0), mats[i % 2],
        { x: Math.cos(a) * d, y: rimY + T - 0.02 + rnd() * 0.18, z: Math.sin(a) * d, sy: 0.85 }))
    }
    const b = bloomColor(app, null, rnd) // citrus & co: a few fruit/flowers when blooming
    if (b) for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2
      group.add(mesh(new THREE.IcosahedronGeometry(0.018, 0), clay(b), { x: Math.cos(a) * 0.12, y: rimY + T + rnd() * 0.1, z: Math.sin(a) * 0.12 }))
    }
    return group
  },

  bonsai(rnd, app) {
    const { group, rimY } = buildPot(app, 0.1, 0.04, 'dish')
    const tr = clay(C.bark), lf = clay(C.leafDark)
    group.add(stem([0, rimY, 0], [0.03, rimY + 0.09, 0.01], 0.012, tr))
    group.add(stem([0.03, rimY + 0.09, 0.01], [-0.02, rimY + 0.17, 0], 0.009, tr))
    for (const [x, y, z, s] of [[0.06, 0.12, 0.02, 0.05], [-0.04, 0.2, 0, 0.06], [0.01, 0.23, -0.03, 0.045]]) {
      group.add(mesh(new THREE.IcosahedronGeometry(s, 0), lf, { x, y: rimY + y, z, sy: 0.45, ry: rnd() }))
    }
    return group
  },

}

export const SHAPE_IDS = Object.keys(SHAPES)

// Build the 3D plant for a catalog icon id. `app` = resolveAppearance(plant, cat). `scale` multiplies the
// typical size (per-plant "Smaller / Bigger"). Returns a Group with userData { height, potRadius }.
export function buildPlant3D(iconId, app, seed = '', scale = 1) {
  const make = SHAPES[iconId] || SHAPES.leafVine
  const rnd = seeded(`${iconId}:${seed}`)
  const inner = make(rnd, app)
  inner.rotation.y = rnd() * Math.PI * 2
  const g = new THREE.Group()
  g.add(inner)
  g.scale.setScalar(scale)
  const box = new THREE.Box3().setFromObject(g)
  const size = box.getSize(new THREE.Vector3())
  g.userData.height = box.max.y
  g.userData.radius = Math.max(size.x, size.z) / 2
  return g
}
