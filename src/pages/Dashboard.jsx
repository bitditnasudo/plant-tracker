import { useMemo, useState } from 'react'
import { Search, Bell, CloudRain, Wind, Droplets, Thermometer, MapPin, Sun, Cloud, CloudSun, Snowflake, Zap } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { waterDaysLeft, RAIN_ASK_MM } from '../lib/schedule.js'
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
  const lat = state.settings.location?.lat

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
        <button className="icon-btn" aria-label="Notifications">
          <Bell size={19} />
          {plants.some(p => waterDaysLeft(p, lat) <= 0) && <span className="dot" />}
        </button>
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
