import { useRef, useState } from 'react'
import { formatISO, format, parseISO } from 'date-fns'
import { Droplets, Sun, Sparkles, Trash2, Loader2, Wand2, Wind, CloudRain, StickyNote, Camera, Shovel, X, SlidersHorizontal } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { getCatalogPlant, LIGHT_LABELS } from '../lib/catalog.js'
import {
  waterDaysLeft, mistDaysLeft, fertilizeDaysLeft, daysLeftLabel, waterIntervalDays,
  WIND_SENSITIVITY, resolveWindSensitivity, intervalBreakdown,
} from '../lib/schedule.js'
import { generatePlantIcon } from '../lib/gemini.js'
import { resizeImage } from '../lib/image.js'
import { PlantIcon, WateringCan, SprayBottle } from './PlantIcons.jsx'
import { ZonePicker } from './ZonePicker.jsx'
import { Sheet } from './Sheet.jsx'
import { POT_MATERIALS, POT_COLORS, BLOOM_COLORS, resolveAppearance } from '../lib/potOptions.js'

const RAIN_COPY = { soaked: 'Rain soaked it', damp: 'Light rain — next watering pushed a day', dry: 'Rain missed it' }
const LOG_META = {
  water: { Icon: Droplets, text: e => (e.source === 'rain' ? 'Watered by rain' : 'Watered') },
  mist:  { Icon: Wind, text: () => 'Misted' },
  feed:  { Icon: Sparkles, text: () => 'Fed' },
  rain:  { Icon: CloudRain, text: e => RAIN_COPY[e.source] || 'Rain answered' },
  repot: { Icon: Shovel, text: () => 'Repotted' },
  note:  { Icon: StickyNote, text: e => e.text },
  photo: { Icon: Camera, text: e => e.text || 'Photo' },
}

// One care action row: the same two button styles everywhere — filled when
// it's due, outline when it isn't — and the overdue count in red.
function CareRow({ icon, title, left, action, onLog }) {
  const due = left !== null && left <= 0
  return (
    <div className="list-row">
      <div className="row-icon">{icon}</div>
      <div className="grow">
        {title}
        <small className={left !== null && left < 0 ? 'due-text' : ''}>Next: {daysLeftLabel(left)}</small>
      </div>
      <button className={`btn btn-sm ${due ? 'btn-primary' : 'btn-secondary'}`} onClick={onLog}>
        {action.icon}{due ? action.due : action.idle}
      </button>
    </div>
  )
}

function CareHistory({ plant }) {
  const { photos, addNote, addPhoto, logRepot, removeLogEntry } = useStore()
  const [note, setNote] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const fileRef = useRef(null)
  const log = plant.log || []
  const shown = showAll ? log : log.slice(0, 8)

  const saveNote = () => {
    if (!note.trim()) return
    addNote(plant.id, note.trim())
    setNote('')
  }
  const onPhoto = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setErr(null)
    try {
      await addPhoto(plant.id, await resizeImage(file), note.trim())
      setNote('')
    } catch (x) {
      setErr(x.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field">
      <label>Care history</label>
      <div className="inline-actions">
        <input
          value={note} placeholder="Add a note — new leaf, pests, moved…"
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && saveNote()}
        />
        <button className="btn btn-secondary btn-sm" onClick={saveNote} disabled={!note.trim()}>Add</button>
      </div>
      <div className="row-actions">
        <button className="btn btn-soft btn-sm" onClick={() => fileRef.current.click()} disabled={busy}>
          {busy ? <Loader2 size={14} className="spin" /> : <Camera size={14} />} Add photo
        </button>
        <button className="btn btn-soft btn-sm" onClick={() => logRepot(plant.id)}>
          <Shovel size={14} /> Log repot
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
      </div>
      {err && <p className="note-danger">{err}</p>}
      {plant.lastRepotted && <p className="field-note">Last repotted {format(parseISO(plant.lastRepotted), 'd MMM yyyy')}.</p>}

      {log.length === 0 ? (
        <p className="field-note">Waterings, feeds, rain answers, notes and photos will collect here.</p>
      ) : (
        <ul className="care-log">
          {shown.map(e => {
            const meta = LOG_META[e.type] || LOG_META.note
            return (
              <li key={e.id} className={`care-log-item care-log-${e.type}`}>
                <span className="care-log-icon"><meta.Icon size={14} /></span>
                <div className="grow">
                  <div className="care-log-text">{meta.text(e)}</div>
                  <small>{e.date ? format(parseISO(e.date), 'EEE d MMM yyyy') : ''}</small>
                  {e.photoId && photos[e.photoId] && <img className="care-log-photo" src={photos[e.photoId]} alt={e.text || 'Plant photo'} />}
                </div>
                {(e.type === 'note' || e.type === 'photo') && (
                  <button className="care-log-del" aria-label="Delete this entry" onClick={() => removeLogEntry(plant.id, e.id)}>
                    <X size={14} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {log.length > shown.length && (
        <button className="btn btn-secondary btn-sm" onClick={() => setShowAll(true)}>Show all {log.length}</button>
      )}
    </div>
  )
}

export function PlantDetailModal({ plant, onClose }) {
  const { state, icons, updatePlant, removePlant, markWatered, markMisted, markFertilized, saveIcon } = useStore()
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const cat = getCatalogPlant(plant.catalogId)
  if (!cat) return null

  const lat = state.settings.location?.lat
  const wLeft = waterDaysLeft(plant, lat)
  const mLeft = mistDaysLeft(plant)
  const fLeft = fertilizeDaysLeft(plant)
  const zone = state.plan.zones.find(z => z.id === plant.zoneId)
  const customIcon = icons[plant.id]
  const geminiKey = state.settings.geminiKey
  const name = plant.nickname || cat.name

  const lightMismatch = zone && zone.light !== cat.light

  const generateIcon = async () => {
    setGenerating(true)
    setGenError(null)
    try {
      const a = resolveAppearance(plant, cat)
      const dataUrl = await generatePlantIcon(geminiKey, {
        name: cat.name, details: cat.details,
        material: a.material, potColor: a.color, bloom: a.bloom,
      })
      await saveIcon(plant.id, dataUrl)
    } catch (e) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  // no confirm dialog: the toast offers Undo instead
  const remove = () => {
    removePlant(plant.id)
    onClose()
  }

  return (
    <Sheet onClose={onClose} label={name}>
      <div className="sheet-ident">
        <div className="plant-tile plant-tile-md">
          {customIcon ? <img src={customIcon} alt={cat.name} /> : <PlantIcon icon={cat.icon} />}
        </div>
        <div className="grow">
          <h2>{name}</h2>
          <div className="muted latin">{cat.latin}</div>
        </div>
      </div>

      <div className="card">
        <div>
          <CareRow
            icon={<Droplets size={18} />} left={wLeft}
            title={<>Water every <b>{waterIntervalDays(plant, lat)} days</b></>}
            action={{ icon: <WateringCan className="art-sm" />, due: 'Water now', idle: 'Log water' }}
            onLog={() => markWatered(plant.id)}
          />
          {cat.mist && (
            <CareRow
              icon={<SprayBottle className="art-md" />} left={mLeft}
              title={<>Mist every <b>{cat.mist} days</b></>}
              action={{ icon: <SprayBottle className="art-sm" />, due: 'Mist now', idle: 'Log mist' }}
              onLog={() => markMisted(plant.id)}
            />
          )}
          <CareRow
            icon={<Sparkles size={18} />} left={fLeft}
            title={<>Fertilize every <b>{cat.fertilize} days</b></>}
            action={{ icon: <Sparkles size={15} />, due: 'Feed now', idle: 'Log feed' }}
            onLog={() => markFertilized(plant.id)}
          />
          <div className="list-row">
            <div className="row-icon"><Sun size={18} /></div>
            <div className="grow">
              Ideal light: <b>{LIGHT_LABELS[cat.light]}</b>
              {zone && <small>Placed in “{zone.name}” ({LIGHT_LABELS[zone.light]}){lightMismatch ? ' — light mismatch!' : ''}</small>}
            </div>
          </div>
        </div>
      </div>

      <div className="field">
        <label>Where does it live? (outside plants can be watered by rain)</label>
        <div className="seg">
          <button className={!plant.isOutside ? 'is-active' : ''} onClick={() => updatePlant(plant.id, { isOutside: false })}>Inside</button>
          <button className={plant.isOutside ? 'is-active' : ''} onClick={() => updatePlant(plant.id, { isOutside: true })}>Outside</button>
        </div>
      </div>

      <ZonePicker
        plantLight={cat.light}
        zones={state.plan.zones}
        value={plant.zoneId}
        allowNone={false}
        onChange={id => {
          const z = state.plan.zones.find(zn => zn.id === id)
          if (!z) return
          updatePlant(plant.id, {
            zoneId: z.id,
            x: z.x + z.w * (0.15 + Math.random() * 0.7),
            y: z.y + z.h * (0.15 + Math.random() * 0.7),
            // a room marked indoor/outdoor decides where the plant lives
            ...(typeof z.outdoor === 'boolean' ? { isOutside: z.outdoor } : {}),
          })
        }}
      />

      <div className="field-row">
        <div className="field">
          <label>Nickname</label>
          <input
            value={plant.nickname || ''} placeholder={cat.name}
            onChange={e => updatePlant(plant.id, { nickname: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Last watered</label>
          <input
            type="date" value={plant.lastWatered || ''}
            max={formatISO(new Date(), { representation: 'date' })}
            onChange={e => updatePlant(plant.id, { lastWatered: e.target.value || null, rainDelay: false })}
          />
        </div>
      </div>

      <CareHistory plant={plant} />

      {(() => {
        const a = resolveAppearance(plant, cat)
        return (
          <>
            <div className="field-row">
              <div className="field">
                <label>Pot material</label>
                <select value={a.material.id} onChange={e => updatePlant(plant.id, { potMaterial: e.target.value })}>
                  {POT_MATERIALS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Pot colour</label>
                <select value={a.color.id} onChange={e => updatePlant(plant.id, { potColorId: e.target.value })}>
                  {POT_COLORS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Flower colour</label>
              <select value={a.bloom.id} onChange={e => updatePlant(plant.id, { bloomColor: e.target.value })}>
                {BLOOM_COLORS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
              <p className="field-note">
                These three decide how the icon is drawn — change them, then regenerate below.
              </p>
            </div>
          </>
        )
      })()}

      <div className="field">
        <label>Plant icon</label>
        {geminiKey ? (
          <button className="btn btn-soft btn-block" onClick={generateIcon} disabled={generating}>
            {generating ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}
            {generating ? 'Generating with Gemini…' : customIcon ? 'Regenerate icon with Gemini' : 'Generate stylized icon with Gemini'}
          </button>
        ) : (
          <p className="muted">
            Add a Gemini API key in the Account tab to generate a custom stylized 3D icon for this plant.
          </p>
        )}
        {genError && <p className="note-danger">{genError}</p>}
      </div>

      {(() => {
        const b = intervalBreakdown(plant, lat)
        const sens = resolveWindSensitivity(plant, cat)
        return (
          <details className="advanced">
            <summary><SlidersHorizontal size={15} /> Watering model — how {b.effective} days is worked out</summary>

            <div className="card card-note">
              <div className="muted note-body">
                Species interval <b>{b.base} days</b>
                {b.capApplied && (
                  <> · that figure assumes sheltered ground, so an outdoor pot at{' '}
                    <b>{WIND_SENSITIVITY[sens].label.toLowerCase()}</b> sensitivity is capped
                    at <b>{b.capped} days</b></>
                )}
                {!plant.isOutside && <> · indoors, so wind is never applied</>}
                {plant.isOutside && !b.wind.applies && <> · no wind data yet for this location</>}
                {plant.isOutside && b.wind.applies && (
                  <> · wind since last watering averaged <b>{Math.round(b.wind.avgKmh)} km/h</b>
                    {' '}({b.wind.tier.label}) × {WIND_SENSITIVITY[b.wind.sensitivity].label.toLowerCase()} sensitivity
                    {' '}→ <b>−{Math.round(b.wind.cut * 100)}%</b> → {b.modelled} days</>
                )}
                {b.override && <> · <b>your override of {b.override} days wins</b></>}
              </div>
            </div>

            {/* wind only ever applies outside, so indoors there's nothing to set */}
            {plant.isOutside && (
              <div className="field">
                <label><Wind size={12} /> Wind sensitivity {plant.windSensitivityOverride ? '(corrected by you)' : '(auto)'}</label>
                <div className="seg">
                  {Object.entries(WIND_SENSITIVITY).map(([key, lvl]) => (
                    <button
                      key={key}
                      className={sens === key ? 'is-active' : ''}
                      onClick={() => updatePlant(plant.id, { windSensitivityOverride: key })}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
                <p className="field-note">
                  {WIND_SENSITIVITY[sens].hint}.
                  {plant.windSensitivityOverride && (
                    <> <button type="button" className="link-brand link-btn"
                      onClick={() => updatePlant(plant.id, { windSensitivityOverride: null })}>
                      Use auto ({WIND_SENSITIVITY[resolveWindSensitivity({ ...plant, windSensitivityOverride: null }, cat)].label})
                    </button></>
                  )}
                </p>
              </div>
            )}

            <div className="field">
              <label>Watering interval override (days)</label>
              <div className="inline-actions">
                <input
                  type="number" min="1" max="120" inputMode="numeric"
                  placeholder={`auto — ${b.modelled} days`}
                  value={plant.intervalOverride || ''}
                  onChange={e => {
                    const v = e.target.value
                    updatePlant(plant.id, { intervalOverride: v === '' ? null : Math.max(1, Math.min(120, +v)) })
                  }}
                />
                {plant.intervalOverride > 0 && (
                  <button className="btn btn-secondary btn-sm" onClick={() => updatePlant(plant.id, { intervalOverride: null })}>
                    Auto
                  </button>
                )}
              </div>
              <p className="field-note">
                Your own observation of the plant beats the model — this wins over wind and sensitivity both.
              </p>
            </div>
          </details>
        )
      })()}

      <button className="btn btn-danger btn-block" onClick={remove}>
        <Trash2 size={16} /> Remove plant
      </button>
    </Sheet>
  )
}
