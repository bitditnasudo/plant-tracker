import { CloudRain } from 'lucide-react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { useStore } from '../lib/store.jsx'
import { getCatalogPlant, LIGHT_LABELS, WATER_NEED_LABELS, waterNeedLevel } from '../lib/catalog.js'
import { waterDaysLeft, mistDaysLeft, fertilizeDaysLeft, daysLeftLabel, needsRainAnswer } from '../lib/schedule.js'
import { PlantIcon, WateringCan, SprayBottle, WaterNeedIcon, LightIcon } from './PlantIcons.jsx'

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
  const wNeed = waterNeedLevel(cat)
  const wNeedLabel = `${WATER_NEED_LABELS[wNeed]} — about every ${cat.waterSummer} days in summer`

  return (
    <div className="card plant-card" onClick={() => onOpen(plant)}>
      <div className="plant-card-main">
        <div className="plant-tile-wrap">
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

        <h3 className="plant-name">{plant.nickname || cat.name}</h3>

        {/* The species at a glance: how thirsty, and how much sun. */}
        <div className="plant-habits">
          <span className="care-badge care-badge-water" title={wNeedLabel} aria-label={wNeedLabel}>
            <WaterNeedIcon level={wNeed} />
          </span>
          <span
            className={`care-badge care-badge-light${cat.light === 'shade' ? ' care-badge-shade' : ''}`}
            title={LIGHT_LABELS[cat.light]} aria-label={LIGHT_LABELS[cat.light]}
          >
            <LightIcon level={cat.light} />
          </span>
        </div>

        <div className="plant-sched">
          <div className="plant-meta"><b>Last Watered:</b> <span>{agoLabel(plant.lastWatered)}</span></div>
          <div className="plant-meta">
            <b>Next Water:</b>{' '}
            <span className={wLeft <= 0 ? 'due-text' : ''}>{daysLeftLabel(wLeft)}</span>
          </div>
          {mLeft !== null && mLeft <= 0 && (
            <div className="plant-meta"><b>Needs Misting:</b> <span>Today</span></div>
          )}
          {fLeft !== null && fLeft <= 0 && (
            <div className="plant-meta"><b>Fertilize:</b> <span className="due-text">Today</span></div>
          )}
        </div>
      </div>

      {/* Welded to the right edge so every card's controls are in one place. */}
      <div className="plant-rail">
        <button
          className="action-sq action-sq-water" title="Mark watered"
          onClick={e => { e.stopPropagation(); markWatered(plant.id) }}
        >
          <WateringCan />
        </button>
        {cat.mist && (
          <button
            className="action-sq action-sq-mist" title="Mark misted"
            onClick={e => { e.stopPropagation(); markMisted(plant.id) }}
          >
            <SprayBottle />
          </button>
        )}
      </div>
    </div>
  )
}
