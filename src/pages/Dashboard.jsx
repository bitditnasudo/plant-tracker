import { useMemo, useState, useEffect, useRef } from 'react'
import { Search, Bell, CloudRain, Wind, Droplets, Thermometer, MapPin, Sun, Cloud, CloudSun, Snowflake, Zap, Sparkles } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { waterDaysLeft, fertilizeDaysLeft, RAIN_ASK_MM } from '../lib/schedule.js'
import { describeWeatherCode } from '../lib/weather.js'
import { getCatalogPlant } from '../lib/catalog.js'
import { PlantCard } from '../components/PlantCard.jsx'
import { RainModal } from '../components/RainModal.jsx'
import { PlantDetailModal } from '../components/PlantDetailModal.jsx'
import { Avatar, Sprout } from '../components/PlantIcons.jsx'
import { useNavigate } from 'react-router-dom'

const WX_ICONS = { sun: Sun, 'cloud-sun': CloudSun, cloud: Cloud, rain: CloudRain, snow: Snowflake, storm: Zap }

function WeatherCard() {
  const { state, weather, weatherError } = useStore()
  const navigate = useNavigate()
  const loc = state.settings.location

  if (!loc) {
    return (
      <div className="card weather-card" onClick={() => navigate('/account')} style={{ cursor: 'pointer' }}>
        <div className="wx-row">
          <MapPin size={22} />
          <div>
            <div style={{ fontWeight: 700 }}>Set your location</div>
            <div className="wx-desc">Enable weather and rain tracking in the Account tab</div>
          </div>
        </div>
      </div>
    )
  }
  if (weatherError) return <div className="card weather-card"><div className="wx-desc">Weather unavailable: {weatherError}</div></div>
  if (!weather) return <div className="card weather-card"><div className="wx-desc">Loading weather…</div></div>

  const [desc, iconKey] = describeWeatherCode(weather.code)
  const WxIcon = WX_ICONS[iconKey] || Cloud
  const rained = weather.yesterdayRainMm >= RAIN_ASK_MM

  return (
    <div className="card weather-card">
      <div className="wx-row">
        <WxIcon size={38} strokeWidth={1.6} />
        <div style={{ flex: 1 }}>
          <div className="wx-temp">{Math.round(weather.temp)}°</div>
          <div className="wx-desc">{desc} · {loc.label}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, opacity: .85 }}>
          H {Math.round(weather.tMax)}° · L {Math.round(weather.tMin)}°
        </div>
      </div>
      <div className="wx-stats">
        <span className="wx-stat"><Droplets size={13} /> {weather.humidity}%</span>
        <span className="wx-stat"><Wind size={13} /> {Math.round(weather.wind)} km/h</span>
        {weather.rainChanceToday !== null && <span className="wx-stat"><CloudRain size={13} /> {weather.rainChanceToday}% today</span>}
        <span className="wx-stat"><Thermometer size={13} /> feels {Math.round(weather.temp)}°</span>
      </div>
      {rained && (
        <div className="rain-note">
          <CloudRain size={16} />
          <span>It rained <b>{weather.yesterdayRainMm.toFixed(1)} mm</b> yesterday — outdoor plants with a red bubble need your confirmation.</span>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { state, weather, sync } = useStore()
  const [query, setQuery] = useState('')
  const [rainPlant, setRainPlant] = useState(null)
  const [detailPlant, setDetailPlant] = useState(null)
  const [showNotifs, setShowNotifs] = useState(false)
  const bellRef = useRef(null)
  const lat = state.settings.location?.lat

  // what's actually due today, straight from the schedule
  const { dueWater, dueFeed } = useMemo(() => {
    const water = []
    const feed = []
    for (const plant of state.plants) {
      const cat = getCatalogPlant(plant.catalogId)
      if (!cat) continue
      const w = waterDaysLeft(plant, lat)
      if (w <= 0) water.push({ plant, cat, left: w })
      const f = fertilizeDaysLeft(plant)
      if (f !== null && f <= 0) feed.push({ plant, cat, left: f })
    }
    const byUrgency = (a, b) => a.left - b.left
    return { dueWater: water.sort(byUrgency), dueFeed: feed.sort(byUrgency) }
  }, [state.plants, lat, weather])

  // dismiss the bubble on an outside tap or Escape
  useEffect(() => {
    if (!showNotifs) return
    const onDown = e => { if (bellRef.current && !bellRef.current.contains(e.target)) setShowNotifs(false) }
    const onKey = e => { if (e.key === 'Escape') setShowNotifs(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showNotifs])

  const plants = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...state.plants]
      .filter(p => {
        if (!q) return true
        const cat = getCatalogPlant(p.catalogId)
        return (p.nickname || '').toLowerCase().includes(q) ||
          (cat?.name || '').toLowerCase().includes(q) ||
          (cat?.latin || '').toLowerCase().includes(q)
      })
      .sort((a, b) => waterDaysLeft(a, lat) - waterDaysLeft(b, lat))
  }, [state.plants, query, lat, weather])

  // keep modal targets pointing at fresh plant objects
  const freshRain = rainPlant && state.plants.find(p => p.id === rainPlant.id)
  const freshDetail = detailPlant && state.plants.find(p => p.id === detailPlant.id)

  return (
    <div className="main-content">
      <div className="header">
        <div className="avatar"><Avatar /></div>
        <div className="hello">
          <small>Welcome,</small>
          <b>{state.profile.name || 'Plant lover'}!</b>
        </div>
        <div className="notif-wrap" ref={bellRef}>
          <button
            className="icon-btn" aria-label="Notifications"
            aria-expanded={showNotifs}
            onClick={() => setShowNotifs(v => !v)}
          >
            <Bell size={19} />
            {(dueWater.length > 0 || dueFeed.length > 0) && <span className="dot" />}
          </button>

          {showNotifs && (
            <div className="notif-bubble" role="dialog" aria-label="Today's tasks">
              {dueWater.length === 0 && dueFeed.length === 0 ? (
                <div className="notif-empty">
                  Nothing due today — every plant is happy. 🌿
                </div>
              ) : (
                <>
                  {dueWater.length > 0 && (
                    <>
                      <h4>Needs watering</h4>
                      {dueWater.map(({ plant, cat, left }) => (
                        <div
                          key={plant.id} className="notif-item water"
                          onClick={() => { setShowNotifs(false); setDetailPlant(plant) }}
                        >
                          <Droplets size={17} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="n-name">{plant.nickname || cat?.name}</div>
                            <div className="n-sub">
                              {left < 0 ? `${-left} day${left === -1 ? '' : 's'} overdue` : 'Due today'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {dueFeed.length > 0 && (
                    <>
                      <h4>Needs fertilizing</h4>
                      {dueFeed.map(({ plant, cat, left }) => (
                        <div
                          key={plant.id} className="notif-item feed"
                          onClick={() => { setShowNotifs(false); setDetailPlant(plant) }}
                        >
                          <Sparkles size={17} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="n-name">{plant.nickname || cat?.name}</div>
                            <div className="n-sub">
                              {left < 0 ? `${-left} day${left === -1 ? '' : 's'} overdue` : 'Due today'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="search-bar">
        <Search size={17} />
        <input placeholder="Search" value={query} onChange={e => setQuery(e.target.value)} />
      </div>

      {sync.error && (
        <div className="card" style={{ borderColor: 'var(--red)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>
          Sync problem: {sync.error}
        </div>
      )}

      <WeatherCard />

      <div className="section-head" style={{ marginTop: 18 }}>
        <h2>My Plants</h2>
        <span className="sub">{state.plants.length} total</span>
      </div>

      {plants.length === 0 ? (
        <div className="empty">
          <Sprout className="big" />
          <h3>{query ? 'No plants match' : 'No plants yet'}</h3>
          <p>{query ? 'Try a different search.' : 'Tap the + button to add your first plant from the catalogue.'}</p>
        </div>
      ) : (
        <div className="plant-grid">
          {plants.map(p => (
            <PlantCard key={p.id} plant={p} onOpen={setDetailPlant} onRain={setRainPlant} />
          ))}
        </div>
      )}

      {freshRain && <RainModal plant={freshRain} onClose={() => setRainPlant(null)} />}
      {freshDetail && <PlantDetailModal plant={freshDetail} onClose={() => setDetailPlant(null)} />}
    </div>
  )
}
