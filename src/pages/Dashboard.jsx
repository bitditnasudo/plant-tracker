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
      <div className="card weather-card weather-card-link" onClick={() => navigate('/account')}>
        <div className="wx-row">
          <MapPin size={22} />
          <div>
            <div className="wx-title">Set your location</div>
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
        <div className="wx-main">
          <div className="wx-temp">{Math.round(weather.temp)}°</div>
          <div className="wx-desc">{desc} · {loc.label}</div>
        </div>
        <div className="wx-hilo">
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

const dueLabel = left => left < 0 ? `${-left} day${left === -1 ? '' : 's'} overdue` : 'Due today'

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
  const { dueWater, dueMist, dueFeed, dueCombo, dueRain } = useMemo(() => {
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
    // Watering and feeding happen in the same trip to the sink, so a plant due
    // for both is listed once, under Combo, instead of in Water and Feed.
    // Logging one half drops it back into the tab for the other. Misting stays
    // its own chore.
    const feedLeft = new Map(feed.map(f => [f.plant.id, f.left]))
    const combo = water
      .filter(w => feedLeft.has(w.plant.id))
      .map(w => ({ ...w, left: Math.min(w.left, feedLeft.get(w.plant.id)) }))
    const inCombo = new Set(combo.map(c => c.plant.id))
    return {
      dueWater: water.filter(w => !inCombo.has(w.plant.id)).sort(byUrgency),
      dueMist: mist.sort(byUrgency),
      dueFeed: feed.filter(f => !inCombo.has(f.plant.id)).sort(byUrgency),
      dueCombo: combo.sort(byUrgency),
      dueRain: rain,
    }
  }, [state.plants, lat, weather])

  const notifTabs = useMemo(() => [
    { key: 'combo', label: 'Combo', items: dueCombo, Art: null,        log: null,           verb: 'combo' },
    { key: 'water', label: 'Water', items: dueWater, Art: WateringCan, log: markWatered,    verb: 'watering' },
    { key: 'mist',  label: 'Mist',  items: dueMist,  Art: SprayBottle, log: markMisted,     verb: 'misting' },
    { key: 'feed',  label: 'Feed',  items: dueFeed,  Art: null,        log: markFertilized, verb: 'feeding' },
    { key: 'rain',  label: 'Rain',  items: dueRain,  Art: null,        log: null,           verb: 'rain' },
  ], [dueCombo, dueWater, dueMist, dueFeed, dueRain, markWatered, markMisted, markFertilized])

  const totalDue = dueCombo.length + dueWater.length + dueMist.length + dueFeed.length + dueRain.length
  // Only chores with something waiting get a tab — five fixed tabs made the
  // strip too tight on a phone. If the open tab empties (its last plant was
  // just logged) the next non-empty one takes over.
  const liveTabs = notifTabs.filter(t => t.items.length > 0)
  const activeTab = liveTabs.find(t => t.key === notifTab) || liveTabs[0]

  const openNotifs = () => {
    setShowNotifs(v => {
      if (!v && liveTabs[0]) setNotifTab(liveTabs[0].key)
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
    <div className="main-content main-content-dashboard">
      {/* everything above the plant list stays pinned; only the cards scroll */}
      <div className="dash-top">
      <div className="header">
        <div className="avatar"><Avatar /></div>
        <div className="hello">
          <small>Welcome,</small>
          <b>{state.profile.name || 'Plant lover'}!</b>
        </div>
        <div className="popover-wrap" ref={bellRef}>
          <button
            className="icon-btn" aria-label="Notifications"
            aria-expanded={showNotifs}
            onClick={openNotifs}
          >
            <Bell size={19} />
            {totalDue > 0 && <span className="dot" />}
          </button>

          {showNotifs && (
            <div className="popover popover-notifs" role="dialog" aria-label="Today's tasks">
              <div className="notif-head">
                <b>Today</b>
                <span>{totalDue === 0 ? 'All caught up' : `${totalDue} task${totalDue === 1 ? '' : 's'}`}</span>
              </div>

              {!activeTab ? (
                <div className="notif-empty">Nothing due today — every plant is happy. 🌿</div>
              ) : (
                <>
                  {liveTabs.length > 1 && (
                    <div className="notif-tabs" role="tablist">
                      {liveTabs.map(t => (
                        <button
                          key={t.key} role="tab" aria-selected={t.key === activeTab.key}
                          className={t.key === activeTab.key ? 'is-active' : ''}
                          onClick={() => setNotifTab(t.key)}
                        >
                          {t.label}
                          <span className="cnt">{t.items.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {liveTabs.length === 1 && <div className="notif-single">{activeTab.label}</div>}

                  {activeTab.items.map(({ plant, cat, left }) => (
                    <div
                      key={plant.id} className={`notif-item notif-item-${activeTab.key}`}
                      onClick={() => {
                        setShowNotifs(false)
                        // rain rows ask the same question as the red bubble on the card
                        if (activeTab.key === 'rain') setRainPlant(plant)
                        else setDetailPlant(plant)
                      }}
                    >
                      <div className="grow">
                        <div className="n-name">{plant.nickname || cat?.name}</div>
                        <div className="n-sub">
                          {activeTab.key === 'rain'
                            ? `Did it get wet? ${weather ? `${weather.yesterdayRainMm.toFixed(1)} mm fell` : ''}`
                            : activeTab.key === 'combo' ? `Water + feed · ${left < 0 ? `${-left}d overdue` : 'today'}`
                            : dueLabel(left)}
                        </div>
                      </div>
                      {activeTab.key === 'combo' && (
                        <>
                          <button
                            className="n-log"
                            aria-label={`Log watering for ${plant.nickname || cat?.name}`}
                            title="Log watering"
                            onClick={e => { e.stopPropagation(); markWatered(plant.id) }}
                          >
                            <WateringCan />
                          </button>
                          <button
                            className="n-log n-log-feed"
                            aria-label={`Log feeding for ${plant.nickname || cat?.name}`}
                            title="Log feeding"
                            onClick={e => { e.stopPropagation(); markFertilized(plant.id) }}
                          >
                            <Sparkles />
                          </button>
                        </>
                      )}
                      {activeTab.log && (
                        <button
                          className={`n-log${activeTab.Art ? '' : ' n-log-feed'}`}
                          aria-label={`Log ${activeTab.verb} for ${plant.nickname || cat?.name}`}
                          title={`Log ${activeTab.verb}`}
                          onClick={e => { e.stopPropagation(); activeTab.log(plant.id) }}
                        >
                          {activeTab.Art ? <activeTab.Art /> : <Sparkles />}
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {sync.error && (
        <div className="card card-danger-note">Sync problem: {sync.error}</div>
      )}

      <WeatherCard />

      <div className="search-bar">
        <Search size={17} />
        <input placeholder="Search" value={query} onChange={e => setQuery(e.target.value)} />
      </div>

      <div className="section-head">
        <h2>My Plants</h2>
        <div className="section-head-aside">
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
      </div>

      {plants.length === 0 ? (
        <div className="empty">
          <Sprout className="big" />
          <h3>{query ? 'No plants match' : 'No plants yet'}</h3>
          <p>{query ? 'Try a different search.' : 'Tap the + button to add your first plant from the catalogue.'}</p>
        </div>
      ) : (
        <div className="card-grid">
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
