// Open-Meteo — free, no API key. https://open-meteo.com/
import { formatISO, subDays } from 'date-fns'

const WMO = {
  0: ['Clear sky', 'sun'], 1: ['Mainly clear', 'sun'], 2: ['Partly cloudy', 'cloud-sun'],
  3: ['Overcast', 'cloud'], 45: ['Fog', 'cloud'], 48: ['Rime fog', 'cloud'],
  51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Heavy drizzle', 'rain'],
  61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'],
  80: ['Light showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Violent showers', 'rain'],
  85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm + hail', 'storm'], 99: ['Thunderstorm + hail', 'storm'],
}

export function describeWeatherCode(code) {
  return WMO[code] || ['—', 'cloud']
}

export async function searchCity(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Geocoding failed')
  const data = await res.json()
  return (data.results || []).map(r => {
    // skip the admin region when it repeats the city ("Querétaro City, Querétaro")
    const parts = [r.name]
    if (r.admin1 && !r.name.toLowerCase().includes(r.admin1.toLowerCase())) parts.push(r.admin1)
    if (r.country_code) parts.push(r.country_code)
    return { lat: r.latitude, lon: r.longitude, label: parts.join(', ') }
  })
}

// How much past weather to pull on every refresh. Open-Meteo backfills this
// from its own archive, so wind history has no gaps even if the app wasn't
// opened for weeks — far more reliable than only logging what we observe.
export const WIND_HISTORY_DAYS = 30
export const RAIN_HISTORY_DAYS = 7 // how far back an unanswered rain day is still asked about

export async function fetchWeather({ lat, lon }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min` +
    `,wind_speed_10m_max,wind_speed_10m_mean,et0_fao_evapotranspiration` +
    `&past_days=${WIND_HISTORY_DAYS}&forecast_days=2&timezone=auto`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Weather request failed')
  const d = await res.json()

  // Dates come from the API, in the LOCATION's timezone (timezone=auto), so a
  // device set to another zone (travel, a location set elsewhere) can't shift
  // "yesterday" by a day and miss the rain total.
  const deviceToday = formatISO(new Date(), { representation: 'date' })
  const today = (d.current?.time || '').slice(0, 10) || deviceToday
  let todayIdx = d.daily.time.indexOf(today)
  if (todayIdx < 0) todayIdx = Math.max(0, d.daily.time.indexOf(deviceToday))
  const yIdx = todayIdx - 1
  const yesterdayDate = yIdx >= 0 ? d.daily.time[yIdx] : formatISO(subDays(new Date(), 1), { representation: 'date' })

  // past days' rain, so a rain day is still asked about after a few days away
  const rainDaily = {}
  for (let i = Math.max(0, todayIdx - RAIN_HISTORY_DAYS); i < todayIdx; i++) {
    rainDaily[d.daily.time[i]] = d.daily.precipitation_sum?.[i] ?? 0
  }

  // daily history: { 'YYYY-MM-DD': { max, mean, et0 } } — wind in km/h;
  // et0 is FAO-56 reference evapotranspiration in mm, the standard measure of
  // how hard that day's sun, heat, dry air and wind pulled water out
  const windDaily = {}
  d.daily.time.forEach((day, i) => {
    const max = d.daily.wind_speed_10m_max?.[i]
    const mean = d.daily.wind_speed_10m_mean?.[i]
    const et0 = d.daily.et0_fao_evapotranspiration?.[i]
    const entry = {}
    if (typeof max === 'number' || typeof mean === 'number') Object.assign(entry, { max: max ?? mean, mean: mean ?? max })
    if (typeof et0 === 'number') entry.et0 = et0
    if (Object.keys(entry).length) windDaily[day] = entry
  })

  return {
    windDaily,
    fetchedAt: Date.now(),
    temp: d.current.temperature_2m,
    feelsLike: d.current.apparent_temperature ?? null,
    humidity: d.current.relative_humidity_2m,
    wind: d.current.wind_speed_10m,
    code: d.current.weather_code,
    tMax: d.daily.temperature_2m_max[todayIdx],
    tMin: d.daily.temperature_2m_min[todayIdx],
    rainChanceToday: d.daily.precipitation_probability_max?.[todayIdx] ?? null,
    today,
    yesterdayDate,
    yesterdayRainMm: yIdx >= 0 ? (d.daily.precipitation_sum[yIdx] ?? 0) : 0,
    rainDaily,
  }
}

/* The location's own evaporation year: mean daily ET0 for each of the past 12
 * months, from Open-Meteo's historical archive. Its lowest and highest month
 * are what "winter" and "summer" mean for watering here — in Querétaro the
 * driest stretch is March–May, not the calendar's April–September. The
 * archive lags a few days, so the window ends a week ago. */
export async function fetchEt0Climate({ lat, lon }) {
  const end = formatISO(subDays(new Date(), 7), { representation: 'date' })
  const start = formatISO(subDays(new Date(), 372), { representation: 'date' })
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${start}&end_date=${end}&daily=et0_fao_evapotranspiration&timezone=auto`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Climate request failed')
  const d = await res.json()
  const sums = {}
  d.daily.time.forEach((day, i) => {
    const v = d.daily.et0_fao_evapotranspiration?.[i]
    if (typeof v !== 'number') return
    const m = day.slice(5, 7)
    sums[m] = sums[m] || { t: 0, n: 0 }
    sums[m].t += v
    sums[m].n += 1
  })
  // a month needs most of its days to count
  const monthly = Object.fromEntries(Object.entries(sums).filter(([, v]) => v.n >= 10).map(([m, v]) => [m, v.t / v.n]))
  const vals = Object.values(monthly)
  if (vals.length < 10) throw new Error('Not enough climate data')
  return { lat, lon, fetchedAt: Date.now(), monthly, low: Math.min(...vals), high: Math.max(...vals) }
}

export function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation unavailable'))
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: +pos.coords.latitude.toFixed(4), lon: +pos.coords.longitude.toFixed(4), label: 'Current location' }),
      err => reject(err),
      { timeout: 10000 },
    )
  })
}
