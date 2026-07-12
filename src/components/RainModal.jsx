import { CloudRain } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { getCatalogPlant } from '../lib/catalog.js'
import { FULL_RAIN_MM } from '../lib/schedule.js'

export function RainModal({ plant, onClose }) {
  const { weather, answerRain } = useStore()
  const cat = getCatalogPlant(plant.catalogId)
  const mm = weather?.yesterdayRainMm ?? 0
  const heavy = mm >= FULL_RAIN_MM

  const answer = gotWet => {
    answerRain(plant.id, weather, gotWet)
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
              ? 'That much rain counts as a full watering — the schedule will reset as if watered yesterday.'
              : 'Light rain isn’t a full watering — the next watering will just be pushed back one day.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-ghost btn-block" onClick={() => answer(false)}>No, it stayed dry</button>
          <button className="btn btn-primary btn-block" onClick={() => answer(true)}>Yes, it got wet</button>
        </div>
      </div>
    </div>
  )
}
