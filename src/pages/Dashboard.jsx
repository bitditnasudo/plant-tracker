import { useMemo, useState, useEffect, useRef } from 'react'
import { Search, Bell, CloudRain, Wind, Droplets, Thermometer, MapPin, Sun, Cloud, CloudSun, Snowflake, Zap, Sparkles, Check, ArrowDownAZ, ArrowDownZA, AlarmClock, Plane, Plus } from 'lucide-react'
import { differenceInCalendarDays, format, parseISO, formatISO } from 'date-fns'
import { useStore, WEATHER_STALE_MS } from '../lib/store.jsx'
import { waterDaysLeft, mistDaysLeft, fertilizeDaysLeft, needsRainAnswer, pendingRain, rainWhen } from '../lib/schedule.js'
import { describeWeatherCode } from '../lib/weather.js'
import { getCatalogPlant } from '../lib/catalog.js'
import { PlantCard } from '../components/PlantCard.jsx'
import { RainModal } from '../components/RainModal.jsx'
import { PlantDetailModal } from '../components/PlantDetailModal.jsx'
import { Avatar, Sprout, WateringCan, SprayBottle } from '../components/PlantIcons.jsx'
import { useNavigate } from 'react-router-dom'

const WX_ICONS = { sun: Sun, 'cloud-sun': CloudSun, cloud: Cloud, rain: CloudRain, snow: Snowflake, storm: Zap }

const timeLabel = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function WeatherCard({ rainCount }) {
  const { state, weather, weatherError } = useStore()
  const navigate = useNavigate()
  const loc = state.settings.location

  if (!loc) {
    return (
      <button type="button" className="card weather-card weather-card-link" onClick={() => navigate('/account')}>
        <div className="wx-row">
          <MapPin size={22} />
          <div>
            <div className="wx-title">Set your location</div>
            <div className="wx-desc">Enable weather and rain tracking in the Account tab</div>
          </div>
        </div>
      </button>
    )
  }
  if (!weather) {
    // a skeleton at the card's final height, so nothing below jumps when it loads
    return (
      <div className="card weather-card weather-card-loading" aria-busy="true">
        {weatherError
          ? <div className="wx-desc">Weather unavailable: {weatherError}</div>
          : <><div className="skel skel-lg" /><div className="skel" /><span className="sr-only">Loading weather…</span></>}
      </div>
    )
  }

  const [desc, iconKey] = describeWeatherCode(weather.code)
  const WxIcon = WX_ICONS[iconKey] || Cloud
  const stale = Date.now() - weather.fetchedAt > WEATHER_STALE_MS

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
        {weather.feelsLike !== null && weather.feelsLike !== undefined && (
          <span className="wx-stat"><Thermometer size={13} /> feels {Math.round(weather.feelsLike)}°</span>
        )}
      </div>
      {(weatherError || stale) && (
        <div className="wx-stale">
          {weatherError ? 'Couldn’t refresh' : 'Not refreshed lately'} — showing weather from {timeLabel(weather.fetchedAt)}
        </div>
      )}
      {rainCount > 0 && (
        <div className="rain-note">
          <CloudRain size={16} />
          <span>
            {weather.yesterdayRainMm >= 1 && <>It rained <b>{weather.yesterdayRainMm.toFixed(1)} mm</b> yesterday. </>}
            {rainCount === 1 ? 'One outdoor plant has' : `${rainCount} outdoor plants have`} a rain question — tap the red bubble.
          </span>
        </div>
      )}
    </div>
  )
}

// While a trip is planned: what will come due while you're away, so it can be
// watered before leaving. While away: a quiet reminder of when you're back.
function TripBanner({ lat }) {
  const { state, setSettings, logCare } = useStore()
  const trip = state.settings.trip
  const today = formatISO(new Date(), { representation: 'date' })
  const over = trip && trip.to < today

  useEffect(() => {
    if (over) setSettings({ trip: null })
  }, [over, setSettings])

  if (!trip || over) return null
  const away = trip.from <= today
  const daysToReturn = differenceInCalendarDays(parseISO(trip.to), new Date())
  const fmt = d => format(parseISO(d), 'EEE d MMM')

  if (away) {
    return (
      <div className="card trip-card">
        <Plane size={18} />
        <div className="grow">Away until <b>{fmt(trip.to)}</b> — schedules carry on; anything due shows when you’re back.</div>
      </div>
    )
  }

  const dueWhileAway = state.plants.filter(p => getCatalogPlant(p.catalogId) && waterDaysLeft(p, lat) <= daysToReturn)
  return (
    <div className="card trip-card">
      <Plane size={18} />
      <div className="grow">
        Trip <b>{fmt(trip.from)} – {fmt(trip.to)}</b>:{' '}
        {dueWhileAway.length === 0
          ? 'nothing comes due while you’re away.'
          : <>{dueWhileAway.length} plant{dueWhileAway.length === 1 ? '' : 's'} will need water before you’re back —{' '}
            {dueWhileAway.map(p => p.nickname || getCatalogPlant(p.catalogId)?.name).join(', ')}.</>}
      </div>
      {dueWhileAway.length > 0 && (
        <button className="btn btn-sm btn-primary" onClick={() => logCare(dueWhileAway.map(p => p.id), 'water')}>
          <WateringCan className="art-sm" /> Water all now
        </button>
      )}
    </div>
  )
}

const dueLabel = left => left < 0 ? `${-left} day${left === -1 ? '' : 's'} overdue` : 'Due today'

const SORTS = {
  due: { next: 'az', label: 'Due first', Icon: AlarmClock },
  az:  { next: 'za', label: 'A–Z', Icon: ArrowDownAZ },
  za:  { next: 'due', label: 'Z–A', Icon: ArrowDownZA },
}

export default function Dashboard({ onAdd }) {
  const { state, weather, setSettings, logCare, logCareJobs } = useStore()
  const [query, setQuery] = useState('')
  const [rainPlant, setRainPlant] = useState(null)
  const [detailPlant, setDetailPlant] = useState(null)
  const [showNotifs, setShowNotifs] = useState(false)
  const sort = SORTS[state.settings.plantSort] ? state.settings.plantSort : 'due'
  const [notifTab, setNotifTab] = useState('water')
  // Combo plants that have had one half logged. They stay in Combo until the
  // other half is done too, instead of hopping to the Water or Feed tab.
  const [comboPins, setComboPins] = useState(() => new Set())
  const bellRef = useRef(null)
  const lat = state.settings.location?.lat

  // what's actually due today, straight from the schedule
  const { dueWater, dueMist, dueFeed, dueCombo, dueRain, urgency } = useMemo(() => {
    const water = []
    const mist = []
    const feed = []
    const rain = []
    const urgency = new Map() // plantId -> most overdue chore (≤0 means needs care today)
    for (const plant of state.plants) {
      const cat = getCatalogPlant(plant.catalogId)
      if (!cat) continue
      const w = waterDaysLeft(plant, lat)
      if (w <= 0) water.push({ plant, cat, left: w })
      const m = mistDaysLeft(plant)
      if (m !== null && m <= 0) mist.push({ plant, cat, left: m })
      const f = fertilizeDaysLeft(plant)
      if (f !== null && f <= 0) feed.push({ plant, cat, left: f })
      const askRain = needsRainAnswer(plant, weather)
      if (askRain) rain.push({ plant, cat, left: 0 })
      urgency.set(plant.id, Math.min(w, m ?? Infinity, f ?? Infinity, askRain ? 0 : Infinity))
    }
    const byUrgency = (a, b) => a.left - b.left
    // Watering and feeding happen in the same trip to the sink, so a plant due
    // for both is listed once, under Combo, instead of in Water and Feed.
    // Logging one half keeps the row in Combo (pinned) with that half ticked;
    // it leaves only once both are done. Misting stays its own chore.
    const waterLeft = new Map(water.map(w => [w.plant.id, w]))
    const feedLeft = new Map(feed.map(f => [f.plant.id, f]))
    const combo = []
    for (const plant of state.plants) {
      const w = waterLeft.get(plant.id)
      const f = feedLeft.get(plant.id)
      const both = w && f
      const pinned = comboPins.has(plant.id) && (w || f)
      if (!both && !pinned) continue
      const cat = (w || f).cat
      combo.push({
        plant, cat,
        left: Math.min(w?.left ?? 0, f?.left ?? 0),
        waterDone: !w, feedDone: !f,
      })
    }
    const inCombo = new Set(combo.map(c => c.plant.id))
    return {
      dueWater: water.filter(w => !inCombo.has(w.plant.id)).sort(byUrgency),
      dueMist: mist.sort(byUrgency),
      dueFeed: feed.filter(f => !inCombo.has(f.plant.id)).sort(byUrgency),
      dueCombo: combo.sort(byUrgency),
      dueRain: rain,
      urgency,
    }
  }, [state.plants, lat, weather, comboPins])

  const notifTabs = useMemo(() => [
    { key: 'combo', label: 'Combo', items: dueCombo, Art: null,        type: null,    verb: 'combo' },
    { key: 'water', label: 'Water', items: dueWater, Art: WateringCan, type: 'water', verb: 'watering' },
    { key: 'mist',  label: 'Mist',  items: dueMist,  Art: SprayBottle, type: 'mist',  verb: 'misting' },
    { key: 'feed',  label: 'Feed',  items: dueFeed,  Art: null,        type: 'feed',  verb: 'feeding' },
    { key: 'rain',  label: 'Rain',  items: dueRain,  Art: null,        type: null,    verb: 'rain' },
  ], [dueCombo, dueWater, dueMist, dueFeed, dueRain])

  // once both halves are logged the row drops out of Combo — forget its pin so
  // a later water-only (or feed-only) day lists it under the right tab
  useEffect(() => {
    if (!comboPins.size) return
    const live = new Set(dueCombo.map(c => c.plant.id))
    if ([...comboPins].some(id => !live.has(id))) {
      setComboPins(prev => new Set([...prev].filter(id => live.has(id))))
    }
  }, [dueCombo, comboPins])

  const pinCombo = id => setComboPins(prev => prev.has(id) ? prev : new Set(prev).add(id))

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

  // bulk: the whole open tab in one tap (one toast, one Undo)
  const doAll = tab => {
    if (tab.key === 'combo') {
      logCareJobs(tab.items.flatMap(i => [
        ...(i.waterDone ? [] : [{ id: i.plant.id, type: 'water' }]),
        ...(i.feedDone ? [] : [{ id: i.plant.id, type: 'feed' }]),
      ]))
    } else {
      logCare(tab.items.map(i => i.plant.id), tab.type)
    }
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
    const name = p => p.nickname || getCatalogPlant(p.catalogId)?.name || ''
    // locale-aware so accents and numbers order the way a reader expects
    const byName = (a, b) => name(a).localeCompare(name(b), undefined, { sensitivity: 'base', numeric: true })
    return [...state.plants]
      .filter(p => {
        if (!q) return true
        const cat = getCatalogPlant(p.catalogId)
        return (p.nickname || '').toLowerCase().includes(q) ||
          (cat?.name || '').toLowerCase().includes(q) ||
          (cat?.latin || '').toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (sort === 'due') return (urgency.get(a.id) ?? 99) - (urgency.get(b.id) ?? 99) || byName(a, b)
        return sort === 'za' ? -byName(a, b) : byName(a, b)
      })
  }, [state.plants, query, sort, urgency])

  // "Due first" splits the list: what needs you today, then everything else
  const groups = sort === 'due'
    ? [
        { key: 'today', title: 'Needs care today', items: plants.filter(p => (urgency.get(p.id) ?? 99) <= 0) },
        { key: 'later', title: 'Later', items: plants.filter(p => (urgency.get(p.id) ?? 99) > 0) },
      ].filter(g => g.items.length)
    : [{ key: 'all', title: null, items: plants }]

  // keep modal targets pointing at fresh plant objects
  const freshRain = rainPlant && state.plants.find(p => p.id === rainPlant.id)
  const freshDetail = detailPlant && state.plants.find(p => p.id === detailPlant.id)
  const SortIcon = SORTS[sort].Icon

  return (
    <div className="main-content main-content-dashboard">
      {/* Phones pin only the header and the search row; the weather card
          scrolls away between them. Wider screens pin the whole block. */}
      <div className="dash-top">
      <div className="header dash-head">
        <div className="avatar"><Avatar /></div>
        <div className="hello">
          <small>Welcome,</small>
          <b>{state.profile.name || 'Plant lover'}!</b>
        </div>
        <div className="popover-wrap" ref={bellRef}>
          <button
            className="icon-btn" aria-label={totalDue ? `Today's tasks: ${totalDue}` : "Today's tasks"}
            aria-expanded={showNotifs}
            onClick={openNotifs}
          >
            <Bell size={19} />
            {totalDue > 0 && <span className="bell-count">{totalDue > 99 ? '99+' : totalDue}</span>}
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

                  {activeTab.key !== 'rain' && activeTab.items.length > 1 && (
                    <button className="btn btn-sm btn-soft btn-block notif-all" onClick={() => doAll(activeTab)}>
                      <Check size={14} />
                      {activeTab.key === 'combo' ? 'Water + feed all' : `${activeTab.label} all ${activeTab.items.length}`}
                    </button>
                  )}

                  {activeTab.items.map(({ plant, cat, left, waterDone, feedDone }) => (
                    <div
                      key={plant.id} className={`notif-item notif-item-${activeTab.key}${left < 0 ? ' is-overdue' : ''}`}
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
                            ? (() => {
                                const r = pendingRain(plant, weather)
                                return `Did it get wet? ${r ? `${r.totalMm.toFixed(1)} mm ${rainWhen(r, weather)}` : ''}`
                              })()
                            : activeTab.key === 'combo'
                              ? `${waterDone ? 'Watered · feed left' : feedDone ? 'Fed · water left' : 'Water + feed'} · ${left < 0 ? `${-left}d overdue` : 'today'}`
                            : dueLabel(left)}
                        </div>
                      </div>
                      {activeTab.key === 'combo' && (
                        <>
                          <button
                            className={`n-log${waterDone ? ' is-done' : ''}`}
                            aria-label={`Log watering for ${plant.nickname || cat?.name}`}
                            title={waterDone ? 'Watered' : 'Log watering'}
                            disabled={waterDone}
                            onClick={e => { e.stopPropagation(); pinCombo(plant.id); logCare([plant.id], 'water') }}
                          >
                            {waterDone ? <Check /> : <WateringCan />}
                          </button>
                          <button
                            className={`n-log n-log-feed${feedDone ? ' is-done' : ''}`}
                            aria-label={`Log feeding for ${plant.nickname || cat?.name}`}
                            title={feedDone ? 'Fed' : 'Log feeding'}
                            disabled={feedDone}
                            onClick={e => { e.stopPropagation(); pinCombo(plant.id); logCare([plant.id], 'feed') }}
                          >
                            {feedDone ? <Check /> : <Sparkles />}
                          </button>
                        </>
                      )}
                      {activeTab.type && (
                        <button
                          className={`n-log${activeTab.Art ? '' : ' n-log-feed'}`}
                          aria-label={`Log ${activeTab.verb} for ${plant.nickname || cat?.name}`}
                          title={`Log ${activeTab.verb}`}
                          onClick={e => { e.stopPropagation(); logCare([plant.id], activeTab.type) }}
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

      <div className="dash-wx">
        <WeatherCard rainCount={dueRain.length} />
        <TripBanner lat={lat} />
      </div>

      <div className="dash-tools">
        <div className="search-bar">
          <Search size={17} />
          <input placeholder="Search" aria-label="Search plants" value={query} onChange={e => setQuery(e.target.value)} />
        </div>

        <div className="section-head">
          <h2>My Plants</h2>
          <div className="section-head-aside">
            <span className="sub">{state.plants.length} total</span>
            <button
              className="chip"
              aria-label={`Sorted ${SORTS[sort].label} — tap for ${SORTS[SORTS[sort].next].label}`}
              onClick={() => setSettings({ plantSort: SORTS[sort].next })}
            >
              <SortIcon size={14} />
              {SORTS[sort].label}
            </button>
          </div>
        </div>
      </div>
      </div>

      {plants.length === 0 ? (
        <div className="empty">
          <Sprout className="big" />
          <h3>{query ? 'No plants match' : 'No plants yet'}</h3>
          <p>{query ? 'Try a different search.' : 'Add your first plant from the catalogue.'}</p>
          {!query && onAdd && (
            <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> Add your first plant</button>
          )}
        </div>
      ) : (
        groups.map(g => (
          <section key={g.key} className="plant-group">
            {g.title && <h3 className="group-title">{g.title} <span className="sub">{g.items.length}</span></h3>}
            <div className="card-grid">
              {g.items.map(p => (
                <PlantCard key={p.id} plant={p} onOpen={setDetailPlant} onRain={setRainPlant} />
              ))}
            </div>
          </section>
        ))
      )}

      {freshRain && <RainModal plant={freshRain} onClose={() => setRainPlant(null)} />}
      {freshDetail && <PlantDetailModal plant={freshDetail} onClose={() => setDetailPlant(null)} />}
    </div>
  )
}
