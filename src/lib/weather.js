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

export async function fetchWeather({ lat, lon }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min` +
    `,wind_speed_10m_max,wind_speed_10m_mean` +
    `&past_days=${WIND_HISTORY_DAYS}&forecast_days=2&timezone=auto`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Weather request failed')
  const d = await res.json()

  const yesterdayDate = formatISO(subDays(new Date(), 1), { representation: 'date' })
  const yIdx = d.daily.time.indexOf(yesterdayDate)
  const todayIdx = yIdx >= 0 ? yIdx + 1 : 0

  // daily wind history: { 'YYYY-MM-DD': { max, mean } }, both km/h
  const windDaily = {}
  d.daily.time.forEach((day, i) => {
    const max = d.daily.wind_speed_10m_max?.[i]
    const mean = d.daily.wind_speed_10m_mean?.[i]
    if (typeof max === 'number' || typeof mean === 'number') {
      windDaily[day] = { max: max ?? mean, mean: mean ?? max }
    }
  })

  return {
    windDaily,
    fetchedAt: Date.now(),
    temp: d.current.temperature_2m,
    humidity: d.current.relative_humidity_2m,
    wind: d.current.wind_speed_10m,
    code: d.current.weather_code,
    tMax: d.daily.temperature_2m_max[todayIdx],
    tMin: d.daily.temperature_2m_min[todayIdx],
    rainChanceToday: d.daily.precipitation_probability_max?.[todayIdx] ?? null,
    yesterdayDate,
    yesterdayRainMm: yIdx >= 0 ? (d.daily.precipitation_sum[yIdx] ?? 0) : 0,
  }
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
