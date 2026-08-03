import { useMemo, useState, useEffect, useRef } from 'react'
import { Search, Bell, CloudRain, Wind, Droplets, Thermometer, MapPin, Sun, Cloud, CloudSun, Snowflake, Zap, Sparkles, ArrowDownAZ, ArrowDownZA } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { waterDaysLeft, mistDaysLeft, fertilizeDaysLeft, needsRainAnswer, RAIN_ASK_MM } from '../lib/schedule.js'
import { describeWeatherCode } from '../lib/weather.js'
import { getCatalogPlant } from '../lib/catalog.js'
import { PlantCard } from '../components/PlantCard.jsx'
import { RainModal } from '../components/RainModal.jsx'
import { PlantDetailModal } from '../components/PlantDetailModal.jsx'
import { Avatar, Sprout, WateringCan, SprayBottle } from '../components/PlantIcons.jsx'
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
        <WxIcon size={46} strokeWidth={1.6} />
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
  const { state, weather, sync, setSettings, markWatered, markMisted, markFertilized } = useStore()
  const [query, setQuery] = useState('')
  const [rainPlant, setRainPlant] = useState(null)
  const [detailPlant, setDetailPlant] = useState(null)
  const [showNotifs, setShowNotifs] = useState(false)
  const sortDesc = state.settings.plantSort === 'za'
  const [notifTab, setNotifTab] = useState('water')
  const bellRef = useRef(null)
  const lat = state.settings.location?.lat

  // what's actually due today, straight from the schedule
  const { dueWater, dueMist, dueFeed, dueRain } = useMemo(() => {
    const water = []
    const mist = []
    const feed = []
    const rain = []
    for (const plant of state.plants) {
      const cat = getCatalogPlant(plant.catalogId)
      if (!cat) continue
      const w = waterDaysLeft(plant, lat)
      if (w <= 0) water.push({ plant, cat, left: w })
      const m = mistDaysLeft(plant)
      if (m !== null && m <= 0) mist.push({ plant, cat, left: m })
      const f = fertilizeDaysLeft(plant)
      if (f !== null && f <= 0) feed.push({ plant, cat, left: f })
      if (needsRainAnswer(plant, weather)) rain.push({ plant, cat, left: 0 })
    }
    const byUrgency = (a, b) => a.left - b.left
    return {
      dueWater: water.sort(byUrgency),
      dueMist: mist.sort(byUrgency),
      dueFeed: feed.sort(byUrgency),
      dueRain: rain,
    }
  }, [state.plants, lat, weather])

  const notifTabs = useMemo(() => [
    { key: 'water', label: 'Water', empty: 'Nothing needs watering right now.',
      items: dueWater, Icon: Droplets, Art: WateringCan, log: markWatered, verb: 'watering' },
    { key: 'mist',  label: 'Mist',  empty: 'No plant is due for misting.',
      items: dueMist,  Icon: Droplets, Art: SprayBottle, log: markMisted, verb: 'misting' },
    { key: 'feed',  label: 'Feed',  empty: 'No fertilizing due.',
      items: dueFeed,  Icon: Sparkles, Art: null, log: markFertilized, verb: 'feeding' },
    { key: 'rain',  label: 'Rain',  empty: 'No rain to confirm — outdoor plants are up to date.',
      items: dueRain,  Icon: CloudRain, Art: null, log: null, verb: 'rain' },
  ], [dueWater, dueMist, dueFeed, dueRain, markWatered, markMisted, markFertilized])

  const totalDue = dueWater.length + dueMist.length + dueFeed.length + dueRain.length
  const activeTab = notifTabs.find(t => t.key === notifTab) || notifTabs[0]

  // open on whichever tab actually has something waiting
  const openNotifs = () => {
    setShowNotifs(v => {
      if (!v) setNotifTab((notifTabs.find(t => t.items.length > 0) || notifTabs[0]).key)
      return !v
    })
  }

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
      .sort((a, b) => {
        const an = a.nickname || getCatalogPlant(a.catalogId)?.name || ''
        const bn = b.nickname || getCatalogPlant(b.catalogId)?.name || ''
        // locale-aware so accents and numbers order the way a reader expects
        const cmp = an.localeCompare(bn, undefined, { sensitivity: 'base', numeric: true })
        return sortDesc ? -cmp : cmp
      })
  }, [state.plants, query, lat, weather, sortDesc])

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
            onClick={openNotifs}
          >
            <Bell size={19} />
            {totalDue > 0 && <span className="dot" />}
          </button>

          {showNotifs && (
            <div className="notif-bubble" role="dialog" aria-label="Today's tasks">
              <div className="notif-tabs" role="tablist">
                {notifTabs.map(t => (
                  <button
                    key={t.key} role="tab" aria-selected={t.key === activeTab.key}
                    className={t.key === activeTab.key ? 'active' : ''}
                    onClick={() => setNotifTab(t.key)}
                  >
                    {t.label}
                    {t.items.length > 0 && <span className="cnt">{t.items.length}</span>}
                  </button>
                ))}
              </div>

              {activeTab.items.length === 0 ? (
                <div className="notif-empty">
                  {totalDue === 0 ? 'Nothing due today — every plant is happy. 🌿' : activeTab.empty}
                </div>
              ) : activeTab.items.map(({ plant, cat, left }) => (
                <div
                  key={plant.id} className={`notif-item ${activeTab.key}`}
                  onClick={() => {
                    setShowNotifs(false)
                    // rain rows ask the same question as the red bubble on the card
                    if (activeTab.key === 'rain') setRainPlant(plant)
                    else setDetailPlant(plant)
                  }}
                >
                  <activeTab.Icon size={17} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="n-name">{plant.nickname || cat?.name}</div>
                    <div className="n-sub">
                      {activeTab.key === 'rain'
                        ? `Did it get wet? ${weather ? `${weather.yesterdayRainMm.toFixed(1)} mm fell` : ''}`
                        : left < 0 ? `${-left} day${left === -1 ? '' : 's'} overdue` : 'Due today'}
                    </div>
                  </div>
                  {activeTab.log && (
                    <button
                      className="n-log"
                      aria-label={`Log ${activeTab.verb} for ${plant.nickname || cat?.name}`}
                      title={`Log ${activeTab.verb}`}
                      onClick={e => { e.stopPropagation(); activeTab.log(plant.id) }}
                    >
                      {activeTab.Art ? <activeTab.Art /> : <Sparkles size={18} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {sync.error && (
        <div className="card" style={{ borderColor: 'var(--red)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>
          Sync problem: {sync.error}
        </div>
      )}

      <WeatherCard />

      <div className="search-bar">
        <Search size={17} />
        <input placeholder="Search" value={query} onChange={e => setQuery(e.target.value)} />
      </div>

      <div className="section-head" style={{ marginTop: 18 }}>
        <h2>My Plants</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="sub">{state.plants.length} total</span>
          <button
            className="chip"
            aria-label={sortDesc ? 'Sorted Z to A — tap for A to Z' : 'Sorted A to Z — tap for Z to A'}
            onClick={() => setSettings({ plantSort: sortDesc ? 'az' : 'za' })}
          >
            {sortDesc ? <ArrowDownZA size={14} /> : <ArrowDownAZ size={14} />}
            {sortDesc ? 'Z–A' : 'A–Z'}
          </button>
        </div>
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
