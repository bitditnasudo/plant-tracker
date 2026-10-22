# Plant Tracker 🪴

A mobile-first plant watering tracker with a floor-plan view of your home.
Built with the same stack and conventions as the Budget Tracker (React + Vite, vanilla CSS, Vercel-ready).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

Deploy exactly like the budget app: `vercel` (the included `vercel.json` handles SPA routing).

**API keys** live in `.env.local` (gitignored):
`VITE_PERENUAL_KEY` (online plant search) and `VITE_GEMINI_KEY` (icon
generation). They pre-fill the app automatically; the Account tab fields
override them if set. Restart the dev server after editing `.env.local`.
For a Vercel deploy, add them as environment variables in the dashboard —
but note Vite embeds `VITE_*` values in the shipped JS, so keep a deployed
app private if the keys matter.

## The three tabs

**Dashboard** — welcome header, search, live weather for your location (current
conditions, humidity, wind, rain chance, and whether it rained yesterday), and
your plants sorted by watering urgency. Each card shows last-watered, a
days-left tag, and one-tap "watered" / "misted" buttons. Tapping a card opens
the full care sheet (water/mist/fertilize intervals, ideal light, nickname,
icon generation, remove).

**Plan** — upload your floor plan as **PDF or SVG** (PNG/JPG also accepted).
Then:
- **Windows**: tap a wall to add a window; tap a window to rotate its facing
  45° at a time. Its compass direction and expected light (direct / partial /
  shade, hemisphere-aware) show in the tooltip.
- **Light zones**: drag a rectangle over a room, name it, pick its light. New
  plants placed inside (and plants already there) get assigned to the zone; the
  care sheet warns when a plant's ideal light doesn't match its room.
- **Set scale / Measure**: tap the two ends of a measurement you know (a wall,
  a door), type its real length once — after that the same tool measures any
  distance on the plan.
- **North**: set the building orientation with a dial; window facings use it.
- Pinch / scroll to zoom, drag to pan. **Press and hold a plant until it
  shakes**, then drag to re-position (tap anywhere else to stop). The red/amber
  /green tag on each marker is days until watering.

**Account** — name + avatar (drawn in the same stylized look as the plant
icons), location (GPS or city search), Gemini API key, JSON export/import of
all your data, and app version info.

The **＋ button** anchored at the right edge adds a plant from the built-in
catalogue (~120 species — foliage plants, cacti, succulents, flowering plants,
herbs & edibles, trees & palms — each with per-season watering intervals,
light needs, misting schedules, and whether they can live outdoors).
Feeding is not per species — see below. Category chips filter the grid.

**Online catalogue search (optional):** add a free
[Perenual API key](https://perenual.com) in Account and the Add Plant sheet
gains a "Search online" button covering 10,000+ species. Picking a result
maps Perenual's data into the app's schema (watering benchmark/keyword →
interval days, sunlight → light level, indoor flag → outdoor capability) and
saves it to your personal catalogue, so it works offline afterwards like any
built-in plant. Free-tier caveats the app handles for you: ~100 requests/day,
and full care data only covers roughly the first 3,000 species IDs — results
beyond that are tagged "care data estimated" and import with sensible
defaults you can edit (watering interval + light) before saving.

## How the watering interval is calculated

**It's a soil check, not a pour.** Every extension source says to feel the
soil rather than water by the calendar: water when it's dry about an inch
down ([UConn](https://extension.uconn.edu/2013/12/24/watering-houseplants/),
[Iowa State](https://yardandgarden.extension.iastate.edu/faq/how-often-should-houseplants-be-watered-during-winter-months);
[Illinois](https://extension.illinois.edu/houseplants/watering) says two
inches, and that wilting can mean over-watering too). So the interval is when
to check: reminders, cards and the care sheet say so, and "Still damp — check
tomorrow" (on the care sheet, or the clock button in the bell's Water tab)
pushes the check a day without logging a watering.

**Each plant learns its own interval.** The species figures are generic;
your pots, mix and rooms are not. Every hand watering compares how long the
plant actually went with what was scheduled and moves a per-plant factor
halfway towards it: watering early (already dry) shortens the next interval,
watering late after a "still damp" check lengthens it. Late with no damp
check proves nothing and changes nothing, a watering from the trip card
doesn't count, one watering moves it at most a third, and it stays within
half to double the model. The care sheet's watering model shows the factor
and can forget it; a manual override switches learning off.

**Summer or winter is decided by the weather, not the month.** Each species
has a summer and a winter interval (bundled catalogue figures, or Perenual's
`watering_general_benchmark` for imports — neither is cited per species).
Where between them a plant sits comes from FAO-56 reference
evapotranspiration (ET0) at the saved location, from Open-Meteo: the past
week's average is placed on the location's own yearly range (its least and
most evaporative month over the past 12 months, from the archive API, cached
for 30 days) and the interval slides in proportion. In Querétaro that range
runs from about 3.4 mm/day (December) to 6.9 (April), so the hot, dry March
counts as near-summer and the cloudy rainy season sits in between — the old
April–September calendar had both backwards. Only the last 10 days of
weather count; without them (offline, first launch) this month's usual
evaporation stands in, and with no climate data at all the calendar does; where the year is flatter than 0.5 mm/day
the growing-season figure applies. ET0 is an outdoor measure, so for indoor
plants it stands in for the season, damped by the room.

For **outdoor** plants, in this order (all constants in `src/lib/schedule.js`):

1. **Species base** — the evaporation-weighted figure above.
2. **Outdoor-pot ceiling** (`OUTDOOR_POT_CAP_DAYS`) — the species figure
   assumes sheltered ground. Container growers report far shorter intervals,
   so an outdoor pot is capped at **4 days** (high wind-sensitivity) or
   **7 days** (normal); drought-adapted plants are exempt. Relaxes up to
   double in the least drying weather. The cap only ever shortens.
3. **Wind** (`WIND_TIERS`) — average daily wind since that plant's last
   watering: <10 km/h no change, 10–20 km/h −17.5%, >20 km/h −32.5%.
   Wind history comes from Open-Meteo with `past_days=30`, cached locally, so
   it backfills gaps and re-tightens the estimate as a plant waits.
4. **Wind sensitivity** (`WIND_SENSITIVITY`) multiplies that cut — low ×0.3,
   normal ×1.0, high ×1.3 — derived automatically from Perenual's
   `drought_tolerant`, `type`, `watering` and `growth_rate`, falling back to
   taxonomy for the species the free API tier withholds.

**Indoor plants skip steps 2–4 entirely.** Both the classification and the
final number can be overridden per plant in its care sheet.

Calibrated against container-growing sources: potted allamanda every 1–2 days
at 21–32 °C ([greg.app](https://greg.app/how-often-to-water-bush-allamanda/)),
potted lantana daily to every two days in hot dry regions
([Gardening Know How](https://www.gardeningknowhow.com/ornamental/flowers/lantana/watering-lantana-plants.htm)),
and the general container rule of every 1–2 days in summer with wind named as
an accelerant ([Proven Winners](https://www.provenwinners.com/learn/water-your-way-happy-plants),
[Old Farmer's Almanac](https://www.almanac.com/how-water-flowers-watering-tips)).

## How feeding and soil flushes are scheduled

No open plant database carries sourced, per-species feeding intervals
(Perenual has no fertilizer field; Trefle and USDA PLANTS only describe growing
conditions). What can be cited is university-extension and botanical-garden
guidance, written per plant group, so `src/lib/feeding.js` maps each plant to a
group and every rule links its sources on the care sheet:

| Group | Feed every | Winter | Sources |
|---|---|---|---|
| Foliage houseplants, trees & palms | 60 d | by location | [Illinois](https://extension.illinois.edu/houseplants/care), [Iowa State](https://yardandgarden.extension.iastate.edu/faq/should-houseplants-be-fertilized-winter) |
| Slow foliage (snake plant, ZZ…) | 90 d | by location | same |
| Flowering houseplants (indoors) | 30 d | by location | same |
| Ornamentals in outdoor pots | 14 d | by location | [Purdue](https://www.purdue.edu/hla/sites/yardandgarden/revive-annual-flowers/), [Kentucky](https://daviess.mgcafe.uky.edu/sites/daviess.ca.uky.edu/files/20230408%20Flowering%20plants%20and%20containers.pdf) |
| Potted vegetables & fruit | 7 d, half strength | by location | Kentucky |
| Herbs | 14 d | every 28 d | [Illinois herbs](https://extension.illinois.edu/news-releases/keep-growing-herbs-indoors-fall-winter) |
| Desert cacti | 120 d | paused | [UMN](https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/cacti-and-succulents), [Missouri BG](https://www.missouribotanicalgarden.org/Portals/0/Gardening/Gardening%20Help/Factsheets/Cactus%20and%20Succulents10.pdf) |
| Succulents | 60 d | paused | same |
| Holiday cacti | 60 d | paused | [UF/IFAS](https://blogs.ifas.ufl.edu/flaglerco/2023/11/20/a-guide-to-holiday-cacti-care-the-basics-pt-1/), Missouri BG |
| Orchids | 7 d, quarter strength | every 14 d | [AOS](https://www.aos.org/orchids/articles/fertilize-weakly-weekly), [NYBG](https://libanswers.nybg.org/faq/223105) |

Each rule stores what its sources actually say (`says`) separately from
where the app had to pick a number inside a range or go beyond them
(`choice`), and the care sheet shows both, so an app choice is never passed
off as cited. All links were checked against the cited passage on 2026-10-19.

**Adapting to your location.** The sources tie the winter rest to "the short
days of winter" and are written for cold-winter places, so the app reads the
saved location (Account) for exactly that: the length of its shortest day,
worked out from latitude. The thresholds are the app's own, and the care sheet
says so and names your day length:

| Band | Shortest day | Where (e.g.) | Feeding |
|---|---|---|---|
| Tropical | ≥ 11 h 15 m (within ~12°) | Singapore, Quito, Lima | all year at the season rate; cacti every 180 d, succulents 90 d |
| Mild | ≥ 10 h 25 m (~12–25°) | Querétaro (10 h 45 m), São Paulo | Oct–Feb half as often ("by location" above); cacti and succulents still rest |
| Cold | shorter | Madrid, Chicago, Sydney | paused out of season, as the sources say |
| No location saved | — | — | treated as cold, northern, until one is set |

The season is March–September, mirrored (September–March) south of the
equator. A feed that falls due during a pause waits for the season to start
instead of showing as overdue, since fertilizer a resting plant can't use stays
in the pot as salt. The group is resolved when the schedule is read, so nothing
is stored per plant and changing your location re-plans every plant at once.

**Soil flush:** every 120 days (orchids every 30) the app asks you to run plain
water through the pot to wash out fertilizer salts (Illinois Extension: every
4–6 months). Plants that have never been flushed are due immediately; new
plants start the clock on the day they're added. Cacti and succulents wait for
the growing season rather than getting a deep soak while dormant.

## How rain affects watering

Research-backed behavior (sources below): rain **never automatically** counts
as a watering, because potted plants are often sheltered by eaves or their own
foliage and pots dry faster than ground soil. Instead:

1. If measurable rain (≥ 1 mm) fell at your location on any day since a
   plant's last watering (looking back up to 7 days, so a few days away from
   the app still get asked about), every plant set to **Outside** gets a
   **red bubble** on the dashboard. Inside/Outside is set per plant — or per
   room, when a floor-plan zone is marked outdoors.
2. Tap it and answer whether the plant actually got wet — one answer covers
   every pending rain day.
3. "Soaked" logs a watering dated to the last rain day; "light sprinkle" just
   pushes the next watering back one day.

Weather and daily precipitation come from [Open-Meteo](https://open-meteo.com)
(free, no API key). Watering intervals switch between growing-season and
dormant values based on the month and your hemisphere.

Sources: [Ideal Home — watering containers after rain](https://www.idealhome.co.uk/garden/garden-advice/do-you-need-to-water-plants-in-containers-if-it-rains),
[Green Thumb Nursery](https://www.greenthumb.com/do-all-your-plants-receive-sufficient-water-when-it-rains/),
[How much rain counts as watering](https://worldscoolestraingauge.com/blogs/archimedes-and-me/how-much-rain-counts-as-watering).

## Gemini plant icons (optional)

Every catalogue plant ships with a built-in stylized SVG icon in the app's
matte-green palette. If you add a **Google AI Studio API key** in Account
(free tier at https://aistudio.google.com/apikey — note that a Gemini Pro
*subscription* alone does not include API access), the plant care sheet gets a
"Generate stylized icon with Gemini" button. It uses your prompt template
(adapted: the image references were replaced with inline style descriptions,
since the API call sends no reference images) filled with the plant's name,
its description, and the pot type/color you chose when adding it. Generated
icons replace the built-in ones on the dashboard and the floor plan.

## Where data lives

Everything is stored on-device: structured state in `localStorage`, the floor
plan image, generated icons and care-log photos in IndexedDB. Use
**Account → Export** for a JSON backup. **Import** shows what the file holds
and asks before replacing anything; an imported backup wins over every other
device (it is re-stamped as a fresh edit), and plants not in it are removed.

## Google Drive sync (multi-device)

**Account → Connect Google Drive** signs in with the same OAuth client as the
Budget App (implicit redirect flow, `drive.file` scope — the app can only see
files it created). Everything — plants, floor plan, zones, windows, icons,
settings — syncs as one JSON file (`plant-tracker-sync.json`) inside a
**PLANT TRACKER** folder in your Drive.

How it behaves:
- On app open, and whenever the app comes back to the foreground: checks the
  Drive file's version (Drive's own counter — no device clocks involved) and
  pulls only if it changed.
- After any local change: pushes ~4 s later, or immediately when the app is
  hidden. Unsent changes are remembered across restarts, so an edit made just
  before closing the app is uploaded on the next launch.
- Conflicts: a field-level merge (`src/lib/merge.js`). Each edited field of a
  plant carries its own timestamp, so the phone logging a watering and the
  iPad logging a feed both survive; deletions are tombstones; the care log
  unions entries; settings merge per key. Covered by `npm test`.
- Status is honest: Account shows offline / waiting to upload / failed, and an
  expired Google session shows a banner with Reconnect on every tab.
- A sync file deleted from Drive is recreated rather than wedging sync.
- **Daily snapshots:** once a day the sync file is copied to
  `plant-tracker-YYYY-MM-DD.json` in the same folder; the newest 14 are kept
  (older ones go to the Drive trash). Account → Restore a snapshot.
- The OAuth redirect carries a random `state` that the callback verifies.
- **Sign-in renews itself.** Sign-in uses the authorization-code flow with
  offline access, so Google returns a refresh token; when the hour-long access
  token runs out the app quietly gets a new one. The code/refresh swap needs
  the OAuth client secret, held only by the `api/google-token.js` Vercel
  function — set `GOOGLE_CLIENT_SECRET` in the Vercel project (and in
  `.env.local` for `npm run dev`). Without it the app falls back to the old
  one-hour token. If the Google Cloud consent screen is still in **Testing**,
  Google expires refresh tokens after 7 days; publish it to avoid that.

**Care reminders (Google Calendar):** with Drive connected, Account →
"Calendar reminders" creates one event per plant on its next watering date
(and optionally misting, feeding and soil-flush dates) at the hour you choose, in your
primary Google Calendar, with a popup notification on every signed-in device
plus an email reminder from Google. Overdue plants are reminded at the next
full hour instead of on a time that has already passed.
Events update automatically ~5 s after anything changes the schedule
(watering, rain answers, adding/removing plants) and are cleaned up when
you turn the toggle off. Requires the calendar permission — if you
connected before this feature existed, press "Connect Google Drive" once
more to grant it.

Setup on a new device: open the app, run through onboarding (or skip), then
Connect Google Drive — it pulls your existing data. For a deployed copy
(Vercel), first add the deployed URL to the OAuth client in Google Cloud
Console: Authorized JavaScript origins (`https://YOUR-APP.vercel.app`) and
redirect URIs (`https://YOUR-APP.vercel.app/auth/callback`), and set
`VITE_GOOGLE_CLIENT_ID` (plus the other keys) in Vercel's env settings.

## Project structure

```
src/
  lib/
    catalog.js     — bundled plant catalogue (care data from open sources)
    perenual.js    — online species search (Perenual API → catalogue schema)
    schedule.js    — watering/misting/feeding/flush math + rain rules (+ tests)
    feeding.js     — cited feeding & flush rules per plant group (+ tests)
    merge.js       — multi-device merge: field stamps, care log, import (+ tests)
    weather.js     — Open-Meteo client (forecast, daily rain, geocoding)
    planFile.js    — PDF (pdf.js) / SVG / image → raster plan converter
    gemini.js      — icon generation (gemini-2.5-flash-image)
    idb.js         — tiny IndexedDB key-value helper for large blobs
    store.jsx      — app state, persistence, weather polling
  components/
    PlantIcons.jsx — built-in stylized SVG icon set + avatar
    PlantCard.jsx, AddPlantModal.jsx, PlantDetailModal.jsx, RainModal.jsx
  pages/
    Dashboard.jsx, PlanView.jsx, Account.jsx
```
