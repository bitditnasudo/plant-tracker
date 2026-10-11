import { describe, expect, it } from 'vitest'
import { buildPlant3D, SHAPE_IDS } from './plant3d.js'
import { CATALOG } from './catalog.js'
import { resolveAppearance } from './potOptions.js'

// Typical total height (pot included), metres: a range per shape, roughly true to life.
const HEIGHT = {
  succulent: [0.1, 0.2], cactus: [0.2, 0.36], sprout: [0.13, 0.25], flowerBunch: [0.15, 0.3], daisy: [0.25, 0.42],
  tulip: [0.3, 0.45], rose: [0.33, 0.5], leafVine: [0.12, 0.28], grassy: [0.28, 0.52], fern: [0.28, 0.5],
  peaceLily: [0.4, 0.7], snakePlant: [0.42, 0.72], monstera: [0.45, 0.9], bamboo: [0.28, 0.55], palm: [0.75, 1.25],
  tree: [0.85, 1.45], bonsai: [0.18, 0.32],
}

describe('3D plants', () => {
  it('has a shape for every icon the catalogue uses', () => {
    const used = new Set(CATALOG.map(c => c.icon))
    for (const icon of used) expect(SHAPE_IDS).toContain(icon)
    expect([...SHAPE_IDS].sort()).toEqual(Object.keys(HEIGHT).sort())
  })

  it.each(Object.entries(HEIGHT))('%s stands on the floor at a real-world height', (icon, [lo, hi]) => {
    for (const seed of ['a', 'b', 'c']) {
      const g = buildPlant3D(icon, resolveAppearance({}, { category: 'flower' }), seed) // in bloom: tallest form
      expect(g.userData.height).toBeGreaterThan(lo)
      expect(g.userData.height).toBeLessThan(hi)
      expect(g.userData.radius).toBeGreaterThan(0.03)
    }
  })

  it('is the same plant every time for one id, and different between ids', () => {
    const app = resolveAppearance({}, {})
    expect(buildPlant3D('monstera', app, 'p1').userData.height).toBe(buildPlant3D('monstera', app, 'p1').userData.height)
    const hs = new Set(['p1', 'p2', 'p3', 'p4'].map(id => buildPlant3D('monstera', app, id).userData.height.toFixed(4)))
    expect(hs.size).toBeGreaterThan(1)
  })

  it('scales with the per-plant size', () => {
    const app = resolveAppearance({}, {})
    const h1 = buildPlant3D('snakePlant', app, 'x').userData.height
    expect(buildPlant3D('snakePlant', app, 'x', 1.5).userData.height).toBeCloseTo(h1 * 1.5, 6)
  })

  it('follows the pot colour and skips flowers when not flowering', () => {
    const colorOf = g => { const c = []; g.traverse(o => o.material && c.push(o.material.color.getHexString())); return c }
    const black = buildPlant3D('cactus', resolveAppearance({ potMaterial: 'plastic', potColorId: 'black' }, {}), 's')
    expect(colorOf(black)).toContain('2b2b2b')
    const pink = resolveAppearance({ bloomColor: 'pink' }, { category: 'flower' })
    const none = resolveAppearance({ bloomColor: 'none' }, { category: 'flower' })
    expect(colorOf(buildPlant3D('flowerBunch', pink, 's'))).toContain('f3a6bd')
    expect(colorOf(buildPlant3D('flowerBunch', none, 's'))).not.toContain('f3a6bd')
  })
})
