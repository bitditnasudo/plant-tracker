import { useMemo, useState, useEffect, useRef } from 'react'
import { Search, Bell, Sparkles, Check, ArrowDownAZ, ArrowDownZA, AlarmClock, Plus, Waves, Clock3, CalendarPlus, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { waterDaysLeft, mistDaysLeft, fertilizeDaysLeft, flushDaysLeft, needsRainAnswer, pendingRain, rainWhen } from '../lib/schedule.js'
import { getCatalogPlant } from '../lib/catalog.js'
import { PlantCard } from '../components/PlantCard.jsx'
import { RainModal } from '../components/RainModal.jsx'
import { PlantDetailModal } from '../components/PlantDetailModal.jsx'
import { Avatar, Sprout, WateringCan, SprayBottle } from '../components/PlantIcons.jsx'
import { WeatherCard, TripCard, useTripNeeds } from '../components/DashWidgets.jsx'

// Desktop layout (the sidebar breakpoint): the list tools move into the header.
const WIDE = '(min-width: 700px)'
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches)
  useEffect(() => {
    const mq = window.matchMedia(WIDE)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

const dueLabel = left => left < 0 ? `${-left} day${left === -1 ? '' : 's'} overdue` : 'Due today'

const SORTS = {
  due:    { label: 'Due first', Icon: AlarmClock },
  az:     { label: 'A–Z', Icon: ArrowDownAZ },
  za:     { label: 'Z–A', Icon: ArrowDownZA },
  // the chip shows `short` where the menu has room for the whole label
  newest: { label: 'Newest added', short: 'Newest', Icon: CalendarPlus },
}
const WHERE = { all: 'All', inside: 'Inside', outside: 'Outside' }
const NO_FILTER = { where: 'all', room: null }

export default function Dashboard({ onAdd }) {
  const { state, weather, windLog, et0Climate, setSettings, logCare, logCareJobs, markStillDamp, tripOpen, setTripOpen } = useStore()
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
  // the sort menu and the filter panel — one open at a time
  const [menu, setMenu] = useState(null)
  const sortRef = useRef(null)
  const filterRef = useRef(null)
  // Saved like the sort, so the list comes back the way it was left. A room
  // that has since been deleted simply stops filtering.
  const savedFilter = { ...NO_FILTER, ...state.settings.plantFilter }
  const roomIds = new Set(state.plan.zones.map(z => z.id))
  const filter = {
    where: WHERE[savedFilter.where] ? savedFilter.where : 'all',
    room: savedFilter.room === 'none' || roomIds.has(savedFilter.room) ? savedFilter.room : null,
  }
  const filterCount = (filter.where !== 'all') + (filter.room !== null)
  const setFilter = f => setSettings({ plantFilter: { ...filter, ...f } })
  const wide = useWide()
  const lat = state.settings.location?.lat

  // what's actually due today, straight from the schedule
  const { dueWater, dueMist, dueFeed, dueFlush, dueCombo, dueRain, urgency } = useMemo(() => {
    const water = []
    const mist = []
    const feed = []
    const flush = []
    const rain = []
    const urgency = new Map() // plantId -> most overdue chore (≤0 means needs care today)
    for (const plant of state.plants) {
      const cat = getCatalogPlant(plant.catalogId)
      if (!cat) continue
      const w = waterDaysLeft(plant, lat)
      if (w <= 0) water.push({ plant, cat, left: w })
      const m = mistDaysLeft(plant)
      if (m !== null && m <= 0) mist.push({ plant, cat, left: m })
      const f = fertilizeDaysLeft(plant, lat)
      if (f !== null && f <= 0) feed.push({ plant, cat, left: f })
      const fl = flushDaysLeft(plant, lat)
      if (fl !== null && fl <= 0) flush.push({ plant, cat, left: fl })
      const askRain = needsRainAnswer(plant, weather)
      if (askRain) rain.push({ plant, cat, left: 0 })
      urgency.set(plant.id, Math.min(w, m ?? Infinity, f ?? Infinity, fl ?? Infinity, askRain ? 0 : Infinity))
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
      dueFlush: flush.sort(byUrgency),
      dueCombo: combo.sort(byUrgency),
      dueRain: rain,
      urgency,
    }
  // windLog / et0Climate: the schedule module reads them, so a weather or
  // climate update must recompute what's due even when no plant changed
  }, [state.plants, lat, weather, windLog, et0Climate, comboPins])

  const tripNeeds = useTripNeeds()
  const tripFilter = tripOpen && tripNeeds.size > 0

  const notifTabs = useMemo(() => [
    { key: 'combo', label: 'Combo', items: dueCombo, Art: null,        type: null,    verb: 'combo' },
    { key: 'water', label: 'Water', items: dueWater, Art: WateringCan, type: 'water', verb: 'watering' },
    { key: 'mist',  label: 'Mist',  items: dueMist,  Art: SprayBottle, type: 'mist',  verb: 'misting' },
    { key: 'feed',  label: 'Feed',  items: dueFeed,  Art: null,        type: 'feed',  verb: 'feeding' },
    { key: 'flush', label: 'Flush', items: dueFlush, Art: null,        type: 'flush', verb: 'soil flush', Icon: Waves },
    { key: 'rain',  label: 'Rain',  items: dueRain,  Art: null,        type: null,    verb: 'rain' },
  ], [dueCombo, dueWater, dueMist, dueFeed, dueFlush, dueRain])

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

  const totalDue = dueCombo.length + dueWater.length + dueMist.length + dueFeed.length + dueFlush.length + dueRain.length
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

  // the sort menu and filter panel close the same way the bell does
  useEffect(() => {
    if (!menu) return
    const ref = menu === 'sort' ? sortRef : filterRef
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setMenu(null) }
    const onKey = e => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

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
    // Plants are appended as they're added, so list position is the add order.
    // addedAt (stamped since this sort existed) wins where both have it, and
    // anything carrying one is newer than anything that doesn't.
    const pos = new Map(state.plants.map((p, i) => [p.id, i]))
    const byAdded = (a, b) =>
      (!!a.addedAt - !!b.addedAt) || (a.addedAt || '').localeCompare(b.addedAt || '') || pos.get(a.id) - pos.get(b.id)
    return [...state.plants]
      .filter(p => !tripFilter || tripNeeds.has(p.id))
      .filter(p => filter.where === 'all' || (filter.where === 'outside') === !!p.isOutside)
      .filter(p => filter.room === null || (filter.room === 'none' ? !roomIds.has(p.zoneId) : p.zoneId === filter.room))
      .filter(p => {
        if (!q) return true
        const cat = getCatalogPlant(p.catalogId)
        return (p.nickname || '').toLowerCase().includes(q) ||
          (cat?.name || '').toLowerCase().includes(q) ||
          (cat?.latin || '').toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (sort === 'due') return (urgency.get(a.id) ?? 99) - (urgency.get(b.id) ?? 99) || byName(a, b)
        if (sort === 'newest') return byAdded(b, a)
        return sort === 'za' ? -byName(a, b) : byName(a, b)
      })
  // roomIds is rebuilt from state.plan.zones every render; the filter's two
  // fields are primitives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.plants, state.plan.zones, query, sort, urgency, tripFilter, tripNeeds, filter.where, filter.room])

  // Only rooms that hold a plant are worth offering, alphabetically, plus a
  // "No room" bucket when some plants were never placed.
  const roomOptions = useMemo(() => {
    const count = new Map()
    for (const p of state.plants) {
      const k = roomIds.has(p.zoneId) ? p.zoneId : 'none'
      count.set(k, (count.get(k) || 0) + 1)
    }
    const rooms = state.plan.zones
      .filter(z => count.has(z.id))
      .map(z => ({ id: z.id, name: z.name || 'Unnamed room', n: count.get(z.id) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
    if (count.has('none') && rooms.length) rooms.push({ id: 'none', name: 'No room', n: count.get('none') })
    return rooms
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.plants, state.plan.zones])

  // "Due first" splits the list: what needs you today, then everything else
  const groups = tripFilter
    ? [{ key: 'trip', title: 'Water before your trip', items: plants }]
    : sort === 'due'
    ? [
        { key: 'today', title: 'Needs care today', items: plants.filter(p => (urgency.get(p.id) ?? 99) <= 0) },
        { key: 'later', title: 'Later', items: plants.filter(p => (urgency.get(p.id) ?? 99) > 0) },
      ].filter(g => g.items.length)
    : [{ key: 'all', title: null, items: plants }]

  // keep modal targets pointing at fresh plant objects
  const freshRain = rainPlant && state.plants.find(p => p.id === rainPlant.id)
  const freshDetail = detailPlant && state.plants.find(p => p.id === detailPlant.id)
  const SortIcon = SORTS[sort].Icon

  const narrowed = filterCount > 0 || !!query.trim()
  const tools = (
    <>
      <h2 className="tools-title">My Plants</h2>
      <div className="search-bar">
        <Search size={17} />
        <input placeholder="Search" aria-label="Search plants" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="section-head-aside">
        <span className="sub">{narrowed ? `${plants.length} of ${state.plants.length}` : `${state.plants.length} total`}</span>

        <div className="popover-wrap" ref={filterRef}>
          <button
            className={`chip${filterCount ? ' is-active' : ''}`}
            aria-label={filterCount ? `Filter, ${filterCount} on` : 'Filter'}
            aria-expanded={menu === 'filter'}
            onClick={() => setMenu(m => m === 'filter' ? null : 'filter')}
          >
            <SlidersHorizontal size={14} />
            <span className="chip-label">Filter</span>
            {filterCount > 0 && <span className="chip-count">{filterCount}</span>}
          </button>
          {menu === 'filter' && (
            <div className="popover popover-menu popover-filter" role="dialog" aria-label="Filter plants">
              <div className="menu-label">Where</div>
              <div className="seg" role="radiogroup" aria-label="Inside or outside">
                {Object.entries(WHERE).map(([k, label]) => (
                  <button
                    key={k} role="radio" aria-checked={filter.where === k}
                    className={filter.where === k ? 'is-active' : ''}
                    onClick={() => setFilter({ where: k })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="menu-label">Room</div>
              {roomOptions.length === 0 ? (
                <p className="menu-note">Draw rooms on the Plan and give your plants a room to filter by it.</p>
              ) : (
                <div className="filter-rooms" role="radiogroup" aria-label="Room">
                  {[{ id: null, name: 'All rooms', n: state.plants.length }, ...roomOptions].map(r => (
                    <button
                      key={r.id ?? 'all'} role="radio" aria-checked={filter.room === r.id}
                      className={`chip${filter.room === r.id ? ' is-active' : ''}`}
                      onClick={() => setFilter({ room: r.id })}
                    >
                      {r.name} <span className="chip-n">{r.n}</span>
                    </button>
                  ))}
                </div>
              )}

              {filterCount > 0 && (
                <button className="btn btn-sm btn-soft btn-block menu-clear" onClick={() => setFilter(NO_FILTER)}>
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        <div className="popover-wrap" ref={sortRef}>
          <button
            className="chip"
            aria-label={`Sort: ${SORTS[sort].label}`}
            aria-haspopup="menu" aria-expanded={menu === 'sort'}
            onClick={() => setMenu(m => m === 'sort' ? null : 'sort')}
          >
            <SortIcon size={14} />
            <span className="chip-label">{SORTS[sort].short || SORTS[sort].label}</span>
            <ChevronDown size={14} className="chip-caret" />
          </button>
          {menu === 'sort' && (
            <div className="popover popover-menu popover-sort" role="menu" aria-label="Sort plants">
              {Object.entries(SORTS).map(([k, { label, Icon }]) => (
                <button
                  key={k} role="menuitemradio" aria-checked={sort === k}
                  className={`menu-item${sort === k ? ' is-active' : ''}`}
                  onClick={() => { setSettings({ plantSort: k }); setMenu(null) }}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  {sort === k && <Check size={16} className="menu-check" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )

  return (
    <div className="main-content main-content-dashboard">
      {/* Phones pin only the header and the search row; the weather card
          scrolls away between them. Wider screens pin the whole block. */}
      <div className="dash-top">
      <div className="header dash-head">
        {/* desktop: the greeting lives in the sidebar */}
        {!wide && (
          <>
            <div className="avatar"><Avatar /></div>
            <div className="hello">
              <small>Welcome,</small>
              <b>{state.profile.name || 'Plant lover'}!</b>
            </div>
          </>
        )}
        {/* desktop: title, search and sort share the header row */}
        {wide && <div className="head-tools">{tools}</div>}
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
                            : activeTab.key === 'water' ? `Check the soil · ${dueLabel(left).toLowerCase()}`
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
                      {/* a soil check can end in "not yet": snooze to tomorrow, no watering logged */}
                      {activeTab.key === 'water' && (
                        <button
                          className="n-log n-log-feed"
                          aria-label={`Still damp: check ${plant.nickname || cat?.name} again tomorrow`}
                          title="Still damp — check tomorrow"
                          onClick={e => { e.stopPropagation(); markStillDamp(plant.id) }}
                        >
                          <Clock3 />
                        </button>
                      )}
                      {activeTab.type && (
                        <button
                          className={`n-log${activeTab.Art ? '' : ' n-log-feed'}`}
                          aria-label={`Log ${activeTab.verb} for ${plant.nickname || cat?.name}`}
                          title={`Log ${activeTab.verb}`}
                          onClick={e => { e.stopPropagation(); logCare([plant.id], activeTab.type) }}
                        >
                          {activeTab.Art ? <activeTab.Art /> : activeTab.Icon ? <activeTab.Icon /> : <Sparkles />}
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
        <WeatherCard />
        <TripCard />
      </div>

      {!wide && <div className="dash-tools">{tools}</div>}
      </div>

      {plants.length === 0 ? (
        <div className="empty">
          <Sprout className="big" />
          <h3>{state.plants.length ? 'No plants match' : 'No plants yet'}</h3>
          <p>
            {!state.plants.length ? 'Add your first plant from the catalogue.'
              : filterCount ? 'Nothing fits these filters.' : 'Try a different search.'}
          </p>
          {filterCount > 0 && state.plants.length > 0 && (
            <button className="btn btn-soft" onClick={() => setFilter(NO_FILTER)}>Clear filters</button>
          )}
          {!state.plants.length && onAdd && (
            <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> Add your first plant</button>
          )}
        </div>
      ) : (
        groups.map(g => (
          <section key={g.key} className="plant-group">
            {g.title && (
              <h3 className="group-title">
                {g.title} <span className="sub">{g.items.length}</span>
                {g.key === 'trip' && <button type="button" className="link-btn group-link" onClick={() => setTripOpen(false)}>Show all plants</button>}
              </h3>
            )}
            <div className="card-grid">
              {g.items.map(p => (
                <PlantCard key={p.id} plant={p} onOpen={setDetailPlant} onRain={setRainPlant} trip={tripNeeds.get(p.id)} />
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
