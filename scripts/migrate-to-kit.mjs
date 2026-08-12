/* ============================================================================
   One-shot codemod: Plant Tracker class names → Vantarco UI kit.
   ============================================================================
   Run once, from the repo root:   node scripts/migrate-to-kit.mjs

   Kept in the repo rather than run and thrown away, because it IS the record of
   what the mechanical half of the migration did — 170-odd call sites that were
   renamed by rule, not by judgement. Everything it could not do by rule (moving
   the action button into the nav bar, folding inline styles into classes,
   mapping ~16 font sizes onto 7 tokens) was done by hand and is not in here.

   Two conventions drive every rule below:
     · Variants compound   .tag.due      → .tag-danger
     · States are prefixed .chip.active  → .chip.is-active
   A bare single-word class like `.info`, `.water` or `.active` in app CSS will
   silently restyle any kit component that uses the same word, which is why none
   survive.

   The script is idempotent: every rule matches only the pre-migration form.
   ========================================================================== */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/* fileURLToPath, not URL.pathname: this repo lives under "PLANT TRACKER" and
   pathname would hand back the %20-escaped form, which fs cannot open. */
const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const ROOT = fileURLToPath(new URL('../', import.meta.url))

/* Literal replacements. Ordered — longer / more specific patterns first, so a
   broad rule can never eat a narrow one's match. */
const RULES = [
  /* ── Status tokens are named once, in the triad. ─────────────────────────
     `.tag.info` was inked #4A7FAB while `.notif-item.water` — the same status —
     was inked #3C6E99, and `.notif-item.rain` reached for var(--red-border),
     a token that had never been declared, so it silently always took its
     fallback. Both consumers now read --info-* / --danger-*. */
  ['className={`notif-item ${activeTab.key}`}', 'className={`notif-item notif-item-${activeTab.key}`}'],
  [`className={\`tag marker-tag \${left <= 0 ? 'due' : left <= 1 ? 'soon' : 'ok'}\`}`,
   `className={\`tag marker-tag \${left <= 0 ? 'tag-danger' : left <= 1 ? 'tag-warn' : 'tag-ok'}\`}`],
  [`className={\`cluster-chip \${cls}\`}`, 'className={`cluster-chip cluster-chip-${cls}`}'],
  ['className="tag soon"', 'className="tag tag-warn"'],
  ['<span className="tag soon">', '<span className="tag tag-warn">'],
  ['className="tag ok"', 'className="tag tag-ok"'],
  ['className="tag info"', 'className="tag tag-info"'],

  /* ── Floor-plan modifiers keep their domain word, but compound. ─────────── */
  ['className={`zone-rect ${z.light}`}', 'className={`zone-rect zone-rect-${z.light}`}'],
  ['className="zone-rect partial"', 'className="zone-rect zone-rect-partial"'],
  ['className="window-marker draft"', 'className="window-marker window-marker-draft"'],

  /* ── Care-task buttons. ─────────────────────────────────────────────────── */
  ['className="action-sq water"', 'className="action-sq action-sq-water"'],
  ['className="action-sq mist"',  'className="action-sq action-sq-mist"'],

  /* ── States get the is- prefix. ─────────────────────────────────────────── */
  [`className={\`chip\${mode === 'window' ? ' active' : ''}\`}`, `className={\`chip\${mode === 'window' ? ' is-active' : ''}\`}`],
  [`className={\`chip\${mode === 'zone' ? ' active' : ''}\`}`,   `className={\`chip\${mode === 'zone' ? ' is-active' : ''}\`}`],
  [`className={\`chip\${mode === 'measure' ? ' active' : ''}\`}`,`className={\`chip\${mode === 'measure' ? ' is-active' : ''}\`}`],
  [`className={\`chip\${mode === 'erase' ? ' active' : ''}\`}`,  `className={\`chip\${mode === 'erase' ? ' is-active' : ''}\`}`],
  ['className={`chip${placingId === p.id ? \' active\' : \'\'}`}', 'className={`chip${placingId === p.id ? \' is-active\' : \'\'}`}'],
  ['className={`chip${category === id ? \' active\' : \'\'}`}',    'className={`chip${category === id ? \' is-active\' : \'\'}`}'],
  ['className={`chip${category === k ? \' active\' : \'\'}`}',     'className={`chip${category === k ? \' is-active\' : \'\'}`}'],
  ['className={`catalog-item${icon === k ? \' sel\' : \'\'}`}',    'className={`catalog-item${icon === k ? \' is-selected\' : \'\'}`}'],
  ['className={`zone-row${!value ? \' sel\' : \'\'}`}',            'className={`zone-row${!value ? \' is-selected\' : \'\'}`}'],
  ['className={`zone-row${value === z.id ? \' sel\' : \'\'}`}',    'className={`zone-row${value === z.id ? \' is-selected\' : \'\'}`}'],
  [`className={t.key === activeTab.key ? 'active' : ''}`,          `className={t.key === activeTab.key ? 'is-active' : ''}`],
  [`className={light === l ? 'active' : ''}`,                      `className={light === l ? 'is-active' : ''}`],
  [`className={selected.light === l ? 'active' : ''}`,             `className={selected.light === l ? 'is-active' : ''}`],
  [`className={sens === key ? 'active' : ''}`,                     `className={sens === key ? 'is-active' : ''}`],
  [`className={watered === o.days ? 'active' : ''}`,               `className={watered === o.days ? 'is-active' : ''}`],
  [`className={!isOutside ? 'active' : ''}`,                       `className={!isOutside ? 'is-active' : ''}`],
  [`className={isOutside ? 'active' : ''}`,                        `className={isOutside ? 'is-active' : ''}`],
  [`className={!plant.isOutside ? 'active' : ''}`,                 `className={!plant.isOutside ? 'is-active' : ''}`],
  [`className={plant.isOutside ? 'active' : ''}`,                  `className={plant.isOutside ? 'is-active' : ''}`],
  [`className={!outdoor ? 'active' : ''}`,                         `className={!outdoor ? 'is-active' : ''}`],
  [`className={outdoor ? 'active' : ''}`,                          `className={outdoor ? 'is-active' : ''}`],
  ['className="main-content narrow"', 'className="main-content is-narrow"'],

  /* ── Kit vocabulary wins. ────────────────────────────────────────────────
     .notif-wrap/.notif-bubble were the kit's .popover-wrap/.popover under
     another name — same tail, same outside-tap dismissal. The tabs and rows
     inside stay domain classes. */
  ['className="notif-wrap"',   'className="popover-wrap"'],
  ['className="notif-bubble"', 'className="popover"'],
  ['className="plant-grid"',   'className="card-grid"'],

  /* .btn-mint named a brand colour, which breaks the moment the theme isn't
     green. It and .btn-ghost were the app's two quiet tiers; the kit's are
     .btn-soft (filled wash) and .btn-secondary (outline), in that order of
     weight, so the urgent/quiet distinction on the plant sheet survives. */
  ['btn-mint',  'btn-soft'],
  ['btn-ghost', 'btn-secondary'],

  /* ── The one real collision. ─────────────────────────────────────────────
     `.row-list > .row` vs the kit's `.row`, which is a flex space-between
     utility. Any kit component dropped into this app would have been restyled
     by the account list's row rule. The kit's name for the pattern is
     `.list-row`, and the `.row-list` wrapper carried no styles of its own —
     it existed only to scope the descendant selector, so it goes. */
  ['<div className="card row-list"', '<div className="card"'],
  ['<div className="row-list"', '<div'],
  ['className="row"', 'className="list-row"'],
]

const files = []
;(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.jsx?$/.test(name)) files.push(p)
  }
})(SRC)

let total = 0
for (const file of files) {
  const before = readFileSync(file, 'utf8')
  let after = before
  for (const [from, to] of RULES) {
    if (!after.includes(from)) continue
    total += after.split(from).length - 1
    after = after.split(from).join(to)
  }
  if (after !== before) {
    writeFileSync(file, after)
    console.log(`  rewrote ${relative(ROOT, file).replace(/\\/g, '/')}`)
  }
}
console.log(`\n${total} class-name sites rewritten across ${files.length} files.`)
console.log('Structural work (nav FAB, .row-list unwrapping, inline styles, type scale) is by hand.')
