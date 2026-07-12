import { CloudRain } from 'lucide-react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { useStore } from '../lib/store.jsx'
import { getCatalogPlant } from '../lib/catalog.js'
import { waterDaysLeft, mistDaysLeft, fertilizeDaysLeft, daysLeftLabel, needsRainAnswer } from '../lib/schedule.js'
import { PlantIcon, WateringCan, SprayBottle } from './PlantIcons.jsx'

function agoLabel(iso) {
  if (!iso) return 'Never'
  const d = differenceInCalendarDays(new Date(), parseISO(iso))
  if (d <= 0) return 'Today'
  if (d === 1) return 'Yesterday'
  return `${d} days ago`
}

export function PlantCard({ plant, onOpen, onRain }) {
  const { state, weather, icons, markWatered, markMisted } = useStore()
  const cat = getCatalogPlant(plant.catalogId)
  if (!cat) return null
  const lat = state.settings.location?.lat
  const wLeft = waterDaysLeft(plant, lat)
  const mLeft = mistDaysLeft(plant)
  const fLeft = fertilizeDaysLeft(plant)
  const askRain = needsRainAnswer(plant, weather)
  const customIcon = icons[plant.id]

  return (
    <div className="card plant-card" onClick={() => onOpen(plant)}>
      <div style={{ position: 'relative' }}>
        <div className="plant-tile">
          {customIcon ? <img src={customIcon} alt={cat.name} /> : <PlantIcon icon={cat.icon} />}
        </div>
        {askRain && (
          <button
            className="rain-bubble"
            aria-label="Rain question"
            onClick={e => { e.stopPropagation(); onRain(plant) }}
          >
            <CloudRain size={14} />
          </button>
        )}
      </div>

      <div className="plant-info">
        <h3>{plant.nickname || cat.name}</h3>
        <div className="plant-meta"><b>Last Watered:</b> {agoLabel(plant.lastWatered)}</div>
        <div className="plant-meta">
          <b>Next Water:</b>{' '}
          <span className={wLeft <= 0 ? 'due-text' : ''}>{daysLeftLabel(wLeft)}</span>
        </div>
        {mLeft !== null && mLeft <= 0 && (
          <div className="plant-meta"><b>Needs Misting:</b> Today</div>
        )}
        {fLeft !== null && fLeft <= 0 && (
          <div className="plant-meta"><b>Fertilize:</b> <span className="due-text">Today</span></div>
        )}
        <div className="plant-actions">
          <button
            className="action-sq dark" title="Mark watered"
            onClick={e => { e.stopPropagation(); markWatered(plant.id) }}
          >
            <WateringCan />
          </button>
          {cat.mist && (
            <button
              className="action-sq mint" title="Mark misted"
              onClick={e => { e.stopPropagation(); markMisted(plant.id) }}
            >
              <SprayBottle />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
