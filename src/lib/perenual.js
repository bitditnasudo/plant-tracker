// Online plant search via the Perenual API (https://perenual.com — free key,
// ~100 requests/day). Results are mapped into the same catalogue shape the
// bundled plants use, then saved into the user's personal catalogue.

const BASE = 'https://perenual.com/api/v2'

// Free-tier keys only get care data for roughly the first 3000 species IDs;
// above that the API answers 429 / "Upgrade Plans" placeholders.
export const FREE_TIER_MAX_ID = 3000

function checkStatus(res) {
  if (res.status === 429) throw new Error('Plant database rate limit reached — wait a minute and try again.')
  if (res.status === 401 || res.status === 403) throw new Error('Perenual rejected the API key — check it in the Account tab.')
  if (!res.ok) throw new Error(`Plant database error (${res.status})`)
}

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export async function searchPerenual(key, q) {
  const res = await fetch(`${BASE}/species-list?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}`)
  checkStatus(res)
  const data = await res.json()
  return (data.data || [])
    .map(d => ({
      perenualId: d.id,
      name: cap(d.common_name) || d.scientific_name?.[0] || `Species ${d.id}`,
      latin: d.scientific_name?.[0] || '',
    }))
    .filter(d => d.name)
}

// watering keyword → typical days between waterings in the growing season
const WATERING_DAYS = { frequent: 3, average: 7, minimum: 14, none: 30 }

function waterFromDetails(d) {
  // prefer the explicit benchmark ("5-7" days) when present and parseable
  const raw = d.watering_general_benchmark?.value
  if (raw) {
    const nums = String(raw).match(/\d+(\.\d+)?/g)?.map(Number)
    if (nums?.length) {
      const mid = nums.reduce((a, b) => a + b, 0) / nums.length
      if (mid >= 1 && mid <= 60) return Math.round(mid)
    }
  }
  return WATERING_DAYS[(d.watering || '').toLowerCase()] || 7
}

function lightFromSunlight(sunlight) {
  const s = (sunlight || []).map(x => String(x).toLowerCase())
  if (s.some(x => x.includes('full sun'))) return 'direct'
  if (s.some(x => x.includes('part'))) return 'partial'
  if (s.some(x => x.includes('shade'))) return 'shade'
  return 'partial'
}

function guessMeta(d) {
  const hay = `${d.common_name || ''} ${(d.scientific_name || []).join(' ')} ${d.family || ''}`.toLowerCase()
  if (/cact|opuntia|mammillaria|echinocactus|cereus|schlumbergera/.test(hay)) return { category: 'cactus', icon: 'cactus' }
  if (/succulent|echeveria|crassula|sedum|kalanchoe|aloe|agave|haworthia|sempervivum|euphorbia/.test(hay)) return { category: 'succulent', icon: 'succulent' }
  if (/palm|dypsis|chamaedorea|howea|strelitzia/.test(hay)) return { category: 'tree', icon: 'palm' }
  if (/fern|nephrolepis|asparagus setaceus/.test(hay)) return { category: 'foliage', icon: 'fern' }
  if (/ficus|tree|pine|araucaria|citrus|acer|pachira/.test(hay)) return { category: 'tree', icon: 'tree' }
  if (/basil|mint|thyme|oregano|sage|rosemary|parsley|cilantro|chive|pepper|tomato|strawberry|lettuce|herb/.test(hay)) return { category: 'herb', icon: 'sprout' }
  if (d.flowers) return { category: 'flower', icon: 'flowerBunch' }
  return { category: 'foliage', icon: 'leafVine' }
}

// Fallback for species whose care data is behind Perenual's paid tiers:
// sensible defaults the user can adjust before saving.
export function estimatedEntry({ perenualId, name, latin }) {
  const meta = guessMeta({ common_name: name, scientific_name: [latin] })
  return {
    id: `perenual-${perenualId}`,
    source: 'perenual',
    name, latin,
    category: meta.category,
    light: 'partial',
    waterSummer: 7,
    waterWinter: 13,
    mist: null,
    fertilize: 30,
    outdoor: true,
    icon: meta.icon,
    details: 'its characteristic foliage',
    pot: 'terracotta pot',
    potColor: 'warm orange',
    estimated: true,
  }
}

const isUpgradeWall = v => typeof v === 'string' && v.includes('Upgrade Plans')

export async function fetchPerenualEntry(key, row) {
  const { perenualId } = row
  const res = await fetch(`${BASE}/species/details/${perenualId}?key=${encodeURIComponent(key)}`)
  // free tier gates high species IDs behind a 429 — fall back to an estimate
  if (res.status === 429 && perenualId > FREE_TIER_MAX_ID) return estimatedEntry(row)
  checkStatus(res)
  const d = await res.json()
  if (isUpgradeWall(d.watering) || isUpgradeWall(d.sunlight?.[0])) return estimatedEntry(row)

  const summer = waterFromDetails(d)
  const meta = guessMeta(d)
  const name = cap(d.common_name) || row.name || d.scientific_name?.[0] || `Species ${perenualId}`

  return {
    id: `perenual-${perenualId}`,
    source: 'perenual',
    name,
    latin: d.scientific_name?.[0] || row.latin || '',
    category: meta.category,
    light: lightFromSunlight(d.sunlight),
    waterSummer: summer,
    waterWinter: Math.min(60, Math.round(summer * 1.8)),
    mist: null,
    fertilize: 30,
    // indoor:true species live inside by default; everything else can take rain
    outdoor: d.indoor !== true,
    icon: meta.icon,
    details: d.flowers ? `its foliage and ${name.toLowerCase()} blooms` : 'its characteristic foliage',
    pot: 'terracotta pot',
    potColor: 'warm orange',
  }
}
