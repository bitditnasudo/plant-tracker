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
light needs, misting and fertilizing schedules, and whether they can live
outdoors). Category chips filter the grid.

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

## How rain affects watering

Research-backed behavior (sources below): rain **never automatically** counts
as a watering, because potted plants are often sheltered by eaves or their own
foliage and pots dry faster than ground soil. Instead:

1. If measurable rain (≥ 1 mm) fell yesterday at your location, every plant
   marked **Outside** gets a **red bubble** on the dashboard.
2. Tap it and answer whether the plant actually got wet.
3. If yes: rain ≥ **5 mm** counts as a full watering (schedule resets as if
   watered yesterday); lighter rain just pushes the next watering back one day.

Weather and yesterday's precipitation come from [Open-Meteo](https://open-meteo.com)
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
plan image and generated icons in IndexedDB. Use **Account → Export** for a
JSON backup you can re-import on another device.

## Google Drive sync (multi-device)

**Account → Connect Google Drive** signs in with the same OAuth client as the
Budget App (implicit redirect flow, `drive.file` scope — the app can only see
files it created). Everything — plants, floor plan, zones, windows, icons,
settings — syncs as one JSON file (`plant-tracker-sync.json`) inside a
**PLANT TRACKER** folder in your Drive.

How it behaves:
- On app open (and after connecting): pulls the Drive copy if it's newer.
- After any local change: pushes automatically ~4 s later (debounced).
- Conflicts: last write wins by timestamp; if two devices edit at once, the
  most recent push is what survives.
- Google tokens last ~1 h; when one expires the app keeps working locally and
  shows "session expired — reconnect" in Account. Reconnecting resumes sync.

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
    schedule.js    — watering/misting/fertilizing math + rain rules
    weather.js     — Open-Meteo client (forecast, yesterday rain, geocoding)
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
