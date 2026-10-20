/* Feeding and soil-flush rules, by plant group, each tied to a citable source.
 *
 * There is no open database of per-species feeding intervals: Perenual has no
 * fertilizer field, and Trefle / USDA PLANTS only carry growing conditions.
 * The figures that can actually be traced are university-extension and
 * botanical-garden guidance, which is written per plant group. So the
 * schedule is resolved from the species' group at read time — the per-species
 * `fertilize` numbers in the catalogue (and the flat 30-day placeholder on
 * Perenual imports) are no longer read. Because nothing is stored, plants
 * already in the account pick this up without a migration, on every device.
 *
 * The salt-burn rule of thumb from every source below: feed only while the
 * plant is actively growing, never stronger than the label, and flush the pot
 * with plain water now and then to wash out the salts fertilizer leaves.
 */

// Every link checked 2026-10-19 against the passage it is cited for.
export const SOURCES = {
  illinois: { label: 'University of Illinois Extension — houseplant care', url: 'https://extension.illinois.edu/houseplants/care' },
  iowa:     { label: 'Iowa State Extension — fertilizing houseplants in winter', url: 'https://yardandgarden.extension.iastate.edu/faq/should-houseplants-be-fertilized-winter' },
  umnCacti: { label: 'University of Minnesota Extension — cacti and succulents', url: 'https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/cacti-and-succulents' },
  mobot:    { label: 'Missouri Botanical Garden — cacti and succulents factsheet', url: 'https://www.missouribotanicalgarden.org/Portals/0/Gardening/Gardening%20Help/Factsheets/Cactus%20and%20Succulents10.pdf' },
  ufHoliday:{ label: 'UF/IFAS Extension — holiday cactus care', url: 'https://blogs.ifas.ufl.edu/flaglerco/2023/11/20/a-guide-to-holiday-cacti-care-the-basics-pt-1/' },
  aos:      { label: 'American Orchid Society — fertilize weakly, weekly', url: 'https://www.aos.org/orchids/articles/fertilize-weakly-weekly' },
  nybg:     { label: 'New York Botanical Garden — Phalaenopsis care', url: 'https://libanswers.nybg.org/faq/223105' },
  purdue:   { label: 'Purdue Extension — revive annual flowers', url: 'https://www.purdue.edu/hla/sites/yardandgarden/revive-annual-flowers/' },
  uky:      { label: 'Kentucky Extension — gardening in containers', url: 'https://daviess.mgcafe.uky.edu/sites/daviess.ca.uky.edu/files/20230408%20Flowering%20plants%20and%20containers.pdf' },
  ilHerbs:  { label: 'University of Illinois Extension — growing herbs indoors', url: 'https://extension.illinois.edu/news-releases/keep-growing-herbs-indoors-fall-winter' },
}

/* days: interval while the plant is growing.
 * winterDays: 'pause' — no feeding out of season anywhere (the sources say so
 *   for dormant cacti and succulents); a number — a fixed slower interval
 *   (orchids, herbs); null — let the location decide, see winterFeedDays().
 * yearRoundDays: where there is no winter to rest in, the interval that still
 *   lands on the sources' yearly count (cacti twice, succulents four times).
 * says: what the cited sources actually state.
 * choice: where the app had to pick a number inside a range, or went beyond
 *   the sources — said out loud so it is never passed off as cited. */
export const FEED_RULES = {
  foliage: {
    label: 'Foliage houseplant', days: 60, winterDays: null,
    dose: 'label strength or weaker, never stronger',
    says: 'Most houseplants need feeding no more than once every 1–3 months, March to September, and very little or none in the short days of winter.',
    choice: 'The app uses 2 months, the middle of that range.',
    sources: ['illinois', 'iowa'],
  },
  slowFoliage: {
    label: 'Slow-growing foliage', days: 90, winterDays: null,
    dose: 'label strength or weaker, never stronger',
    says: 'Most houseplants need feeding no more than once every 1–3 months, March to September, and very little or none in the short days of winter.',
    choice: 'Slow, drought-tolerant growers (snake plant, ZZ…) get the 3-month end of that range.',
    sources: ['illinois', 'iowa'],
  },
  floweringIndoor: {
    label: 'Flowering houseplant', days: 30, winterDays: null,
    dose: 'label strength or weaker, never stronger',
    says: 'Most houseplants need feeding no more than once every 1–3 months, March to September, and very little or none in the short days of winter.',
    choice: 'The sources don’t single out bloomers; the app gives them the 1-month end of the range.',
    sources: ['illinois', 'iowa'],
  },
  container: {
    label: 'Outdoor container plant', days: 14, winterDays: null,
    dose: 'soluble fertilizer, per the label',
    says: 'Watering washes nutrients out of containers, so potted ornamentals get a soluble feed every 1–3 weeks; water until it runs out the drainage holes to keep fertilizer salts from building up.',
    choice: 'The app uses 2 weeks.',
    sources: ['purdue', 'uky'],
  },
  fruiting: {
    label: 'Potted vegetable or fruit', days: 7, winterDays: null,
    dose: 'half strength',
    says: 'Vegetables in pots get a soluble fertilizer once a week at half strength.',
    choice: null,
    sources: ['uky'],
  },
  herb: {
    label: 'Herb', days: 14, winterDays: 28,
    dose: 'water-soluble, per the label',
    says: 'Herbs get a water-soluble feed every two weeks and no more often — feeding too often hurts their flavour and aroma.',
    choice: 'The source gives no winter rule; the app halves it in winter, when windowsill growth slows.',
    sources: ['ilHerbs'],
  },
  cactus: {
    label: 'Desert cactus', days: 120, winterDays: 'pause', yearRoundDays: 180,
    dose: 'half strength, higher in phosphorus than nitrogen',
    says: 'Cacti need fertilizer only once or twice a year, in late spring or summer while growing; in winter they are dormant and need none.',
    choice: 'Every 4 months in season works out to twice a year.',
    sources: ['umnCacti', 'mobot'],
  },
  succulent: {
    label: 'Succulent', days: 60, winterDays: 'pause', yearRoundDays: 90,
    dose: 'quarter to half strength',
    says: 'Succulents are fed three or four times during the brighter months; in winter they are dormant and need none.',
    choice: 'Every 2 months, March–September, works out to four feeds.',
    sources: ['umnCacti', 'mobot'],
  },
  holidayCactus: {
    label: 'Holiday cactus', days: 60, winterDays: 'pause',
    dose: 'quarter to half strength',
    says: 'Feed holiday cacti in spring and summer, and reduce or stop in fall and winter.',
    choice: 'The source gives no interval; the app uses the general houseplant 2 months.',
    sources: ['ufHoliday', 'mobot'],
  },
  orchid: {
    label: 'Orchid', days: 7, winterDays: 14,
    dose: 'quarter strength or weaker',
    says: 'Feed orchids "weakly, weekly" — a quarter or eighth strength — and once a month use plain water instead to leach the salts. Phalaenopsis keep growing in winter at a lower rate.',
    choice: 'The sources halve the winter dose; the app halves it by feeding every 2 weeks instead.',
    sources: ['aos', 'nybg'],
  },
}

export const FLUSH = {
  days: 120, // Illinois says every 4–6 months; the short end while salt burn is the worry
  orchidDays: 30,
  why: 'Pour plain water through the pot until it runs out the bottom, let it drain fully and empty the saucer. This washes out the salts fertilizer leaves behind.',
  sources: ['illinois'],
  orchidSources: ['nybg'],
}

const ORCHID = /orchid|phalaenopsis|dendrobium|oncidium|cattleya|vanda|cymbidium|paphiopedilum|miltonia|zygopetalum/
const HOLIDAY_CACTUS = /schlumbergera|hatiora|rhipsalis|epiphyllum|christmas cactus|thanksgiving cactus|easter cactus/
const FRUITING = /solanum lycopersicum|capsicum|fragaria|citrus|tomato|pepper|strawberr|lemon|lime/

const hay = cat => `${cat?.name || ''} ${cat?.latin || ''}`.toLowerCase()

// Which group a plant feeds as. Where it lives matters for bloomers: the same
// zinnia leaches far faster in a sunny balcony pot than on a windowsill.
export function feedGroup(plant, cat) {
  if (!cat) return 'foliage'
  const h = hay(cat)
  if (ORCHID.test(h)) return 'orchid'
  if (HOLIDAY_CACTUS.test(h)) return 'holidayCactus'
  switch (cat.category) {
    case 'cactus': return 'cactus'
    case 'succulent': return 'succulent'
    case 'flower': return plant?.isOutside ? 'container' : 'floweringIndoor'
    case 'herb': return FRUITING.test(h) ? 'fruiting' : 'herb'
    case 'tree':
    case 'foliage':
    default:
      return cat.waterSummer >= 14 ? 'slowFoliage' : 'foliage'
  }
}

export function feedRule(plant, cat) {
  return FEED_RULES[feedGroup(plant, cat)]
}

/* ── Adapting to the saved location ──────────────────────────────────────
 * The sources tie the winter rest to "the short days of winter" (Illinois)
 * and are written for cold-winter places (Illinois, Iowa, Minnesota). So the
 * location is read for exactly that: how short its shortest day is, which
 * follows from latitude by plain astronomy. Indoors, day length is the part
 * of winter a heated room doesn't cancel out.
 *
 *   tropical  shortest day ≥ 11 h 15 m (within ~12° of the equator): day length
 *             barely changes, there is no winter rest — feed all year.
 *   mild      ≥ 10 h 25 m (~12–25°, e.g. Querétaro 10 h 45 m): growth slows
 *             rather than stops — feed half as often in winter.
 *   cold      shorter (beyond ~25°): the sources' own climate — the feed stops.
 *   unknown   no location saved: follow the sources' calendar (cold, north)
 *             until there is one.
 * The band thresholds are the app's, not the sources', and the care sheet
 * says so. Dormant cacti and succulents rest in every band that has a winter.
 */
const TROPICAL_MIN_DAY_H = 11.25
const MILD_MIN_DAY_H = 10.42

// Length of the shortest day of the year (winter solstice), in hours.
export function shortestDayHours(latitude) {
  const phi = (Math.abs(latitude) * Math.PI) / 180
  const decl = (23.44 * Math.PI) / 180
  const x = Math.tan(phi) * Math.tan(decl)
  if (x >= 1) return 0 // polar night
  return (2 * (Math.acos(x) * 180) / Math.PI) / 15
}

export function climateBand(latitude) {
  if (typeof latitude !== 'number' || Number.isNaN(latitude)) return 'unknown'
  const h = shortestDayHours(latitude)
  if (h >= TROPICAL_MIN_DAY_H) return 'tropical'
  if (h >= MILD_MIN_DAY_H) return 'mild'
  return 'cold'
}

const south = latitude => typeof latitude === 'number' && latitude < 0

/* The feeding season: March–September (Illinois Extension), mirrored for the
 * southern hemisphere; all year where there is no winter. Slightly wider than
 * the watering season in schedule.js (April–September) because growth
 * restarts with lengthening days in March, before evaporation does. */
export function isFeedingSeason(date = new Date(), latitude) {
  if (climateBand(latitude) === 'tropical') return true
  const m = date.getMonth() + 1
  return south(latitude) ? (m <= 3 || m >= 9) : (m >= 3 && m <= 9)
}

// First day of the next feeding season on or after `date`.
export function nextSeasonStart(date = new Date(), latitude) {
  const startMonth = south(latitude) ? 8 : 2 // 0-based: September / March
  const y = date.getFullYear()
  const thisYear = new Date(y, startMonth, 1)
  return date <= thisYear ? thisYear : new Date(y + 1, startMonth, 1)
}

export const FEED_SEASON_LABEL = lat => south(lat) ? 'September–March' : 'March–September'
export const WINTER_LABEL = lat => south(lat) ? 'Apr–Aug' : 'Oct–Feb'

// Interval during the growing season (all year in the tropics).
export function seasonFeedDays(rule, latitude) {
  return climateBand(latitude) === 'tropical' && rule.yearRoundDays ? rule.yearRoundDays : rule.days
}

// Interval out of season, or null for a full pause.
export function winterFeedDays(rule, latitude) {
  const band = climateBand(latitude)
  if (band === 'tropical') return seasonFeedDays(rule, latitude) // no winter to change it
  if (rule.winterDays === 'pause') return null
  if (rule.winterDays) return rule.winterDays
  return band === 'mild' ? rule.days * 2 : null
}

const hm = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m` }

// How the location changed this plant's schedule — shown on the care sheet,
// always marked as the app's adjustment rather than a cited figure.
export function winterNote(rule, latitude) {
  const band = climateBand(latitude)
  if (band === 'unknown') return 'No location is saved, so this follows the sources’ cold-winter calendar. Set your location in Account to adapt it to your climate.'
  const day = hm(shortestDayHours(latitude))
  if (band === 'tropical') return `Your shortest day is ${day}, so there is no real winter rest here and the app feeds at the same rate all year. That adjustment is the app’s, not the sources’.`
  if (band === 'mild' && rule.winterDays === null) return `Your shortest day is ${day}. The sources are written for colder, darker winters; here growth only slows, so the app feeds half as often in ${WINTER_LABEL(latitude)} instead of stopping. That adjustment is the app’s, not the sources’.`
  return null
}

// "every 60 days, every 120 in Oct–Feb" / "every 60 days, March–September only" / "every 60 days, all year"
export function feedScheduleLabel(rule, latitude) {
  const days = seasonFeedDays(rule, latitude)
  if (climateBand(latitude) === 'tropical') return `every ${days} days, all year`
  const w = winterFeedDays(rule, latitude)
  return w
    ? `every ${days} days, every ${w} in ${WINTER_LABEL(latitude)}`
    : `every ${days} days, ${FEED_SEASON_LABEL(latitude)} only`
}

export const flushRestsInWinter = group => group === 'cactus' || group === 'succulent'
