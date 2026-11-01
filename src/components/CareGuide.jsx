import { Droplets, Wind, Sparkles, Waves } from 'lucide-react'
import {
  SOIL_CHECK, WIND_TIERS, WIND_SENSITIVITY, MAX_WIND_CUT, OUTDOOR_POT_CAP_DAYS, LEARN,
} from '../lib/schedule.js'
import { SOURCES, FEED_RULES, FLUSH } from '../lib/feeding.js'

const pct = x => `${Math.round(x * 100)}%`

function Sources({ list }) {
  return (
    <p className="field-note feed-why">
      {list.map((s, i) => (
        <span key={s.url}>{i ? ' · ' : 'Sources: '}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
      ))}
    </p>
  )
}

// What the app does to arrive at each care interval — one place for it, so the
// plant sheet can show just the numbers.
export function CareGuide() {
  const feedSources = [...new Set(Object.values(FEED_RULES).flatMap(r => r.sources))].map(k => SOURCES[k])
  return (
    <>
      <details className="advanced">
        <summary><Droplets size={15} /> Watering</summary>
        <p className="field-note">{SOIL_CHECK.how}</p>
        <ol className="field-note guide-steps">
          <li>Each species has a short interval for the most drying weather and a long one for the least.
            The past week’s evaporation at your location sets where in that range today falls
            (this month’s usual evaporation stands in when there’s no recent weather).</li>
          <li>Those figures assume sheltered ground, so outdoor pots are capped at {OUTDOOR_POT_CAP_DAYS.high} days
            (high wind sensitivity) or {OUTDOOR_POT_CAP_DAYS.normal} (normal). Drought-adapted plants aren’t capped.</li>
          <li>Outdoors only, wind shortens it further — see Wind below.</li>
          <li>Soil checks teach it: water early because it was already dry and the next interval gets shorter;
            find it still damp and it gets longer. Each watering moves it part of the way, never past
            {' '}{LEARN.min}× or {LEARN.max}× the model.</li>
          <li>An interval you type on the plant beats all of the above.</li>
        </ol>
        <Sources list={SOIL_CHECK.sources} />
      </details>

      <details className="advanced">
        <summary><Wind size={15} /> Wind</summary>
        <p className="field-note">
          Outdoor plants only — evaporation is measured outdoors, and indoor pots never feel the wind.
          The app averages each day’s peak wind since the last watering:
        </p>
        <ul className="field-note guide-steps">
          {WIND_TIERS.map((t, i) => (
            <li key={t.id}>
              <b>{t.label}</b> ({i === 0 ? `under ${t.belowKmh}` : t.belowKmh === Infinity ? `over ${WIND_TIERS[i - 1].belowKmh}` : `${WIND_TIERS[i - 1].belowKmh}–${t.belowKmh}`} km/h)
              {' '}— {t.cut ? `${pct(t.cut)} shorter` : 'no change'}
            </li>
          ))}
        </ul>
        <p className="field-note">
          That cut is scaled by the plant’s wind sensitivity —{' '}
          {Object.values(WIND_SENSITIVITY).map((s, i) => (
            <span key={s.label}>{i ? ', ' : ''}<b>{s.label.toLowerCase()}</b> ×{s.factor} ({s.hint})</span>
          ))}
          {' '}— and never goes past {pct(MAX_WIND_CUT)}. Sensitivity is set automatically per species;
          you can correct it on an outdoor plant’s watering settings.
        </p>
      </details>

      <details className="advanced">
        <summary><Sparkles size={15} /> Feeding</summary>
        <p className="field-note">
          Each plant falls into a group with its own interval from extension-service guidance. Feeding
          follows the growing season; where winters are mild the app feeds half as often instead of
          stopping, and in the tropics it keeps the same rate all year — those adjustments are the app’s,
          not the sources’.
        </p>
        <ul className="field-note guide-steps">
          {Object.values(FEED_RULES).map(r => (
            <li key={r.label}><b>{r.label}</b> — every {r.days} days, {r.dose}</li>
          ))}
        </ul>
        <Sources list={feedSources} />
      </details>

      <details className="advanced">
        <summary><Waves size={15} /> Flushing</summary>
        <p className="field-note">
          {FLUSH.why} Every {FLUSH.days} days ({FLUSH.orchidDays} for orchids); cacti and succulents
          wait out the cold months.
        </p>
        <Sources list={[...FLUSH.sources, ...FLUSH.orchidSources].map(k => SOURCES[k])} />
      </details>
    </>
  )
}
