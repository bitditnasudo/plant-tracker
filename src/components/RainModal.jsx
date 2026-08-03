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
        <div className="center" style={{ marginBottom: 8 }}>
          <div className="row-icon" style={{ width: 56, height: 56, margin: '0 auto 10px', background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <CloudRain size={30} />
          </div>
          <h2 style={{ marginBottom: 4 }}>It rained yesterday</h2>
          <p className="muted">
            {mm.toFixed(1)} mm fell in your area. Did <b>{plant.nickname || cat?.name}</b> get
            wet by the rain? (It may have been sheltered by eaves or foliage.)
          </p>
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            {heavy
              ? 'Enough rain to soak a pot — but you know whether this one actually caught it.'
              : 'A light total on the forecast grid can still soak an exposed pot, or miss a sheltered one entirely.'}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary btn-block" onClick={() => answer(RAIN_OUTCOME.SOAKED)}>
            Yes — soaked the soil
          </button>
          <button className="btn btn-mint btn-block" onClick={() => answer(RAIN_OUTCOME.DAMP)}>
            Only a light sprinkle
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => answer(RAIN_OUTCOME.DRY)}>
            No, it stayed dry
          </button>
        </div>
        <p className="muted center" style={{ fontSize: 11.5, marginTop: 10 }}>
          “Soaked” logs a watering dated to the rain day, exactly like tapping the
          watering can. “Sprinkle” just pushes the next watering back one day.
        </p>
      </div>
    </div>
  )
}
