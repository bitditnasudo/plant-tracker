/* Appearance choices that drive the generated icon.
 *
 * `render` strings are what actually reaches the image prompt — the labels are
 * what you pick from. Kept separate so the wording can be tuned for the model
 * without changing the UI or stored values.
 */

export const POT_MATERIALS = [
  { id: 'terracotta', label: 'Terracotta',     render: 'an unglazed terracotta pot with a matte, slightly porous surface' },
  { id: 'glazed',     label: 'Glazed ceramic', render: 'a glossy glazed ceramic pot' },
  { id: 'plastic',    label: 'Plastic',        render: 'a smooth moulded plastic pot' },
  { id: 'concrete',   label: 'Concrete',       render: 'a raw concrete pot with a soft stony texture' },
  { id: 'basket',     label: 'Woven basket',   render: 'a woven natural-fibre basket planter' },
  { id: 'growbag',    label: 'Fabric bag',     render: 'a soft fabric grow bag' },
  { id: 'metal',      label: 'Metal',          render: 'a brushed metal planter' },
  { id: 'glass',      label: 'Glass',          render: 'a clear glass vessel' },
]

export const POT_COLORS = [
  { id: 'natural',    label: 'Natural',    render: null }, // leave the material's own colour
  { id: 'terracotta', label: 'Terracotta', render: 'warm terracotta orange' },
  { id: 'white',      label: 'White',      render: 'cream white' },
  { id: 'black',      label: 'Black',      render: 'matte black' },
  { id: 'grey',       label: 'Grey',       render: 'charcoal grey' },
  { id: 'sand',       label: 'Sand',       render: 'sand beige' },
  { id: 'sage',       label: 'Sage',       render: 'soft sage green' },
  { id: 'mint',       label: 'Mint',       render: 'pale mint green' },
  { id: 'blue',       label: 'Blue',       render: 'dusty blue' },
  { id: 'pink',       label: 'Pink',       render: 'dusty pink' },
]

export const BLOOM_COLORS = [
  { id: 'none',    label: 'Not flowering', render: null },
  { id: 'natural', label: 'Natural',       render: null }, // let the model pick true-to-species
  { id: 'white',   label: 'White',   render: 'white' },
  { id: 'cream',   label: 'Cream',   render: 'creamy ivory' },
  { id: 'yellow',  label: 'Yellow',  render: 'bright yellow' },
  { id: 'orange',  label: 'Orange',  render: 'warm orange' },
  { id: 'coral',   label: 'Coral',   render: 'coral' },
  { id: 'red',     label: 'Red',     render: 'deep red' },
  { id: 'pink',    label: 'Pink',    render: 'soft pink' },
  { id: 'magenta', label: 'Magenta', render: 'vivid magenta' },
  { id: 'purple',  label: 'Purple',  render: 'violet purple' },
  { id: 'blue',    label: 'Blue',    render: 'blue' },
  { id: 'mixed',   label: 'Mixed',   render: 'a mix of several colours' },
]

// Plants added before these fields existed stored free text like
// 'terracotta pot' / 'warm orange'. Map those onto the new ids.
const LEGACY_MATERIAL = {
  'terracotta pot': 'terracotta', 'ceramic pot': 'glazed', 'small ceramic pot': 'glazed',
  'ceramic bowl': 'glazed', 'shallow bonsai dish': 'glazed', 'hanging pot': 'plastic',
  'grow bag': 'growbag', 'glass vase': 'glass', 'glass terrarium': 'glass', 'clear orchid pot': 'glass',
}
const LEGACY_COLOR = {
  'warm orange': 'terracotta', 'cream white': 'white', 'mint green': 'mint',
  'sage green': 'sage', 'charcoal grey': 'grey', 'sand beige': 'sand', 'clear': 'natural',
}

const find = (list, id, fallback) => list.find(o => o.id === id) || list.find(o => o.id === fallback)

/* Resolve a plant's appearance, accepting new ids, legacy strings, or nothing.
 * `cat` supplies the catalogue defaults when the plant itself has none. */
export function resolveAppearance(plant = {}, cat = {}) {
  const materialId = plant.potMaterial
    || LEGACY_MATERIAL[plant.potType] || LEGACY_MATERIAL[cat.pot] || 'terracotta'
  const colorId = plant.potColorId
    || LEGACY_COLOR[plant.potColor] || LEGACY_COLOR[cat.potColor] || 'natural'
  const bloomId = plant.bloomColor
    || (cat.category === 'flower' ? 'natural' : 'none')
  return {
    material: find(POT_MATERIALS, materialId, 'terracotta'),
    color: find(POT_COLORS, colorId, 'natural'),
    bloom: find(BLOOM_COLORS, bloomId, 'none'),
  }
}
