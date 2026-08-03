import { useState } from 'react'
import { formatISO } from 'date-fns'
import { Droplets, Sun, Sparkles, Trash2, Loader2, Wand2, Wind } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { getCatalogPlant, LIGHT_LABELS } from '../lib/catalog.js'
import {
  waterDaysLeft, mistDaysLeft, fertilizeDaysLeft, daysLeftLabel, waterIntervalDays,
  WIND_SENSITIVITY, resolveWindSensitivity, intervalBreakdown,
} from '../lib/schedule.js'
import { generatePlantIcon } from '../lib/gemini.js'
import { PlantIcon, WateringCan, SprayBottle } from './PlantIcons.jsx'
import { ZonePicker } from './ZonePicker.jsx'
import { POT_MATERIALS, POT_COLORS, BLOOM_COLORS, resolveAppearance } from '../lib/potOptions.js'

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
              <div className="grow">Water every <b>{waterIntervalDays(plant, lat)} days</b><small>Next: {daysLeftLabel(wLeft)}</small></div>
              {/* an action, not a status: urgent when due, quiet when it isn't */}
              <button
                className={`btn btn-sm ${wLeft <= 0 ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => markWatered(plant.id)}
              >
                <WateringCan style={{ width: 17, height: 17 }} />
                {wLeft <= 0 ? 'Water now' : 'Log water'}
              </button>
            </div>
            {cat.mist && (
              <div className="row">
                <div className="row-icon"><SprayBottle style={{ width: 20, height: 20 }} /></div>
                <div className="grow">Mist every <b>{cat.mist} days</b><small>Next: {daysLeftLabel(mLeft)}</small></div>
                <button
                  className={`btn btn-sm ${mLeft !== null && mLeft <= 0 ? 'btn-mint' : 'btn-ghost'}`}
                  onClick={() => markMisted(plant.id)}
                >
                  <SprayBottle style={{ width: 17, height: 17 }} />
                  {mLeft !== null && mLeft <= 0 ? 'Mist now' : 'Log mist'}
                </button>
              </div>
            )}
            <div className="row">
              <div className="row-icon"><Sparkles size={18} /></div>
              <div className="grow">Fertilize every <b>{cat.fertilize} days</b><small>Next: {daysLeftLabel(fLeft)}</small></div>
              <button
                className={`btn btn-sm ${fLeft !== null && fLeft <= 0 ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => markFertilized(plant.id)}
              >
                <Sparkles size={15} />
                {fLeft !== null && fLeft <= 0 ? 'Feed now' : 'Log feed'}
              </button>
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
              x: z.x + z.w * (0.15 + Math.random() * 0.7),
              y: z.y + z.h * (0.15 + Math.random() * 0.7),
            })
          }}
        />

        {(() => {
          const b = intervalBreakdown(plant, lat)
          const sens = resolveWindSensitivity(plant, cat)
          return (
            <>
              <div className="field">
                <label><Wind size={12} /> Wind sensitivity {plant.windSensitivityOverride ? '(corrected by you)' : '(auto)'}</label>
                <div className="seg">
                  {Object.entries(WIND_SENSITIVITY).map(([key, lvl]) => (
                    <button
                      key={key}
                      className={sens === key ? 'active' : ''}
                      onClick={() => updatePlant(plant.id, { windSensitivityOverride: key })}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  {WIND_SENSITIVITY[sens].hint}.
                  {plant.windSensitivityOverride && (
                    <> <a href="#" style={{ color: 'var(--olive)' }}
                      onClick={e => { e.preventDefault(); updatePlant(plant.id, { windSensitivityOverride: null }) }}>
                      Use auto ({WIND_SENSITIVITY[resolveWindSensitivity({ ...plant, windSensitivityOverride: null }, cat)].label})
                    </a></>
                  )}
                </p>
              </div>

              <div className="card" style={{ fontSize: 12.5, marginBottom: 14 }}>
                <b>How {b.effective} days was calculated</b>
                <div className="muted" style={{ marginTop: 4, lineHeight: 1.6 }}>
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

              <div className="field">
                <label>Watering interval override (days)</label>
                <div style={{ display: 'flex', gap: 8 }}>
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
                    <button className="btn btn-ghost btn-sm" onClick={() => updatePlant(plant.id, { intervalOverride: null })}>
                      Auto
                    </button>
                  )}
                </div>
                <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  Your own observation of the plant beats the model — this wins over wind and sensitivity both.
                </p>
              </div>
            </>
          )
        })()}

        {cat.outdoor && (
          <div className="field">
            <label>Where does it live? (outside plants can be watered by rain)</label>
            <div className="seg">
              <button className={!plant.isOutside ? 'active' : ''} onClick={() => updatePlant(plant.id, { isOutside: false })}>Inside</button>
              <button className={plant.isOutside ? 'active' : ''} onClick={() => updatePlant(plant.id, { isOutside: true })}>Outside</button>
            </div>
          </div>
        )}

        {(() => {
          const a = resolveAppearance(plant, cat)
          return (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Pot material</label>
                  <select value={a.material.id} onChange={e => updatePlant(plant.id, { potMaterial: e.target.value })}>
                    {POT_MATERIALS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
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
                <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  These three decide how the icon is drawn — change them, then regenerate below.
                </p>
              </div>
            </>
          )
        })()}

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
