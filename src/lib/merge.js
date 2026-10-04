// Merging two copies of the app state so no device can clobber another.
//
// Plants union by id. Within a plant every edited field carries its own stamp
// (plant.fieldAt[field]), so two devices logging different care on the same
// plant before syncing both survive — the phone's watering and the iPad's
// feeding — instead of the whole newer record winning. Fields nobody has
// stamped yet (pre-stamp data) follow the newer record, ties to remote.
// Deletions are tombstones in state.deleted; the care log unions by entry id
// minus entries either side removed (undo).
// Settings and profile merge per key the same way; the plan stays one unit.

export const nowIso = () => new Date().toISOString()

const LOG_CAP = 300 // per plant; the oldest fall off

// Apply a patch to a plant and stamp every field it touched.
export function stampPlant(plant, patch, at = nowIso()) {
  const fieldAt = { ...(plant.fieldAt || {}) }
  for (const k of Object.keys(patch)) {
    if (k !== 'log' && k !== 'logRemoved' && k !== 'fieldAt' && k !== 'updatedAt') fieldAt[k] = at
  }
  return { ...plant, ...patch, fieldAt, updatedAt: at }
}

// Stamp every field of a plant (an import that must win everywhere).
export function stampAllFields(plant, at = nowIso()) {
  const { log, logRemoved, fieldAt, updatedAt, ...fields } = plant
  return stampPlant(plant, fields, at)
}

function mergeLog(a = [], b = [], removedA = [], removedB = []) {
  const removed = new Set([...removedA, ...removedB])
  const byId = new Map()
  for (const e of [...b, ...a]) if (!removed.has(e.id)) byId.set(e.id, e)
  return [...byId.values()]
    .sort((x, y) => (y.date || '').localeCompare(x.date || '') || (y.at || '').localeCompare(x.at || ''))
    .slice(0, LOG_CAP)
}

// Field-level merge of two objects carrying `stamps` maps. `base` is the copy
// unstamped fields come from.
function mergeFields(base, other, baseStamps = {}, otherStamps = {}) {
  const out = { ...base }
  const stamps = { ...baseStamps }
  for (const k of new Set([...Object.keys(baseStamps), ...Object.keys(otherStamps)])) {
    const bt = baseStamps[k] || ''
    const ot = otherStamps[k] || ''
    if (ot > bt) {
      if (k in other) out[k] = other[k]
      else delete out[k]
      stamps[k] = ot
    }
  }
  return { out, stamps }
}

export function mergePlant(local, remote) {
  if (!local) return remote
  if (!remote) return local
  const localNewer = (local.updatedAt || '') > (remote.updatedAt || '')
  const base = localNewer ? local : remote
  const other = localNewer ? remote : local
  const { out, stamps } = mergeFields(base, other, base.fieldAt || {}, other.fieldAt || {})
  const logRemoved = [...new Set([...(local.logRemoved || []), ...(remote.logRemoved || [])])].slice(-LOG_CAP)
  const log = mergeLog(local.log, remote.log, local.logRemoved, remote.logRemoved)
  const merged = { ...out }
  if (Object.keys(stamps).length) merged.fieldAt = stamps; else delete merged.fieldAt
  if (log.length) merged.log = log; else delete merged.log
  if (logRemoved.length) merged.logRemoved = logRemoved; else delete merged.logRemoved
  return merged
}

export function mergeStates(local, remote) {
  const deleted = { ...(remote.deleted || {}) }
  for (const [id, ts] of Object.entries(local.deleted || {})) {
    if (!deleted[id] || ts > deleted[id]) deleted[id] = ts
  }

  const byId = new Map()
  for (const p of remote.plants || []) byId.set(p.id, p)
  for (const p of local.plants || []) byId.set(p.id, mergePlant(p, byId.get(p.id)))
  const plants = [...byId.values()].filter(p => !(deleted[p.id] && deleted[p.id] > (p.updatedAt || '')))

  const custom = new Map()
  for (const e of remote.customCatalog || []) custom.set(e.id, e)
  for (const e of local.customCatalog || []) custom.set(e.id, e)

  const planFromLocal = !!local.plan?.updatedAt && local.plan.updatedAt >= (remote.plan?.updatedAt || '')
  const settingsFromLocal = !!local.settingsUpdatedAt && local.settingsUpdatedAt >= (remote.settingsUpdatedAt || '')
  const profileFromLocal = !!local.profileUpdatedAt && local.profileUpdatedAt >= (remote.profileUpdatedAt || '')

  const s = settingsFromLocal
    ? mergeFields(local.settings || {}, remote.settings || {}, local.settingsFieldAt, remote.settingsFieldAt)
    : mergeFields(remote.settings || {}, local.settings || {}, remote.settingsFieldAt, local.settingsFieldAt)
  const p = profileFromLocal
    ? mergeFields(local.profile || {}, remote.profile || {}, local.profileFieldAt, remote.profileFieldAt)
    : mergeFields(remote.profile || {}, local.profile || {}, remote.profileFieldAt, local.profileFieldAt)

  return {
    planFromLocal,
    state: {
      ...remote, ...local,
      plants,
      deleted,
      customCatalog: [...custom.values()],
      plan: planFromLocal ? local.plan : remote.plan,
      settings: s.out,
      settingsFieldAt: s.stamps,
      settingsUpdatedAt: [local.settingsUpdatedAt, remote.settingsUpdatedAt].filter(Boolean).sort().pop() || null,
      profile: p.out,
      profileFieldAt: p.stamps,
      profileUpdatedAt: [local.profileUpdatedAt, remote.profileUpdatedAt].filter(Boolean).sort().pop() || null,
      classificationsBackfilledAt: [local.classificationsBackfilledAt, remote.classificationsBackfilledAt].filter(Boolean).sort().pop() || null,
    },
  }
}

// Does `merged` hold anything the remote copy lacks? Then it must be pushed.
const SYNCED_KEYS = ['plants', 'deleted', 'customCatalog', 'plan', 'settings', 'settingsFieldAt', 'profile', 'profileFieldAt']
const isEmptyObj = v => !!v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length
const norm = v => (v === undefined || isEmptyObj(v) ? null : v)
export function differsFromRemote(merged, remote) {
  return SYNCED_KEYS.some(k => JSON.stringify(norm(merged[k])) !== JSON.stringify(norm(remote[k])))
}

// Prepare an imported backup so it wins over every other device: re-stamp it
// as a fresh edit, tombstone plants the backup doesn't have, and clear any
// tombstones for the plants it brings back.
export function prepareImport(imported, current, at = nowIso()) {
  const plants = (imported.plants || []).map(pl => stampAllFields(pl, at))
  const keep = new Set(plants.map(pl => pl.id))
  const deleted = { ...(current.deleted || {}), ...(imported.deleted || {}) }
  for (const id of keep) delete deleted[id]
  for (const pl of current.plants || []) if (!keep.has(pl.id)) deleted[pl.id] = at
  const allAt = obj => Object.fromEntries(Object.keys(obj || {}).map(k => [k, at]))
  return {
    ...imported,
    plants,
    deleted,
    plan: { ...(imported.plan || {}), updatedAt: at },
    settingsUpdatedAt: at,
    settingsFieldAt: allAt(imported.settings),
    profileUpdatedAt: at,
    profileFieldAt: allAt(imported.profile),
  }
}
