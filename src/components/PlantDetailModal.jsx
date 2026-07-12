import { useState } from 'react'
import { formatISO } from 'date-fns'
import { Droplets, Sun, Sparkles, Trash2, Loader2, Wand2 } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { getCatalogPlant, LIGHT_LABELS } from '../lib/catalog.js'
import { waterDaysLeft, mistDaysLeft, fertilizeDaysLeft, daysLeftLabel, waterIntervalDays } from '../lib/schedule.js'
import { generatePlantIcon } from '../lib/gemini.js'
import { PlantIcon } from './PlantIcons.jsx'
import { ZonePicker } from './ZonePicker.jsx'

export function PlantDetailModal({ plant, onClose }) {
  const { state, icons, updatePlant, removePlant, markWatered, markMisted, markFertilized, saveIcon } = useStore()
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const cat = getCatalogPlant(plant.catalogId)
  if (!cat) return null

  const lat = state.settings.location?.lat
  const zone = state.plan.zones.find(z => z.id === plant.zoneId)
  const customIcon = icons[plant.id]
  const geminiKey = state.settings.geminiKey

  const lightMismatch = zone && zone.light !== cat.light

  const generateIcon = async () => {
    setGenerating(true)
    setGenError(null)
    try {
      const dataUrl = await generatePlantIcon(geminiKey, {
        name: cat.name, details: cat.details, pot: plant.potType || cat.pot, potColor: plant.potColor || cat.potColor,
      })
      await saveIcon(plant.id, dataUrl)
    } catch (e) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const remove = () => {
    if (confirm(`Remove ${plant.nickname || cat.name}?`)) {
      removePlant(plant.id)
      onClose()
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          <div className="plant-tile" style={{ width: 74, height: 74 }}>
            {customIcon ? <img src={customIcon} alt={cat.name} /> : <PlantIcon icon={cat.icon} />}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ marginBottom: 0 }}>{plant.nickname || cat.name}</h2>
            <div className="muted" style={{ fontStyle: 'italic' }}>{cat.latin}</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row-list">
            <div className="row">
              <div className="row-icon"><Droplets size={18} /></div>
              <div className="grow">Water every <b>{waterIntervalDays(plant, lat)} days</b><small>Next: {daysLeftLabel(waterDaysLeft(plant, lat))}</small></div>
              <button className="btn btn-primary btn-sm" onClick={() => markWatered(plant.id)}>Watered</button>
            </div>
            {cat.mist && (
              <div className="row">
                <div className="row-icon"><Droplets size={18} /></div>
                <div className="grow">Mist every <b>{cat.mist} days</b><small>Next: {daysLeftLabel(mistDaysLeft(plant))}</small></div>
                <button className="btn btn-mint btn-sm" onClick={() => markMisted(plant.id)}>Misted</button>
              </div>
            )}
            <div className="row">
              <div className="row-icon"><Sparkles size={18} /></div>
              <div className="grow">Fertilize every <b>{cat.fertilize} days</b><small>Next: {daysLeftLabel(fertilizeDaysLeft(plant))}</small></div>
              <button className="btn btn-ghost btn-sm" onClick={() => markFertilized(plant.id)}>Done</button>
            </div>
            <div className="row">
              <div className="row-icon"><Sun size={18} /></div>
              <div className="grow">
                Ideal light: <b>{LIGHT_LABELS[cat.light]}</b>
                {zone && <small>Placed in “{zone.name}” ({LIGHT_LABELS[zone.light]}){lightMismatch ? ' — light mismatch!' : ''}</small>}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Nickname</label>
            <input
              value={plant.nickname || ''} placeholder={cat.name}
              onChange={e => updatePlant(plant.id, { nickname: e.target.value })}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Last watered</label>
            <input
              type="date" value={plant.lastWatered || ''}
              max={formatISO(new Date(), { representation: 'date' })}
              onChange={e => updatePlant(plant.id, { lastWatered: e.target.value || null, rainDelay: false })}
            />
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
              x: z.x + z.w * (0.3 + Math.random() * 0.4),
              y: z.y + z.h * (0.3 + Math.random() * 0.4),
            })
          }}
        />

        {cat.outdoor && (
          <div className="field">
            <label>Where does it live? (outside plants can be watered by rain)</label>
            <div className="seg">
              <button className={!plant.isOutside ? 'active' : ''} onClick={() => updatePlant(plant.id, { isOutside: false })}>Inside</button>
              <button className={plant.isOutside ? 'active' : ''} onClick={() => updatePlant(plant.id, { isOutside: true })}>Outside</button>
            </div>
          </div>
        )}

        <div className="field">
          <label>Plant icon</label>
          {geminiKey ? (
            <button className="btn btn-mint btn-block" onClick={generateIcon} disabled={generating}>
              {generating ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}
              {generating ? 'Generating with Gemini…' : customIcon ? 'Regenerate icon with Gemini' : 'Generate stylized icon with Gemini'}
            </button>
          ) : (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Add a Gemini API key in the Account tab to generate a custom stylized 3D icon for this plant.
            </p>
          )}
          {genError && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 6 }}>{genError}</p>}
        </div>

        <button className="btn btn-danger btn-block" onClick={remove}>
          <Trash2 size={16} /> Remove plant
        </button>
      </div>
    </div>
  )
}
