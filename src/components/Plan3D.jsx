// 3D plan: the apartment from the lightmap project, cut like a dollhouse, with the plants placed in it.
// Loaded lazily (three.js is ~600 kB), so the rest of the app never pays for it.
//
// Plant positions live on the plant as `pos3d: { x, y, h, room }` in MODEL metres (h = height above that
// room's floor). They sync per field like every other plant edit.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { Box, Loader2, Maximize2, Trash2, Wand2, ArrowUp, ArrowDown, Move, FileText, X, Minus, Plus } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { getCatalogPlant } from '../lib/catalog.js'
import { waterDaysLeft } from '../lib/schedule.js'
import { buildPlant3D } from '../lib/plant3d.js'
import { resolveAppearance } from '../lib/potOptions.js'
import { parseLightmapExport, toThree, fromThree, roomAt, autoPlace, round3, fileToDataURL, dataURLToArrayBuffer } from '../lib/model3d.js'
import { ConfirmSheet } from './Sheet.jsx'

const TAP_PX = 8
const H_STEP = 0.1
const SIZE_MIN = 0.4
const SIZE_MAX = 2.5

const plantName = p => p.nickname || getCatalogPlant(p.catalogId)?.name || 'Plant'

// Everything that changes how a plant LOOKS: its clay model is rebuilt only when this changes.
function lookKey(p) {
  return [p.catalogId, p.potMaterial, p.potColorId, p.potType, p.potColor, p.bloomColor, p.pos3d?.s || 1].join('|')
}

function makeEntity(p, key) {
  const cat = getCatalogPlant(p.catalogId)
  const model = buildPlant3D(cat?.icon, resolveAppearance(p, cat || {}), p.id, p.pos3d?.s || 1)
  const group = new THREE.Group()
  group.add(model)
  group.userData.plantId = p.id
  return { key, group, model, ring: null, label: null }
}

function makeRing(radius) {
  const r = Math.max(0.06, radius * 1.15)
  const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.025, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#7E49B3', side: THREE.DoubleSide }))
  ring.position.y = 0.004
  return ring
}

function dropLabel(ent) {
  if (!ent.label) return
  ent.group.remove(ent.label)
  ent.label.element.remove() // three only fires 'removed' on the object itself, not on DOM-backed children
  ent.label = null
}

function makeLabel(plant, lat, selected, onTap, height) {
  const left = waterDaysLeft(plant, lat)
  const el = document.createElement('div')
  el.className = `plant3d-label${selected ? ' is-selected' : ''}`
  const tag = document.createElement('span')
  tag.className = `tag ${left <= 0 ? 'tag-danger' : left <= 1 ? 'tag-warn' : 'tag-ok'}`
  tag.textContent = `💧${left <= 0 ? '!' : `${left}d`}`
  const name = document.createElement('b')
  name.textContent = plantName(plant)
  el.append(name, tag)
  // plants are small at whole-apartment zoom: the label is the easy thing to tap
  el.addEventListener('click', e => { e.stopPropagation(); onTap(plant.id) })
  const o = new CSS2DObject(el)
  o.position.set(0, height + 0.06, 0)
  return o
}

function disposeTree(obj) {
  obj.traverse(o => {
    o.geometry?.dispose?.()
    const m = o.material
    ;(Array.isArray(m) ? m : m ? [m] : []).forEach(x => x.dispose?.())
  })
}

export default function Plan3D({ onOpenPlant }) {
  const { state, model, importModel3d, removeModel3d, updatePlant, showToast } = useStore()
  const meta = state.plan.model3d || null
  const lat = state.settings.location?.lat
  const hostRef = useRef(null)
  const three = useRef(null)            // { renderer, labels, scene, camera, controls, plantsGroup, floors, hitables, requestRender, fit }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [placingId, setPlacingId] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  // the event handlers live in a three.js closure: give them the freshest React values
  const live = useRef({})
  live.current = { selectedId, placingId, plants: state.plants, meta }

  const placed = state.plants.filter(p => p.pos3d)
  const unplaced = state.plants.filter(p => !p.pos3d)
  const autoMoves = useMemo(() => meta ? autoPlace(state.plants, state.plan.zones || [], meta.rooms) : {},
    [state.plants, state.plan.zones, meta])
  const selected = state.plants.find(p => p.id === selectedId) || null

  /* ── scene setup (once per model) ── */
  useEffect(() => {
    if (!model.glb || !hostRef.current) return
    const host = hostRef.current
    let alive = true
    const css = getComputedStyle(document.documentElement)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(css.getPropertyValue('--surface').trim() || '#ffffff')
    host.appendChild(renderer.domElement)
    const labels = new CSS2DRenderer()
    labels.domElement.className = 'plan3d-labels'
    host.appendChild(labels.domElement)

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9a68a', 1.7))
    const sun = new THREE.DirectionalLight('#fff4e0', 1.3)
    sun.position.set(6, 12, 4)
    scene.add(sun)
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.maxPolarAngle = Math.PI * 0.49   // never under the floor
    const plantsGroup = new THREE.Group()
    scene.add(plantsGroup)

    let pending = false
    const requestRender = () => {
      if (pending) return
      pending = true
      requestAnimationFrame(() => { pending = false; renderer.render(scene, camera); labels.render(scene, camera) })
    }
    controls.addEventListener('change', requestRender)
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight
      if (!w || !h) return // hidden or mid-layout: a zero aspect would leave the camera matrix NaN
      renderer.setSize(w, h); labels.setSize(w, h)
      camera.aspect = w / h; camera.updateProjectionMatrix()
      requestRender()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    const ctx = { renderer, labels, scene, camera, controls, plantsGroup, floors: [], furniture: [], hitables: [], requestRender, bounds: null }
    ctx.fit = () => {
      if (!ctx.bounds) return
      const c = ctx.bounds.getCenter(new THREE.Vector3())
      const s = ctx.bounds.getSize(new THREE.Vector3()).length()
      controls.target.copy(c)
      camera.position.set(c.x + s * 0.3, c.y + s * 0.85, c.z + s * 0.55)
      controls.update(); requestRender()
    }
    three.current = ctx
    resize()

    setLoading(true)
    ;(async () => {
      try {
        const buf = await dataURLToArrayBuffer(model.glb)
        const gltf = await new GLTFLoader().parseAsync(buf, '')
        if (!alive) return
        scene.add(gltf.scene)
        gltf.scene.traverse(o => {
          if (!o.isMesh) return
          ctx.hitables.push(o)
          // node names come through sanitised ("floor:Living Room" -> "floorLiving_Room")
          if (o.name.startsWith('floor') || o.parent?.name?.startsWith('floor')) ctx.floors.push(o)
          if (o.name.startsWith('furniture') || o.parent?.name?.startsWith('furniture')) ctx.furniture.push(o)
        })
        ctx.bounds = new THREE.Box3().setFromObject(gltf.scene)
        ctx.fit()
        setError(null)
        syncPlants()
      } catch (e) {
        if (alive) setError(`Could not read the 3D model: ${e.message}`)
      } finally {
        if (alive) setLoading(false)
      }
    })()

    /* ── pointer: tap to select / place, drag a selected plant along the floor ── */
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const pick = (e, objects) => {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      return ray.intersectObjects(objects, true)
    }
    const plantHit = e => {
      const h = pick(e, plantsGroup.children)[0]
      let o = h?.object
      while (o && !o.userData.plantId) o = o.parent
      return o || null
    }
    // The surface a plant would stand on under the finger: a floor, or the TOP of furniture (shelf board, table,
    // nightstand). Sides of furniture are skipped, and walls are looked through: from above, cut walls hide
    // strips of floor and a finger on a small screen easily lands on one.
    const up = new THREE.Vector3()
    const floorPoint = e => {
      for (const h of pick(e, [...ctx.floors, ...ctx.furniture])) {
        const onFloor = ctx.floors.includes(h.object)
        if (!onFloor) {
          up.copy(h.face.normal).transformDirection(h.object.matrixWorld)
          if (up.y < 0.7) continue // the side or underside of a piece of furniture
        }
        const p = fromThree(h.point)
        const room = roomAt(live.current.meta?.rooms || [], p.x, p.y)
        if (!room) continue
        const hAbove = onFloor ? 0 : Math.max(0, round3(p.z - (room.floorZ || 0)))
        return { x: round3(p.x), y: round3(p.y), room: room.name, h: hAbove }
      }
      return null
    }
    let down = null
    let drag = null
    const onDown = e => {
      down = { x: e.clientX, y: e.clientY }
      const hit = plantHit(e)
      if (hit && hit.userData.plantId === live.current.selectedId) {
        drag = { id: hit.userData.plantId, obj: hit, pos: null }
        controls.enabled = false
        try { renderer.domElement.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
      }
    }
    const onMove = e => {
      if (!drag) return
      const f = floorPoint(e)
      if (!f) return
      const room = live.current.meta.rooms.find(r => r.name === f.room)
      drag.pos = f
      drag.obj.position.set(...toThree(f.x, f.y, (room?.floorZ || 0) + drag.pos.h))
      requestRender()
    }
    const onUp = e => {
      const moved = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_PX
      if (drag) {
        controls.enabled = true
        if (drag.pos) updatePlantRef.current(drag.id, { pos3d: drag.pos })
        drag = null
        down = null
        return
      }
      down = null
      if (moved) return
      const { placingId: placing } = live.current
      if (placing) {
        const f = floorPoint(e)
        if (f) {
          updatePlantRef.current(placing, { pos3d: f })
          setPlacingId(null)
          setSelectedId(placing)
        }
        return
      }
      const hit = plantHit(e)
      setSelectedId(hit ? hit.userData.plantId : null)
    }
    const el = renderer.domElement
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)

    return () => {
      alive = false
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      controls.dispose()
      disposeTree(scene)
      renderer.dispose()
      host.innerHTML = ''
      three.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.glb])

  const updatePlantRef = useRef(updatePlant)
  updatePlantRef.current = updatePlant

  /* ── plants: models cached per plant; position, ring and label refreshed every render ── */
  const syncPlants = () => {
    const ctx = three.current
    if (!ctx || !meta) return
    const ents = ctx.plantEnts || (ctx.plantEnts = new Map())
    const drop = (id, ent) => { dropLabel(ent); ctx.plantsGroup.remove(ent.group); disposeTree(ent.group); ents.delete(id) }
    const keep = new Set()
    for (const p of live.current.plants) {
      if (!p.pos3d) continue
      keep.add(p.id)
      const key = lookKey(p)
      let ent = ents.get(p.id)
      if (ent && ent.key !== key) { drop(p.id, ent); ent = null }
      if (!ent) { ent = makeEntity(p, key); ents.set(p.id, ent); ctx.plantsGroup.add(ent.group) }
      const room = meta.rooms.find(r => r.name === p.pos3d.room)
      ent.group.position.set(...toThree(p.pos3d.x, p.pos3d.y, (room?.floorZ || 0) + (p.pos3d.h || 0)))
      const sel = p.id === live.current.selectedId
      if (sel && !ent.ring) { ent.ring = makeRing(ent.model.userData.radius); ent.group.add(ent.ring) }
      if (!sel && ent.ring) { ent.group.remove(ent.ring); disposeTree(ent.ring); ent.ring = null }
      dropLabel(ent) // cheap, and keeps the watering tag current
      ent.label = makeLabel(p, lat, sel, id => { if (!live.current.placingId) setSelectedId(id) }, ent.model.userData.height)
      ent.group.add(ent.label)
    }
    for (const [id, ent] of [...ents]) if (!keep.has(id)) drop(id, ent)
    ctx.requestRender()
  }
  useEffect(syncPlants) // cheap at household plant counts; runs after every render

  /* ── actions ── */
  const onFiles = async e => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    const glbFile = files.find(f => /\.glb$/i.test(f.name))
    const jsonFile = files.find(f => /\.json$/i.test(f.name))
    if (!glbFile || !jsonFile) {
      setError('Pick both files from the lightmap export together: apartment.glb and lightmap_export.json.')
      return
    }
    setLoading(true)
    try {
      const { meta: m, light } = parseLightmapExport(await jsonFile.text())
      const glb = await fileToDataURL(glbFile)
      await importModel3d({ meta: { ...m, files: [glbFile.name, jsonFile.name] }, glb, light })
      setError(null)
      showToast({ text: `3D model loaded: ${m.rooms.length} rooms` })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const runAutoPlace = () => {
    const entries = Object.entries(autoMoves)
    for (const [id, pos3d] of entries) updatePlant(id, { pos3d })
    showToast({ text: `Placed ${entries.length} plant${entries.length === 1 ? '' : 's'} by their room` })
  }

  const setHeight = dh => {
    if (!selected?.pos3d) return
    const h = Math.max(0, Math.min(2.5, round3((selected.pos3d.h || 0) + dh)))
    updatePlant(selected.id, { pos3d: { ...selected.pos3d, h } })
  }

  const setSize = f => {
    if (!selected?.pos3d) return
    const s = Math.max(SIZE_MIN, Math.min(SIZE_MAX, round3((selected.pos3d.s || 1) * f)))
    updatePlant(selected.id, { pos3d: { ...selected.pos3d, s } })
  }

  const fileInput = (label, cls) => (
    <label className={cls}>
      {loading ? <Loader2 size={14} className="spin" /> : <Box size={14} />} {label}
      <input type="file" accept=".glb,.json,model/gltf-binary,application/json" multiple hidden onChange={onFiles} disabled={loading} />
    </label>
  )

  /* ── no model yet ── */
  if (!model.glb || !meta) {
    return (
      <div className="card empty">
        <Box className="big" strokeWidth={1} />
        <h3>See your home in 3D</h3>
        <p>
          Import the export from the lightmap project (option 8 in LIGHTMAP.bat): pick <b>apartment.glb</b> and{' '}
          <b>lightmap_export.json</b> together. It syncs to your other devices like the floor plan.
        </p>
        {fileInput(loading ? 'Loading…' : 'Import 3D model', 'btn btn-primary as-file')}
        {error && <p className="note-danger">{error}</p>}
      </div>
    )
  }

  const hint = placingId
    ? `Tap the floor, shelf or table where your ${plantName(state.plants.find(p => p.id === placingId) || {})} lives`
    : selected ? 'Drag the plant to move it (it lands on floors, shelves and tables) · tap empty space to deselect'
      : 'Drag to orbit · pinch or scroll to zoom · two fingers to pan · tap a plant'

  return (
    <>
      <div className="plan-toolbar">
        <button className="chip" onClick={() => three.current?.fit()}><Maximize2 size={14} /> Fit view</button>
        {Object.keys(autoMoves).length > 0 && (
          <button className="chip" onClick={runAutoPlace}><Wand2 size={14} /> Place {Object.keys(autoMoves).length} by room</button>
        )}
        {fileInput('Replace model', 'chip as-file')}
        <button className="chip" onClick={() => setConfirmRemove(true)}><Trash2 size={14} /> Remove</button>
      </div>

      {unplaced.length > 0 && (
        <div className="plan-toolbar plan-toolbar-stacked">
          {unplaced.map(p => (
            <button key={p.id} className={`chip${placingId === p.id ? ' is-active' : ''}`}
              onClick={() => { setPlacingId(id => (id === p.id ? null : p.id)); setSelectedId(null) }}>
              🪴 Place {plantName(p)}
            </button>
          ))}
        </div>
      )}

      {error && <p className="note-inline note-danger">{error}</p>}
      <p className="muted note-inline">{hint}</p>

      <div className="plan-wrap plan3d-wrap">
        <div ref={hostRef} className="plan3d-host" />
        {loading && <div className="plan3d-loading"><Loader2 className="spin" /></div>}
      </div>

      {selected && (
        <div className="card plan3d-selected">
          <div className="plan3d-selected-head">
            <b>{plantName(selected)}</b>
            <span className="muted">
              {selected.pos3d ? `${selected.pos3d.room} · ${selected.pos3d.h ? `${selected.pos3d.h.toFixed(1)} m up` : 'on the floor'}${(selected.pos3d.s || 1) !== 1 ? ` · ${Math.round((selected.pos3d.s || 1) * 100)}% size` : ''}` : 'not placed'}
            </span>
            <button className="icon-btn" aria-label="Close" onClick={() => setSelectedId(null)}><X size={16} /></button>
          </div>
          <div className="plan-toolbar">
            <button className="chip" onClick={() => onOpenPlant(selected)}><FileText size={14} /> Care sheet</button>
            <button className="chip" onClick={() => setPlacingId(selected.id)}><Move size={14} /> Move</button>
            <button className="chip" aria-label="Raise" onClick={() => setHeight(H_STEP)}><ArrowUp size={14} /> Higher</button>
            <button className="chip" aria-label="Lower" disabled={!selected.pos3d?.h} onClick={() => setHeight(-H_STEP)}><ArrowDown size={14} /> Lower</button>
            <button className="chip" aria-label="Smaller" disabled={(selected.pos3d?.s || 1) <= SIZE_MIN} onClick={() => setSize(0.8)}><Minus size={14} /> Smaller</button>
            <button className="chip" aria-label="Bigger" disabled={(selected.pos3d?.s || 1) >= SIZE_MAX} onClick={() => setSize(1.25)}><Plus size={14} /> Bigger</button>
            <button className="chip" onClick={() => { updatePlant(selected.id, { pos3d: null }); setSelectedId(null) }}><Trash2 size={14} /> Unplace</button>
          </div>
        </div>
      )}

      <p className="muted note-inline">
        {placed.length}/{state.plants.length} placed in 3D
        {meta.light ? ` · light ${meta.light.calibrated ? 'calibrated to your meter' : 'uncalibrated'}` : ''}
      </p>

      {confirmRemove && (
        <ConfirmSheet
          title="Remove the 3D model?"
          body="Plant positions in 3D are kept, so importing the model again puts everything back."
          confirmLabel="Remove"
          danger
          onConfirm={() => { removeModel3d() }}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </>
  )
}
