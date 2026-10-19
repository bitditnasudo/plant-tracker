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

export const SOURCES = {
  illinois: { label: 'University of Illinois Extension — houseplant care', url: 'https://extension.illinois.edu/houseplants/care' },
  iowa:     { label: 'Iowa State Extension — fertilizing houseplants in winter', url: 'https://yardandgarden.extension.iastate.edu/faq/should-houseplants-be-fertilized-winter' },
  umnCacti: { label: 'University of Minnesota Extension — cacti and succulents', url: 'https://extension.umn.edu/houseplants/cacti-and-succulents' },
  mobot:    { label: 'Missouri Botanical Garden — cacti and succulents factsheet', url: 'https://www.missouribotanicalgarden.org/Portals/0/Gardening/Gardening%20Help/Factsheets/Cactus%20and%20Succulents10.pdf' },
  ufHoliday:{ label: 'UF/IFAS Extension — holiday cactus care', url: 'https://blogs.ifas.ufl.edu/flaglerco/2023/11/20/a-guide-to-holiday-cacti-care-the-basics-pt-1/' },
  aos:      { label: 'American Orchid Society — fertilize weakly, weekly', url: 'https://www.aos.org/orchids/articles/fertilize-weakly-weekly' },
  nybg:     { label: 'New York Botanical Garden — Phalaenopsis care', url: 'https://libanswers.nybg.org/faq/223105' },
  unl:      { label: 'Nebraska Extension — care of annual flowers', url: 'https://extension.unl.edu/statewide/platte/Horticulture/24%20June%203%20Care%20of%20Annual%20Flowers%20to%20Promote%20Season%20Long%20Blooming.pdf' },
  uky:      { label: 'Kentucky Extension — flowering plants in containers', url: 'https://daviess.ca.uky.edu/sites/daviess.ca.uky.edu/files/20230408%20Flowering%20plants%20and%20containers.pdf' },
  askExt:   { label: 'Ask Extension — fertilizing herbs', url: 'https://ask2.extension.org/kb/faq.php?id=753082' },
}

/* days: interval while the plant is growing. winterDays: interval out of
 * season, or null for a full winter pause (the default — most houseplants rest
 * and fertilizer they can't use stays in the pot as salt). */
export const FEED_RULES = {
  foliage: {
    label: 'Foliage houseplant', days: 60, winterDays: null,
    dose: 'label strength or weaker, never stronger',
    why: 'Most houseplants need feeding only every 1–3 months from March to September, and little or none in winter.',
    sources: ['illinois', 'iowa'],
  },
  slowFoliage: {
    label: 'Slow-growing foliage', days: 90, winterDays: null,
    dose: 'half strength',
    why: 'Slow, drought-tolerant growers sit at the long end of the 1–3 month range; extra food just builds up as salt.',
    sources: ['illinois', 'iowa'],
  },
  floweringIndoor: {
    label: 'Flowering houseplant', days: 30, winterDays: null,
    dose: 'label strength or weaker, never stronger',
    why: 'Bloomers are the heavier feeders among houseplants, so they take the short end of the 1–3 month range — still only March to September.',
    sources: ['illinois', 'iowa'],
  },
  container: {
    label: 'Outdoor container bloomer', days: 14, winterDays: null,
    dose: 'water-soluble, label strength',
    why: 'Frequent watering in outdoor pots washes nitrogen out fast, so container annuals get a liquid feed every 2–3 weeks while they grow — with the pot flushed now and then.',
    sources: ['unl', 'uky'],
  },
  herb: {
    label: 'Herb', days: 42, winterDays: null,
    dose: 'half strength',
    why: 'Herbs do best on little fertilizer — too generous a feed makes them taste "off".',
    sources: ['askExt'],
  },
  cactus: {
    label: 'Desert cactus', days: 90, winterDays: null,
    dose: 'half strength, low-nitrogen',
    why: 'Cacti need feeding only once or twice a year in late spring or summer, and none in winter.',
    sources: ['umnCacti', 'mobot'],
  },
  succulent: {
    label: 'Succulent', days: 60, winterDays: null,
    dose: 'quarter to half strength',
    why: 'Succulents take three or four light feeds in the brighter months and none in winter.',
    sources: ['umnCacti', 'mobot'],
  },
  holidayCactus: {
    label: 'Forest cactus', days: 30, winterDays: null,
    dose: 'half strength',
    why: 'Holiday cacti are fed about monthly in the growing season, then reduced or stopped in fall and winter.',
    sources: ['ufHoliday'],
  },
  orchid: {
    label: 'Orchid', days: 14, winterDays: 28,
    dose: 'quarter strength',
    why: 'Orchids are fed "weakly, weekly" — a very dilute feed every week or two, less in winter, with a plain-water flush each month.',
    sources: ['aos', 'nybg'],
  },
}

export const FLUSH = {
  days: 120, // every 4–6 months; the short end while salt burn is the worry
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
    case 'herb': return FRUITING.test(h) ? 'container' : 'herb'
    case 'tree':
    case 'foliage':
    default:
      return cat.waterSummer >= 14 ? 'slowFoliage' : 'foliage'
  }
}

export function feedRule(plant, cat) {
  return FEED_RULES[feedGroup(plant, cat)]
}

/* The feeding season: March–September (Illinois Extension), mirrored for the
 * southern hemisphere. Slightly wider than the watering season in schedule.js
 * (April–September) because growth restarts with lengthening days in March,
 * before evaporation does. */
export function isFeedingSeason(date = new Date(), latitude = 20) {
  const m = date.getMonth() + 1
  return latitude >= 0 ? (m >= 3 && m <= 9) : (m <= 3 || m >= 9)
}

// First day of the next feeding season on or after `date`.
export function nextSeasonStart(date = new Date(), latitude = 20) {
  const startMonth = latitude >= 0 ? 2 : 8 // 0-based: March / September
  const y = date.getFullYear()
  const thisYear = new Date(y, startMonth, 1)
  return date <= thisYear ? thisYear : new Date(y + 1, startMonth, 1)
}

export const FEED_SEASON_LABEL = lat => (lat ?? 20) >= 0 ? 'March–September' : 'September–March'

export const flushRestsInWinter = group => group === 'cactus' || group === 'succulent'
