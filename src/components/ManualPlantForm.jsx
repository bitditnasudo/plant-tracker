import { useState } from 'react'
import { ChevronLeft, PencilLine } from 'lucide-react'
import { CATEGORIES, LIGHT_LABELS } from '../lib/catalog.js'
import { PlantIcon, ICON_KEYS } from './PlantIcons.jsx'

/* For plants that exist in no database — nursery hybrids, local cultivars,
 * anything the catalogues have never heard of. Produces the same entry shape
 * the bundled catalogue and Perenual imports use, so everything downstream
 * (wind model, rain rules, reminders, Gemini icons) treats it identically.
 */
const ICON_SUGGESTION = {
  flower: 'flowerBunch', cactus: 'cactus', succulent: 'succulent',
  herb: 'sprout', tree: 'tree', foliage: 'leafVine',
}

export function ManualPlantForm({ onCancel, onCreate }) {
  const [name, setName] = useState('')
  const [latin, setLatin] = useState('')
  const [category, setCategory] = useState('foliage')
  const [light, setLight] = useState('partial')
  const [summer, setSummer] = useState(7)
  const [winter, setWinter] = useState(null)   // null = follow the summer figure
  const [mist, setMist] = useState('')
  const [fertilize, setFertilize] = useState(30)
  const [outdoor, setOutdoor] = useState(false)
  const [icon, setIcon] = useState('leafVine')
  const [details, setDetails] = useState('')
  const [iconTouched, setIconTouched] = useState(false)

  const effWinter = winter ?? Math.min(60, Math.round(summer * 1.8))

  const pickCategory = c => {
    setCategory(c)
    if (!iconTouched) setIcon(ICON_SUGGESTION[c] || 'leafVine')
  }

  const create = () => onCreate({
    id: `custom-${crypto.randomUUID()}`,
    source: 'manual',
    name: name.trim(),
    latin: latin.trim(),
    category,
    light,
    waterSummer: Math.max(1, Math.round(summer)),
    waterWinter: Math.max(1, Math.round(effWinter)),
    mist: mist === '' ? null : Math.max(1, Math.round(+mist)),
    fertilize: Math.max(7, Math.round(fertilize || 30)),
    outdoor,
    icon,
    // feeds the Gemini icon prompt
    details: details.trim() || `characteristic ${name.trim() || 'plant'} foliage`,
    pot: 'terracotta pot',
    potColor: 'warm orange',
    windSensitivity: null, // derived from category + interval, overridable per plant
    isCustom: true,
  })

  return (
    <>
      <button className="chip" onClick={onCancel} style={{ marginBottom: 12 }}>
        <ChevronLeft size={14} /> Catalogue
      </button>
      <h2><PencilLine size={18} /> Add a plant yourself</h2>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
        For anything the catalogues don’t have. Only the name and how often you water it
        really matter — everything else has a sensible default you can change later.
      </p>

      <div className="field">
        <label>Name *</label>
        <input value={name} placeholder="e.g. Lantana 'Bandana Cherry'" onChange={e => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Scientific name (optional)</label>
        <input value={latin} placeholder="e.g. Lantana camara" onChange={e => setLatin(e.target.value)} />
      </div>

      <div className="field">
        <label>Type — sets the icon and the wind-sensitivity guess</label>
        <div className="plan-toolbar" style={{ marginBottom: 0 }}>
          {CATEGORIES.filter(([k]) => k !== 'all').map(([k, label]) => (
            <button key={k} className={`chip${category === k ? ' active' : ''}`} onClick={() => pickCategory(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Ideal light</label>
        <div className="seg">
          {['direct', 'partial', 'shade'].map(l => (
            <button key={l} className={light === l ? 'active' : ''} onClick={() => setLight(l)}>{LIGHT_LABELS[l]}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Water every … days *</label>
          <input type="number" min="1" max="120" inputMode="numeric" value={summer}
            onChange={e => setSummer(Math.max(1, Math.min(120, +e.target.value || 1)))} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>…in winter</label>
          <input type="number" min="1" max="120" inputMode="numeric"
            placeholder={String(effWinter)} value={winter ?? ''}
            onChange={e => setWinter(e.target.value === '' ? null : Math.max(1, Math.min(120, +e.target.value)))} />
        </div>
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: -6, marginBottom: 14 }}>
        Outdoor plants get this shortened automatically by wind and the container ceiling —
        enter the plant’s own needs, not what your balcony does to it.
      </p>

      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Mist every … days</label>
          <input type="number" min="1" max="60" inputMode="numeric" placeholder="never"
            value={mist} onChange={e => setMist(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Feed every … days</label>
          <input type="number" min="7" max="365" inputMode="numeric" value={fertilize}
            onChange={e => setFertilize(+e.target.value || 30)} />
        </div>
      </div>

      <div className="field">
        <label>Can it live outdoors?</label>
        <div className="seg">
          <button className={!outdoor ? 'active' : ''} onClick={() => setOutdoor(false)}>Indoors only</button>
          <button className={outdoor ? 'active' : ''} onClick={() => setOutdoor(true)}>Can go outside</button>
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          Only plants that can go outside get wind adjustment and rain confirmations.
        </p>
      </div>

      <div className="field">
        <label>Icon</label>
        <div className="catalog-grid">
          {ICON_KEYS.map(k => (
            <div key={k} className={`catalog-item${icon === k ? ' sel' : ''}`}
              onClick={() => { setIcon(k); setIconTouched(true) }}>
              <PlantIcon icon={k} />
            </div>
          ))}
        </div>
      </div>

      <div className="field">
        <label>What does it look like? (optional — improves the generated icon)</label>
        <input value={details} placeholder="e.g. clusters of small red and yellow flowers"
          onChange={e => setDetails(e.target.value)} />
      </div>

      <button className="btn btn-primary btn-block" disabled={!name.trim()} onClick={create}>
        Continue
      </button>
    </>
  )
}
