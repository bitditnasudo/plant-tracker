import { useMemo, useState } from 'react'
import { Search, ChevronLeft, Droplets, Sun, Sparkles, Globe, Loader2 } from 'lucide-react'
import { formatISO, subDays } from 'date-fns'
import { useStore } from '../lib/store.jsx'
import { CATALOG, CATEGORIES, LIGHT_LABELS } from '../lib/catalog.js'
import { searchPerenual, fetchPerenualEntry, FREE_TIER_MAX_ID } from '../lib/perenual.js'
import { PlantIcon } from './PlantIcons.jsx'
import { ZonePicker } from './ZonePicker.jsx'

const POT_TYPES = ['terracotta pot', 'ceramic pot', 'hanging pot', 'glass vase', 'shallow bonsai dish', 'grow bag', 'glass terrarium', 'ceramic bowl', 'small ceramic pot', 'clear orchid pot']
const POT_COLORS = ['warm orange', 'cream white', 'mint green', 'sage green', 'charcoal grey', 'sand beige', 'clear']
const LAST_WATERED = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: 1 },
  { label: '~A week', days: 5 },
  { label: 'Other…', days: 'other' }, // opens a date picker
]

export function AddPlantModal({ onClose }) {
  const { state, addPlant, addCustomCatalogEntry } = useStore()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [selected, setSelected] = useState(null)
  const [nickname, setNickname] = useState('')
  const [potType, setPotType] = useState(POT_TYPES[0])
  const [potColor, setPotColor] = useState(POT_COLORS[0])
  const [isOutside, setIsOutside] = useState(false)
  const [watered, setWatered] = useState(0)
  const [wateredDate, setWateredDate] = useState('') // used when watered === 'other'
  const [zoneId, setZoneId] = useState(null)

  // online search
  const [onlineResults, setOnlineResults] = useState(null)
  const [onlineBusy, setOnlineBusy] = useState(false)
  const [onlineError, setOnlineError] = useState(null)
  const [importingId, setImportingId] = useState(null)
  const perenualKey = state.settings.perenualKey

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CATALOG.filter(p =>
      (category === 'all' || p.category === category) &&
      (!q || p.name.toLowerCase().includes(q) || p.latin.toLowerCase().includes(q)),
    )
  }, [query, category])

  const pick = cat => {
    setSelected(cat)
    setPotType(POT_TYPES.includes(cat.pot) ? cat.pot : POT_TYPES[0])
    setPotColor(POT_COLORS.includes(cat.potColor) ? cat.potColor : POT_COLORS[0])
    setIsOutside(false)
    setZoneId(null)
  }

  const searchOnline = async () => {
    setOnlineBusy(true)
    setOnlineError(null)
    setOnlineResults(null)
    try {
      const found = await searchPerenual(perenualKey, query.trim())
      setOnlineResults(found)
      if (found.length === 0) setOnlineError(`The online database has no match for “${query.trim()}”.`)
    } catch (e) {
      setOnlineError(e.message)
    } finally {
      setOnlineBusy(false)
    }
  }

  const importOnline = async r => {
    setImportingId(r.perenualId)
    setOnlineError(null)
    try {
      const entry = await fetchPerenualEntry(perenualKey, r)
      pick({ ...entry, isCustom: true })
    } catch (e) {
      setOnlineError(e.message)
    } finally {
      setImportingId(null)
    }
  }

  const save = () => {
    if (selected.isCustom) {
      const { isCustom, estimated, ...entry } = selected
      addCustomCatalogEntry(entry)
    }
    const lastWatered = watered === 'other'
      ? wateredDate || null // null = "never" -> due immediately
      : formatISO(subDays(new Date(), watered), { representation: 'date' })
    // picking a room drops the plant inside that zone on the plan (nudge it later)
    let placement = { x: null, y: null, zoneId: null }
    const zone = zoneId && state.plan.zones.find(z => z.id === zoneId)
    if (zone) {
      placement = {
        zoneId: zone.id,
        x: zone.x + zone.w * (0.3 + Math.random() * 0.4),
        y: zone.y + zone.h * (0.3 + Math.random() * 0.4),
      }
    }
    addPlant({
      id: crypto.randomUUID(),
      catalogId: selected.id,
      nickname: nickname.trim(),
      potType, potColor,
      isOutside: selected.outdoor ? isOutside : false,
      ...placement,
      lastWatered,
      lastMisted: lastWatered,
      lastFertilized: formatISO(new Date(), { representation: 'date' }),
      rainAnsweredFor: null, rainDelay: false,
    })
    onClose()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        {!selected ? (
          <>
            <h2>Add a plant</h2>
            <div className="search-bar" style={{ marginBottom: 10 }}>
              <Search size={17} />
              <input
                placeholder="Search the catalogue…" value={query}
                onChange={e => { setQuery(e.target.value); setOnlineResults(null); setOnlineError(null) }}
              />
            </div>
            <div className="plan-toolbar" style={{ marginBottom: 12 }}>
              {CATEGORIES.map(([id, label]) => (
                <button key={id} className={`chip${category === id ? ' active' : ''}`} onClick={() => setCategory(id)}>{label}</button>
              ))}
            </div>

            <div className="catalog-grid">
              {results.map(cat => (
                <div key={cat.id} className="catalog-item" onClick={() => pick(cat)}>
                  <PlantIcon icon={cat.icon} />
                  <div className="cname">{cat.name}</div>
                  <div className="clatin">{cat.latin}</div>
                </div>
              ))}
            </div>
            {results.length === 0 && !onlineResults && (
              <p className="muted center" style={{ padding: '14px 0 6px' }}>Nothing in the built-in catalogue matches “{query}”.</p>
            )}

            {/* online search (Perenual) */}
            {query.trim().length >= 3 && (
              perenualKey ? (
                <div style={{ marginTop: 14 }}>
                  <button className="btn btn-mint btn-block" onClick={searchOnline} disabled={onlineBusy}>
                    {onlineBusy ? <Loader2 size={16} className="spin" /> : <Globe size={16} />}
                    {onlineBusy ? 'Searching 10,000+ species…' : `Search online for “${query.trim()}”`}
                  </button>
                  {onlineResults?.length > 0 && (
                    <div className="card row-list" style={{ marginTop: 10 }}>
                      {onlineResults.slice(0, 8).map(r => (
                        <div key={r.perenualId} className="row" style={{ cursor: 'pointer' }} onClick={() => !importingId && importOnline(r)}>
                          <div className="row-icon"><Globe size={16} /></div>
                          <div className="grow">
                            {r.name} {r.perenualId > FREE_TIER_MAX_ID && <span className="tag soon">care data estimated</span>}
                            <small style={{ fontStyle: 'italic' }}>{r.latin}</small>
                          </div>
                          {importingId === r.perenualId ? <Loader2 size={16} className="spin" /> : <ChevronLeft size={16} style={{ rotate: '180deg', color: 'var(--muted2)' }} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="muted center" style={{ marginTop: 12, fontSize: 12.5 }}>
                  Can’t find it? Add a free <b>Perenual API key</b> in the Account tab to search 10,000+ more species online.
                </p>
              )
            )}
            {onlineError && <p className="center" style={{ color: 'var(--red)', marginTop: 10, fontSize: 12.5 }}>{onlineError}</p>}
          </>
        ) : (
          <>
            <button className="chip" onClick={() => setSelected(null)} style={{ marginBottom: 12 }}>
              <ChevronLeft size={14} /> Catalogue
            </button>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
              <div className="plant-tile" style={{ width: 74, height: 74 }}><PlantIcon icon={selected.icon} /></div>
              <div>
                <h2 style={{ marginBottom: 0 }}>{selected.name}</h2>
                <div className="muted" style={{ fontStyle: 'italic' }}>{selected.latin}</div>
                {selected.isCustom && <span className="tag info" style={{ marginTop: 4 }}>from online database</span>}
              </div>
            </div>

            <div className="card" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
              <span><Droplets size={13} /> every {selected.waterSummer}d (summer) / {selected.waterWinter}d (winter)</span>
              <span><Sun size={13} /> {LIGHT_LABELS[selected.light]}</span>
              <span><Sparkles size={13} /> feed every {selected.fertilize}d</span>
            </div>

            {selected.estimated && (
              <>
                <p className="muted" style={{ fontSize: 12.5, margin: '2px 2px 10px' }}>
                  This species’ care data needs a paid Perenual plan, so these are <b>estimates</b> — adjust them if you know better:
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Days between waterings (summer)</label>
                    <input
                      type="number" min="1" max="60" value={selected.waterSummer}
                      onChange={e => {
                        const v = Math.max(1, Math.min(60, +e.target.value || 7))
                        setSelected(s => ({ ...s, waterSummer: v, waterWinter: Math.min(60, Math.round(v * 1.8)) }))
                      }}
                    />
                  </div>
                  <div className="field" style={{ flex: 1.4 }}>
                    <label>Ideal light</label>
                    <div className="seg">
                      {['direct', 'partial', 'shade'].map(l => (
                        <button key={l} className={selected.light === l ? 'active' : ''} onClick={() => setSelected(s => ({ ...s, light: l }))}>{LIGHT_LABELS[l].split(' ')[0]}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="field">
              <label>Nickname (optional)</label>
              <input value={nickname} placeholder={selected.name} onChange={e => setNickname(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Pot</label>
                <select value={potType} onChange={e => setPotType(e.target.value)}>
                  {POT_TYPES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Pot color</label>
                <select value={potColor} onChange={e => setPotColor(e.target.value)}>
                  {POT_COLORS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {selected.outdoor && (
              <div className="field">
                <label>Where does it live?</label>
                <div className="seg">
                  <button className={!isOutside ? 'active' : ''} onClick={() => setIsOutside(false)}>Inside</button>
                  <button className={isOutside ? 'active' : ''} onClick={() => setIsOutside(true)}>Outside</button>
                </div>
              </div>
            )}
            <ZonePicker
              plantLight={selected.light}
              zones={state.plan.zones}
              value={zoneId}
              onChange={setZoneId}
            />

            <div className="field">
              <label>Last watered</label>
              <div className="seg">
                {LAST_WATERED.map(o => (
                  <button key={o.label} className={watered === o.days ? 'active' : ''} onClick={() => setWatered(o.days)}>{o.label}</button>
                ))}
              </div>
              {watered === 'other' && (
                <input
                  type="date" style={{ marginTop: 8 }}
                  max={formatISO(new Date(), { representation: 'date' })}
                  value={wateredDate}
                  onChange={e => setWateredDate(e.target.value)}
                />
              )}
              {selected.outdoor && (
                <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  If it rained since then and this plant lives outside, the dashboard will ask whether it got wet and adjust the schedule.
                </p>
              )}
            </div>

            <button className="btn btn-primary btn-block" onClick={save} disabled={watered === 'other' && !wateredDate}>Add plant</button>
            <p className="muted center" style={{ fontSize: 12, marginTop: 10 }}>
              You can place it on your floor plan from the Plan tab.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
