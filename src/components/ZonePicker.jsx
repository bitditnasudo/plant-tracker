import { LIGHT_LABELS, lightMatch } from '../lib/catalog.js'

/* catalog.js speaks in outcomes (ideal / acceptable / not recommended) and
 * names them ok / soon / due, which was fine when the CSS was `.tag.ok`. The
 * kit's tags are semantic, so the translation happens here rather than in the
 * data — a light match is a status, and this is the only place it is rendered.
 */
const MATCH_TAG = { ok: 'tag-ok', soon: 'tag-warn', due: 'tag-danger' }

// Room list with light-suitability tags for a given plant.
export function ZonePicker({ plantLight, zones, value, onChange, allowNone = true }) {
  if (!zones?.length) return null
  return (
    <div className="field">
      <label>Room</label>
      <div className="zone-pick">
        {allowNone && (
          <button type="button" className={`zone-row${!value ? ' is-selected' : ''}`} onClick={() => onChange(null)}>
            <span className="zname">Decide later</span>
          </button>
        )}
        {zones.map(z => {
          const m = lightMatch(plantLight, z.light)
          return (
            <button type="button" key={z.id} className={`zone-row${value === z.id ? ' is-selected' : ''}`} onClick={() => onChange(z.id)}>
              <span className="zname">{z.name} <small>· {LIGHT_LABELS[z.light]}</small></span>
              <span className={`tag ${MATCH_TAG[m.cls]}`}>{m.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
