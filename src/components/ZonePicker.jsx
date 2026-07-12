import { LIGHT_LABELS, lightMatch } from '../lib/catalog.js'

// Room list with light-suitability tags for a given plant.
export function ZonePicker({ plantLight, zones, value, onChange, allowNone = true }) {
  if (!zones?.length) return null
  return (
    <div className="field">
      <label>Room</label>
      <div className="zone-pick">
        {allowNone && (
          <button type="button" className={`zone-row${!value ? ' sel' : ''}`} onClick={() => onChange(null)}>
            <span className="zname">Decide later</span>
          </button>
        )}
        {zones.map(z => {
          const m = lightMatch(plantLight, z.light)
          return (
            <button type="button" key={z.id} className={`zone-row${value === z.id ? ' sel' : ''}`} onClick={() => onChange(z.id)}>
              <span className="zname">{z.name} <small>· {LIGHT_LABELS[z.light]}</small></span>
              <span className={`tag ${m.cls}`}>{m.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
