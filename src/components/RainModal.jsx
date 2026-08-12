import { CloudRain } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { getCatalogPlant } from '../lib/catalog.js'
import { FULL_RAIN_MM, RAIN_OUTCOME } from '../lib/schedule.js'

export function RainModal({ plant, onClose }) {
  const { weather, answerRain } = useStore()
  const cat = getCatalogPlant(plant.catalogId)
  const mm = weather?.yesterdayRainMm ?? 0
  const heavy = mm >= FULL_RAIN_MM

  const answer = outcome => {
    answerRain(plant.id, weather, outcome)
    onClose()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="center rain-head">
          <div className="row-icon icon-lead icon-lead-info">
            <CloudRain size={30} />
          </div>
          <h2 className="rain-title">It rained yesterday</h2>
          <p className="muted">
            {mm.toFixed(1)} mm fell in your area. Did <b>{plant.nickname || cat?.name}</b> get
            wet by the rain? (It may have been sheltered by eaves or foliage.)
          </p>
          <p className="field-note">
            {heavy
              ? 'Enough rain to soak a pot — but you know whether this one actually caught it.'
              : 'A light total on the forecast grid can still soak an exposed pot, or miss a sheltered one entirely.'}
          </p>
        </div>
        <div className="stack-actions rain-actions">
          <button className="btn btn-primary btn-block" onClick={() => answer(RAIN_OUTCOME.SOAKED)}>
            Yes — soaked the soil
          </button>
          <button className="btn btn-soft btn-block" onClick={() => answer(RAIN_OUTCOME.DAMP)}>
            Only a light sprinkle
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => answer(RAIN_OUTCOME.DRY)}>
            No, it stayed dry
          </button>
        </div>
        <p className="field-note center">
          “Soaked” logs a watering dated to the rain day, exactly like tapping the
          watering can. “Sprinkle” just pushes the next watering back one day.
        </p>
      </div>
    </div>
  )
}
