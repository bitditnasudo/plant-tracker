import { describe, it, expect } from 'vitest'
import { mergeStates, mergePlant, stampPlant, prepareImport, differsFromRemote } from './merge.js'

const T = n => `2026-10-0${n}T10:00:00.000Z`
const base = { id: 'a', catalogId: 'monstera', nickname: 'Monty', lastWatered: '2026-09-30', lastFertilized: '2026-09-01', updatedAt: T(1) }

describe('mergePlant', () => {
  it('keeps both devices\' care logged before either synced', () => {
    const phone = stampPlant(base, { lastWatered: '2026-10-03' }, T(3))
    const ipad = stampPlant(base, { lastFertilized: '2026-10-04' }, T(4))
    const m = mergePlant(phone, ipad)
    expect(m.lastWatered).toBe('2026-10-03')
    expect(m.lastFertilized).toBe('2026-10-04')
  })

  it('a correction to an earlier date wins over the stale later date', () => {
    const mistaken = stampPlant(base, { lastWatered: '2026-10-04' }, T(4))
    const corrected = stampPlant(mistaken, { lastWatered: '2026-10-01' }, T(5))
    expect(mergePlant(mistaken, corrected).lastWatered).toBe('2026-10-01')
    expect(mergePlant(corrected, mistaken).lastWatered).toBe('2026-10-01')
  })

  it('unions the care log and honours removals (undo) from either side', () => {
    const a = { ...base, log: [{ id: 'e1', type: 'water', date: '2026-10-03' }, { id: 'e2', type: 'feed', date: '2026-10-02' }] }
    const b = { ...base, log: [{ id: 'e1', type: 'water', date: '2026-10-03' }, { id: 'e3', type: 'mist', date: '2026-10-04' }], logRemoved: ['e2'] }
    const m = mergePlant(a, b)
    expect(m.log.map(e => e.id)).toEqual(['e3', 'e1'])
    expect(m.logRemoved).toEqual(['e2'])
  })
})

describe('mergeStates', () => {
  it('a tombstone newer than the plant deletes it; a newer edit survives it', () => {
    const local = { plants: [], deleted: { a: T(3) } }
    expect(mergeStates(local, { plants: [base] }).state.plants).toHaveLength(0)
    const edited = stampPlant(base, { nickname: 'M' }, T(5))
    expect(mergeStates(local, { plants: [edited] }).state.plants).toHaveLength(1)
  })

  it('unstamped ties go to the remote copy', () => {
    const local = { plants: [{ ...base, nickname: 'L' }] }
    const remote = { plants: [{ ...base, nickname: 'R' }] }
    expect(mergeStates(local, remote).state.plants[0].nickname).toBe('R')
  })

  it('merges settings per key, so two devices\' settings edits both survive', () => {
    const local = { settings: { location: 'PC', reminderHour: 9 }, settingsUpdatedAt: T(4), settingsFieldAt: { location: T(4) } }
    const remote = { settings: { location: 'old', reminderHour: 20 }, settingsUpdatedAt: T(3), settingsFieldAt: { reminderHour: T(3) } }
    const m = mergeStates(local, remote).state
    expect(m.settings).toEqual({ location: 'PC', reminderHour: 20 })
  })

  it('differsFromRemote is false for an identical copy', () => {
    const s = { plants: [base], deleted: {}, customCatalog: [], plan: {}, settings: {}, profile: {} }
    const { state } = mergeStates(s, s)
    expect(differsFromRemote(state, s)).toBe(false)
  })
})

describe('prepareImport', () => {
  it('a restored backup brings back a deleted plant even against a newer tombstone', () => {
    const backup = { plants: [base] }
    const current = { plants: [], deleted: { a: T(5) } }
    const prepared = prepareImport(backup, current, T(9))
    expect(prepared.deleted.a).toBeUndefined()
    // remote still has the tombstone from before the import
    const merged = mergeStates(prepared, { plants: [], deleted: { a: T(5) } }).state
    expect(merged.plants.map(p => p.id)).toEqual(['a'])
  })

  it('replaces: plants missing from the backup are tombstoned, and the backup wins every field', () => {
    const extra = { ...base, id: 'b' }
    const current = { plants: [stampPlant(base, { nickname: 'newer' }, T(8)), extra] }
    const prepared = prepareImport({ plants: [base] }, current, T(9))
    expect(prepared.deleted.b).toBe(T(9))
    const merged = mergeStates(prepared, current).state
    expect(merged.plants.map(p => p.id)).toEqual(['a'])
    expect(merged.plants[0].nickname).toBe('Monty')
  })
})
