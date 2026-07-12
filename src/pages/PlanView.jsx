import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, AppWindow, Square, Ruler, Eraser, Compass, RefreshCw, Loader2 } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { fileToPlanImage } from '../lib/planFile.js'
import { getCatalogPlant, LIGHT_LABELS } from '../lib/catalog.js'
import { waterDaysLeft, daysLeftLabel } from '../lib/schedule.js'
import { PlantIcon } from '../components/PlantIcons.jsx'
import { PlantDetailModal } from '../components/PlantDetailModal.jsx'

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

function bearingInfo(facingDeg, northDeg, lat = 20) {
  const bearing = ((northDeg + facingDeg) % 360 + 360) % 360
  const name = CARDINALS[Math.round(bearing / 45) % 8]
  const south = lat >= 0 // southern exposure is the sunny side in the northern hemisphere
  const sunny = south ? ['S', 'SE', 'SW'] : ['N', 'NE', 'NW']
  const mid = ['E', 'W']
  const light = sunny.includes(name) ? 'direct sun' : mid.includes(name) ? 'partial sun' : 'indirect / shade'
  return { name, light }
}

export default function PlanView() {
  const {
    state, planImage, icons, savePlanImage, clearPlan, setPlan, updatePlant,
  } = useStore()
  const plan = state.plan
  const lat = state.settings.location?.lat

  const wrapRef = useRef(null)
  const [view, setView] = useState({ tx: 0, ty: 0, s: 0.4 })
  const [mode, setMode] = useState('view') // view | place | window | zone | measure | erase
  const [placingId, setPlacingId] = useState(null)
  const [jiggleId, setJiggleId] = useState(null)
  const [calPoints, setCalPoints] = useState([])
  const [measure, setMeasure] = useState(null) // meters shown after 2 points
  const [zoneDraft, setZoneDraft] = useState(null)
  const [zoneSheet, setZoneSheet] = useState(null)  // rect awaiting name/light
  const [scaleSheet, setScaleSheet] = useState(null) // {pixels}
  const [northSheet, setNorthSheet] = useState(false)
  const [detailPlant, setDetailPlant] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const longPress = useRef(null)
  const didFit = useRef(false)

  const placed = state.plants.filter(p => p.x !== null && p.x !== undefined)
  const unplaced = state.plants.filter(p => p.x === null || p.x === undefined)

  // fit plan on first load
  useEffect(() => {
    if (!planImage || !plan.width || didFit.current || !wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    const s = Math.min(r.width / plan.width, r.height / plan.height) * 0.95
    setView({ s, tx: (r.width - plan.width * s) / 2, ty: (r.height - plan.height * s) / 2 })
    didFit.current = true
  }, [planImage, plan.width, plan.height])

  // non-passive wheel zoom
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = e => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const cx = e.clientX - r.left
      const cy = e.clientY - r.top
      setView(v => {
        const s = Math.min(8, Math.max(0.05, v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
        return { s, tx: cx - (cx - v.tx) * (s / v.s), ty: cy - (cy - v.ty) * (s / v.s) }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [planImage])

  const toPlan = (clientX, clientY, v = view) => {
    const r = wrapRef.current.getBoundingClientRect()
    return { x: (clientX - r.left - v.tx) / v.s, y: (clientY - r.top - v.ty) / v.s }
  }

  const zoneAt = pt => plan.zones.find(z => pt.x >= z.x && pt.x <= z.x + z.w && pt.y >= z.y && pt.y <= z.y + z.h)

  const placePlant = (id, pt) => {
    const zone = zoneAt(pt)
    updatePlant(id, { x: pt.x, y: pt.y, zoneId: zone?.id || null })
  }

  /* ── background gestures ── */
  const onPointerDown = e => {
    try { wrapRef.current.setPointerCapture(e.pointerId) } catch { /* already released */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        type: 'pinch',
        startDist: Math.hypot(a.x - b.x, a.y - b.y),
        startMidPlan: toPlan((a.x + b.x) / 2, (a.y + b.y) / 2),
        startS: view.s,
      }
    } else if (mode === 'zone') {
      const pt = toPlan(e.clientX, e.clientY)
      gesture.current = { type: 'zone', x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }
      setZoneDraft({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y })
    } else {
      gesture.current = { type: 'pan', startX: e.clientX, startY: e.clientY, startView: view, moved: false }
    }
  }

  const onPointerMove = e => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    if (g.type === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const s = Math.min(8, Math.max(0.05, g.startS * (dist / g.startDist)))
      const r = wrapRef.current.getBoundingClientRect()
      const midX = (a.x + b.x) / 2 - r.left
      const midY = (a.y + b.y) / 2 - r.top
      setView({ s, tx: midX - g.startMidPlan.x * s, ty: midY - g.startMidPlan.y * s })
    } else if (g.type === 'pan') {
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      if (Math.abs(dx) + Math.abs(dy) > 5) g.moved = true
      setView({ ...g.startView, tx: g.startView.tx + dx, ty: g.startView.ty + dy })
    } else if (g.type === 'zone') {
      const pt = toPlan(e.clientX, e.clientY)
      g.x1 = pt.x
      g.y1 = pt.y
      setZoneDraft({ x0: g.x0, y0: g.y0, x1: pt.x, y1: pt.y })
    }
  }

  const onPointerUp = e => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (!g) return
    if (g.type === 'zone') {
      gesture.current = null
      const rect = normRect(g)
      if (rect.w * view.s > 24 && rect.h * view.s > 24) setZoneSheet(rect)
      setZoneDraft(null)
      return
    }
    if (g.type === 'pan' && !g.moved) {
      const pt = toPlan(e.clientX, e.clientY)
      handleTap(pt)
    }
    if (pointers.current.size === 0) gesture.current = null
  }

  const handleTap = pt => {
    if (mode === 'place' && placingId) {
      placePlant(placingId, pt)
      setPlacingId(null)
      setMode('view')
    } else if (mode === 'window') {
      setPlan({ windows: [...plan.windows, { id: crypto.randomUUID(), x: pt.x, y: pt.y, facingDeg: 0 }] })
    } else if (mode === 'measure') {
      setMeasure(null)
      setCalPoints(prev => {
        const next = [...prev, pt]
        if (next.length === 2) {
          const px = Math.hypot(next[0].x - next[1].x, next[0].y - next[1].y)
          if (plan.metersPerUnit) setMeasure(px * plan.metersPerUnit)
          else setScaleSheet({ pixels: px })
        }
        return next.length > 2 ? [pt] : next
      })
    } else {
      setJiggleId(null)
    }
  }

  /* ── plant markers ── */
  const markerDown = (e, plant) => {
    e.stopPropagation()
    if (mode === 'erase') {
      updatePlant(plant.id, { x: null, y: null, zoneId: null })
      return
    }
    if (mode !== 'view') return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* already released */ }
    const start = { x: e.clientX, y: e.clientY, moved: false, wasJiggling: jiggleId === plant.id }
    e.currentTarget._start = start
    if (!start.wasJiggling) {
      longPress.current = setTimeout(() => {
        setJiggleId(plant.id)
        if (navigator.vibrate) navigator.vibrate(30)
      }, 450)
    }
  }
  const markerMove = (e, plant) => {
    const start = e.currentTarget._start
    if (!start) return
    if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 8) {
      start.moved = true
      if (!start.wasJiggling && jiggleId !== plant.id) clearTimeout(longPress.current)
    }
    if (jiggleId === plant.id && start.moved) {
      const pt = toPlan(e.clientX, e.clientY)
      updatePlant(plant.id, { x: pt.x, y: pt.y })
    }
  }
  const markerUp = (e, plant) => {
    clearTimeout(longPress.current)
    const start = e.currentTarget._start
    e.currentTarget._start = null
    if (!start) return
    if (jiggleId === plant.id && start.moved) {
      // finalize zone assignment after a drag
      const zone = zoneAt({ x: plant.x, y: plant.y })
      updatePlant(plant.id, { zoneId: zone?.id || null })
    } else if (!start.moved && jiggleId !== plant.id) {
      setDetailPlant(plant)
    }
  }

  /* ── windows / zones taps ── */
  const windowTap = (e, w) => {
    e.stopPropagation()
    if (mode === 'erase') {
      setPlan({ windows: plan.windows.filter(x => x.id !== w.id) })
    } else if (mode === 'window' || mode === 'view') {
      setPlan({ windows: plan.windows.map(x => x.id === w.id ? { ...x, facingDeg: (x.facingDeg + 45) % 360 } : x) })
    }
  }

  /* ── upload ── */
  const onFile = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const { dataUrl, width, height } = await fileToPlanImage(file)
      didFit.current = false
      await savePlanImage(dataUrl, width, height)
    } catch (err) {
      console.error('Floor plan upload failed', err)
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const hint = useMemo(() => {
    if (mode === 'place') {
      const cat = getCatalogPlant(state.plants.find(p => p.id === placingId)?.catalogId)
      return `Tap the plan where your ${cat?.name || 'plant'} lives`
    }
    if (mode === 'window') return 'Tap a wall to add a window · tap a window to rotate its facing'
    if (mode === 'zone') return 'Drag a rectangle over a room to set its light'
    if (mode === 'measure') {
      if (measure) return `Distance: ${measure >= 1 ? measure.toFixed(2) + ' m' : (measure * 100).toFixed(0) + ' cm'}`
      if (calPoints.length === 1) return 'Tap the other end of the known measurement'
      return plan.metersPerUnit ? 'Tap two points to measure a distance' : 'Tap both ends of a known measurement to set the scale'
    }
    if (mode === 'erase') return 'Tap a plant, window or zone to remove it from the plan'
    if (jiggleId) return 'Drag the shaking plant to move it · tap elsewhere when done'
    return null
  }, [mode, placingId, jiggleId, calPoints, measure, plan.metersPerUnit, state.plants])

  const toggleMode = m => {
    setMode(cur => (cur === m ? 'view' : m))
    setCalPoints([])
    setMeasure(null)
    setJiggleId(null)
    if (m !== 'place') setPlacingId(null)
  }

  const freshDetail = detailPlant && state.plants.find(p => p.id === detailPlant.id)

  /* ── empty state ── */
  if (!planImage) {
    return (
      <div className="main-content">
        <div className="section-head"><h2>Floor Plan</h2></div>
        <div className="card empty">
          <Compass className="big" strokeWidth={1} style={{ color: 'var(--mint)' }} />
          <h3>Map your home</h3>
          <p>Upload your house or apartment floor plan (PDF or SVG) to place plants, mark windows and set the light in each room.</p>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
            {uploading ? 'Processing…' : 'Upload floor plan'}
            <input type="file" accept=".pdf,.svg,image/*" hidden onChange={onFile} disabled={uploading} />
          </label>
          {uploadError && <p style={{ color: 'var(--red)', marginTop: 10 }}>{uploadError}</p>}
        </div>
      </div>
    )
  }

  /* ── main plan UI ── */
  return (
    <div className="main-content">
      <div className="section-head">
        <h2>Floor Plan</h2>
        <span className="sub">
          {plan.metersPerUnit ? `scale set · ` : ''}{placed.length}/{state.plants.length} placed
        </span>
      </div>

      <div className="plan-toolbar">
        <button className={`chip${mode === 'window' ? ' active' : ''}`} onClick={() => toggleMode('window')}><AppWindow size={14} /> Windows</button>
        <button className={`chip${mode === 'zone' ? ' active' : ''}`} onClick={() => toggleMode('zone')}><Square size={14} /> Light zones</button>
        <button className={`chip${mode === 'measure' ? ' active' : ''}`} onClick={() => toggleMode('measure')}><Ruler size={14} /> {plan.metersPerUnit ? 'Measure' : 'Set scale'}</button>
        <button className={`chip${mode === 'erase' ? ' active' : ''}`} onClick={() => toggleMode('erase')}><Eraser size={14} /> Erase</button>
        <button className="chip" onClick={() => setNorthSheet(true)}><Compass size={14} /> North</button>
        <label className="chip" style={{ cursor: 'pointer' }}>
          <RefreshCw size={14} /> Replace
          <input type="file" accept=".pdf,.svg,image/*" hidden onChange={onFile} />
        </label>
      </div>

      {uploadError && <p style={{ color: 'var(--red)', fontSize: 12.5, margin: '0 2px 8px' }}>{uploadError}</p>}
      {uploading && <p className="muted" style={{ margin: '0 2px 8px', fontSize: 12.5 }}>Processing new plan…</p>}

      {unplaced.length > 0 && (
        <div className="plan-toolbar" style={{ marginTop: -2 }}>
          {unplaced.map(p => {
            const cat = getCatalogPlant(p.catalogId)
            return (
              <button
                key={p.id}
                className={`chip${placingId === p.id ? ' active' : ''}`}
                onClick={() => { setPlacingId(p.id); setMode('place') }}
              >
                🪴 Place {p.nickname || cat?.name}
              </button>
            )
          })}
        </div>
      )}

      <div
        ref={wrapRef} className="plan-wrap"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      >
        <div className="plan-canvas" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})` }}>
          <img src={planImage} width={plan.width} height={plan.height} alt="Floor plan" draggable={false} />
        </div>

        {/* light zones */}
        {plan.zones.map(z => (
          <div
            key={z.id} className={`zone-rect ${z.light}`}
            style={{
              left: z.x * view.s + view.tx, top: z.y * view.s + view.ty,
              width: z.w * view.s, height: z.h * view.s,
              pointerEvents: mode === 'erase' ? 'auto' : 'none', cursor: 'pointer',
            }}
            onPointerDown={e => e.stopPropagation()}
            onClick={() => mode === 'erase' && setPlan({ zones: plan.zones.filter(x => x.id !== z.id) })}
          >
            {z.name} · {LIGHT_LABELS[z.light]}
          </div>
        ))}
        {zoneDraft && (() => {
          const r = normRect(zoneDraft)
          return <div className="zone-rect partial" style={{ left: r.x * view.s + view.tx, top: r.y * view.s + view.ty, width: r.w * view.s, height: r.h * view.s }} />
        })()}

        {/* windows */}
        {plan.windows.map(w => {
          const info = bearingInfo(w.facingDeg, plan.northDeg, lat)
          return (
            <div
              key={w.id} className="window-marker" title={`Faces ${info.name} — ${info.light}`}
              style={{ left: w.x * view.s + view.tx, top: w.y * view.s + view.ty, rotate: `${w.facingDeg}deg` }}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => windowTap(e, w)}
            >
              <span className="facing" />
            </div>
          )
        })}

        {/* calibration dots */}
        {calPoints.map((p, i) => (
          <div key={i} className="cal-dot" style={{ left: p.x * view.s + view.tx, top: p.y * view.s + view.ty }} />
        ))}

        {/* plant markers */}
        {placed.map(p => {
          const cat = getCatalogPlant(p.catalogId)
          const left = waterDaysLeft(p, lat)
          const custom = icons[p.id]
          return (
            <div
              key={p.id}
              className={`plan-marker${jiggleId === p.id ? ' jiggle' : ''}`}
              style={{ left: p.x * view.s + view.tx, top: p.y * view.s + view.ty }}
              onPointerDown={e => markerDown(e, p)}
              onPointerMove={e => markerMove(e, p)}
              onPointerUp={e => markerUp(e, p)}
              onPointerCancel={e => markerUp(e, p)}
            >
              {custom ? <img src={custom} alt="" /> : <PlantIcon icon={cat?.icon} />}
              <span className={`tag marker-tag ${left <= 0 ? 'due' : left <= 1 ? 'soon' : 'ok'}`}>💧{left <= 0 ? '!' : `${left}d`}</span>
            </div>
          )
        })}

        <div className="compass" title={`North is ${plan.northDeg}° from plan-up`}>
          <span style={{ display: 'inline-block', rotate: `${plan.northDeg}deg` }}>▲N</span>
        </div>
        {hint && <div className="plan-hint">{hint}</div>}
      </div>

      {/* zone naming sheet */}
      {zoneSheet && (
        <ZoneSheet
          onSave={(name, light) => {
            const zone = { id: crypto.randomUUID(), ...zoneSheet, name, light }
            setPlan({ zones: [...plan.zones, zone] })
            // adopt plants already sitting inside the new zone
            placed.forEach(p => {
              if (p.x >= zone.x && p.x <= zone.x + zone.w && p.y >= zone.y && p.y <= zone.y + zone.h) {
                updatePlant(p.id, { zoneId: zone.id })
              }
            })
            setZoneSheet(null)
            setMode('view')
          }}
          onClose={() => setZoneSheet(null)}
        />
      )}

      {/* scale calibration sheet */}
      {scaleSheet && (
        <ScaleSheet
          onSave={meters => {
            setPlan({ metersPerUnit: meters / scaleSheet.pixels })
            setScaleSheet(null)
            setCalPoints([])
            setMode('view')
          }}
          onClose={() => { setScaleSheet(null); setCalPoints([]) }}
        />
      )}

      {/* north orientation sheet */}
      {northSheet && (
        <div className="overlay" onClick={() => setNorthSheet(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h2>Building orientation</h2>
            <p className="muted" style={{ marginBottom: 14 }}>
              Rotate until the arrow points to real-world North on your plan. Window facings (and their light) are computed from this.
            </p>
            <div className="center" style={{ margin: '10px 0 18px' }}>
              <div style={{ fontSize: 44, rotate: `${plan.northDeg}deg`, display: 'inline-block', color: 'var(--red)' }}>⬆</div>
              <div style={{ fontWeight: 800 }}>{plan.northDeg}°</div>
            </div>
            <input
              type="range" min="0" max="359" step="1" value={plan.northDeg}
              style={{ width: '100%' }}
              onChange={e => setPlan({ northDeg: +e.target.value })}
            />
            <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => setNorthSheet(false)}>Done</button>
          </div>
        </div>
      )}

      {freshDetail && <PlantDetailModal plant={freshDetail} onClose={() => setDetailPlant(null)} />}

      <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        Pinch or scroll to zoom · drag to pan · press and hold a plant until it shakes to move it ·{' '}
        <a href="#" onClick={e => { e.preventDefault(); if (confirm('Remove the floor plan and all windows/zones?')) clearPlan() }} style={{ color: 'var(--red)' }}>remove plan</a>
      </p>
    </div>
  )
}

function normRect({ x0, y0, x1, y1 }) {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }
}

function ZoneSheet({ onSave, onClose }) {
  const [name, setName] = useState('')
  const [light, setLight] = useState('partial')
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2>New light zone</h2>
        <div className="field">
          <label>Room name</label>
          <input value={name} placeholder="e.g. Living room" onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Light in this room</label>
          <div className="seg">
            {['direct', 'partial', 'shade'].map(l => (
              <button key={l} className={light === l ? 'active' : ''} onClick={() => setLight(l)}>{LIGHT_LABELS[l]}</button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary btn-block" disabled={!name.trim()} onClick={() => onSave(name.trim(), light)}>Save zone</button>
      </div>
    </div>
  )
}

function ScaleSheet({ onSave, onClose }) {
  const [meters, setMeters] = useState('')
  const val = parseFloat(meters)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2>Set the scale</h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          How long is the measurement you just marked, in real life?
        </p>
        <div className="field">
          <label>Real length (meters)</label>
          <input type="number" inputMode="decimal" min="0.05" step="0.01" value={meters} placeholder="e.g. 3.50" onChange={e => setMeters(e.target.value)} autoFocus />
        </div>
        <button className="btn btn-primary btn-block" disabled={!(val > 0)} onClick={() => onSave(val)}>Save scale</button>
      </div>
    </div>
  )
}
