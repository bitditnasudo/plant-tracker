import { useMemo, useState } from 'react'
import { Search, ChevronLeft, Droplets, Sun, Sparkles, Globe, Loader2, PencilLine } from 'lucide-react'
import { formatISO, subDays } from 'date-fns'
import { useStore } from '../lib/store.jsx'
import { CATALOG, CATEGORIES, LIGHT_LABELS } from '../lib/catalog.js'
import { searchPerenual, fetchPerenualEntry, FREE_TIER_MAX_ID } from '../lib/perenual.js'
import { PlantIcon } from './PlantIcons.jsx'
import { ZonePicker } from './ZonePicker.jsx'
import { POT_MATERIALS, POT_COLORS, BLOOM_COLORS, resolveAppearance } from '../lib/potOptions.js'
import { ManualPlantForm } from './ManualPlantForm.jsx'

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
  const [manual, setManual] = useState(false)
  const [nickname, setNickname] = useState('')
  const [potMaterial, setPotMaterial] = useState('terracotta')
  const [potColorId, setPotColorId] = useState('natural')
  const [bloomColor, setBloomColor] = useState('none')
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
    const a = resolveAppearance({}, cat)
    setPotMaterial(a.material.id)
    setPotColorId(a.color.id)
    setBloomColor(a.bloom.id)
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
        x: zone.x + zone.w * (0.15 + Math.random() * 0.7),
        y: zone.y + zone.h * (0.15 + Math.random() * 0.7),
      }
    }
    addPlant({
      id: crypto.randomUUID(),
      catalogId: selected.id,
      nickname: nickname.trim(),
      potMaterial, potColorId, bloomColor,
      isOutside: selected.outdoor ? isOutside : false,
      // auto-derived at import; null falls back to the catalogue rule at read time
      windSensitivity: selected.windSensitivity || null,
      windSensitivityOverride: null,
      intervalOverride: null,
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

        {manual ? (
          <ManualPlantForm
            onCancel={() => setManual(false)}
            onCreate={entry => { setManual(false); pick(entry) }}
          />
        ) : !selected ? (
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

            {/* last resort, and the only one that always works */}
            <button
              className={`btn btn-block ${results.length === 0 ? 'btn-primary' : 'btn-ghost'}`}
              style={{ marginTop: 14 }}
              onClick={() => setManual(true)}
            >
              <PencilLine size={16} />
              {results.length === 0 ? `Add “${query.trim() || 'a plant'}” yourself` : 'Not listed? Add it yourself'}
            </button>
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
                {selected.source === 'manual'
                  ? <span className="tag ok" style={{ marginTop: 4 }}>your own entry</span>
                  : selected.isCustom && <span className="tag info" style={{ marginTop: 4 }}>from online database</span>}
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
                <label>Pot material</label>
                <select value={potMaterial} onChange={e => setPotMaterial(e.target.value)}>
                  {POT_MATERIALS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Pot colour</label>
                <select value={potColorId} onChange={e => setPotColorId(e.target.value)}>
                  {POT_COLORS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Flower colour — used when generating the icon</label>
              <select value={bloomColor} onChange={e => setBloomColor(e.target.value)}>
                {BLOOM_COLORS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
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
