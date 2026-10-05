import { useEffect, useMemo } from 'react'
import { CloudRain, Wind, Droplets, Thermometer, MapPin, Sun, Cloud, CloudSun, Snowflake, Zap, Plane, ChevronDown, ChevronUp } from 'lucide-react'
import { differenceInCalendarDays, format, parseISO, formatISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useStore, WEATHER_STALE_MS } from '../lib/store.jsx'
import { needsRainAnswer, tripNeed } from '../lib/schedule.js'
import { describeWeatherCode } from '../lib/weather.js'
import { getCatalogPlant } from '../lib/catalog.js'
import { WateringCan } from './PlantIcons.jsx'

/* The weather and trip cards. On phones they sit on the dashboard between the
 * header and the search row; on desktop they're docked in the sidebar
 * (`docked`), where they stay in view on every tab. */

const WX_ICONS = { sun: Sun, 'cloud-sun': CloudSun, cloud: Cloud, rain: CloudRain, snow: Snowflake, storm: Zap }
const timeLabel = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const fmt = d => format(parseISO(d), 'EEE d MMM')

// Plants that need a watering right before the planned trip (computed, never stored).
export function useTripNeeds() {
  const { state } = useStore()
  const trip = state.settings.trip
  const lat = state.settings.location?.lat
  return useMemo(() => {
    const m = new Map()
    if (!trip) return m
    for (const p of state.plants) {
      if (!getCatalogPlant(p.catalogId)) continue
      const n = tripNeed(p, lat, trip)
      if (n) m.set(p.id, n)
    }
    return m
  }, [state.plants, lat, trip])
}

export function WeatherCard({ docked = false }) {
  const { state, weather, weatherError } = useStore()
  const navigate = useNavigate()
  const loc = state.settings.location
  const rainCount = useMemo(
    () => (weather ? state.plants.filter(p => needsRainAnswer(p, weather)).length : 0),
    [state.plants, weather],
  )
  const cls = `card weather-card${docked ? ' weather-card-docked' : ''}`

  if (!loc) {
    return (
      <button type="button" className={`${cls} weather-card-link`} onClick={() => navigate('/account')}>
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
      <div className={`${cls} weather-card-loading`} aria-busy="true">
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
    <div className={cls}>
      <div className="wx-row">
        <WxIcon size={docked ? 34 : 46} strokeWidth={1.6} />
        <div className="wx-main">
          <div className="wx-temp">{Math.round(weather.temp)}°</div>
          {!docked && <div className="wx-desc">{desc} · {loc.label}</div>}
        </div>
        <div className="wx-hilo">
          {docked
            ? <><div>H {Math.round(weather.tMax)}°</div><div>L {Math.round(weather.tMin)}°</div></>
            : <>H {Math.round(weather.tMax)}° · L {Math.round(weather.tMin)}°</>}
        </div>
      </div>
      {docked && <div className="wx-desc wx-desc-docked">{desc} · {loc.label}</div>}
      <div className="wx-stats">
        <span className="wx-stat"><Droplets size={13} /> {weather.humidity}%</span>
        <span className="wx-stat"><Wind size={13} /> {Math.round(weather.wind)} km/h</span>
        {weather.rainChanceToday !== null && <span className="wx-stat"><CloudRain size={13} /> {weather.rainChanceToday}%{docked ? '' : ' today'}</span>}
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
          {docked ? (
            <span><b>{rainCount}</b> rain question{rainCount === 1 ? '' : 's'} — tap the red bubble</span>
          ) : (
            <span>
              {weather.yesterdayRainMm >= 1 && <>It rained <b>{weather.yesterdayRainMm.toFixed(1)} mm</b> yesterday. </>}
              {rainCount === 1 ? 'One outdoor plant has' : `${rainCount} outdoor plants have`} a rain question — tap the red bubble.
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// One line while a trip is planned; tapping it filters My Plants to the plants
// that need water before you leave (each card is tagged). Docked in the
// sidebar it works from any tab: it opens the dashboard with the filter on.
// While away: a quiet reminder of when you're back.
export function TripCard({ docked = false }) {
  const { state, setSettings, logCare, tripOpen, setTripOpen } = useStore()
  const navigate = useNavigate()
  const needs = useTripNeeds()
  const trip = state.settings.trip
  const today = formatISO(new Date(), { representation: 'date' })
  const over = trip && trip.to < today

  useEffect(() => {
    if (over) setSettings({ trip: null })
  }, [over, setSettings])

  if (!trip || over) return null
  const cls = `card trip-card${docked ? ' trip-card-docked' : ''}`

  if (trip.from <= today) {
    return (
      <div className={cls}>
        <Plane size={18} />
        <div className="grow">Away until <b>{fmt(trip.to)}</b></div>
      </div>
    )
  }

  const ids = [...needs.keys()]
  const open = tripOpen && ids.length > 0
  const daysToGo = differenceInCalendarDays(parseISO(trip.from), new Date())
  const head = docked
    ? <>Trip <b>{fmt(trip.from)}</b><br />{ids.length === 0 ? 'nothing to water first' : <>water <b>{ids.length}</b> before</>}</>
    : ids.length === 0
      ? <>Nothing needs water before your trip on <b>{fmt(trip.from)}</b></>
      : <>Before your trip on <b>{fmt(trip.from)}</b>, water <b>{ids.length} plant{ids.length === 1 ? '' : 's'}</b></>
  const toggle = () => {
    if (docked) navigate('/')
    setTripOpen(!open)
  }

  return (
    <div className={`${cls}${open ? ' is-open' : ''}`}>
      <button type="button" className="trip-toggle" onClick={toggle} disabled={!ids.length} aria-expanded={open}>
        <Plane size={18} />
        <span className="grow">{head}</span>
        {ids.length > 0 && (open ? <ChevronUp size={18} /> : <ChevronDown size={18} />)}
      </button>
      {open && (
        <div className="trip-actions">
          <span className="muted">
            {docked ? 'Shown in My Plants' : 'Shown below'}
            {daysToGo <= 1
              ? '.'
              : ` — water ${ids.length === 1 ? 'it' : 'them'} the day before you leave (${fmt(formatISO(parseISO(trip.from).getTime() - 864e5, { representation: 'date' }))}).`}
          </span>
          {daysToGo <= 1 && (
            <button className="btn btn-sm btn-primary" onClick={() => logCare(ids, 'water')}>
              <WateringCan className="art-sm" /> Water all now
            </button>
          )}
        </div>
      )}
    </div>
  )
}
