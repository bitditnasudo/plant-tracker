// Optional plant-icon generation with Gemini image models.
// Needs a Google AI Studio API key (https://aistudio.google.com/apikey) saved in Account.
// Note: a Gemini Pro *subscription* does not include API access, but AI Studio
// keys have a free tier that covers this use.
import { idbSet } from './idb.js'

// Newest image model first; falls back if the key's plan doesn't include it.
const MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image']
// Text models for the care lookup (2.5-flash now 404s for new keys).
const TEXT_MODELS = ['gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-2.0-flash']

/* Fill in care details for a plant no catalogue has.
 *
 * Deliberately asks for a SHELTERED container baseline: the app layers its own
 * container ceiling and wind adjustment on top, so a figure that already
 * accounted for an exposed balcony would be counted twice. Returns a
 * confidence flag so the UI can warn when the model is guessing — the result
 * always lands in an editable form, never straight into the schedule.
 */
export async function lookupPlantCare(apiKey, { name, latin }) {
  const subject = [name, latin && `(${latin})`].filter(Boolean).join(' ')
  const body = {
    contents: [{ parts: [{ text:
      `Care requirements for a POTTED specimen of: ${subject}. ` +
      `Assume a container in a sheltered position with no significant wind, watered by hand. ` +
      `Do NOT pre-adjust for wind, balconies or exposure — that is applied separately. ` +
      `waterSummer/waterWinter are days between waterings in active growth and dormancy. ` +
      `mistDays is days between mistings, or null if this species does not need misting. ` +
      `fertilizeDays is days between feeding in the growing season. ` +
      `appearance is a short visual phrase for an illustration. ` +
      `Set confidence to low if you are not sure this exact plant is well known to you.` }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          waterSummer: { type: 'INTEGER' }, waterWinter: { type: 'INTEGER' },
          mistDays: { type: 'INTEGER', nullable: true }, fertilizeDays: { type: 'INTEGER' },
          light: { type: 'STRING', enum: ['direct', 'partial', 'shade'] },
          category: { type: 'STRING', enum: ['foliage', 'cactus', 'succulent', 'flower', 'herb', 'tree'] },
          outdoor: { type: 'BOOLEAN' }, appearance: { type: 'STRING' },
          confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
        },
        required: ['waterSummer', 'waterWinter', 'fertilizeDays', 'light', 'category', 'outdoor', 'appearance', 'confidence'],
      },
    },
  }

  let lastError = null
  for (const model of TEXT_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    )
    if (!res.ok) {
      // 503 = the model is momentarily overloaded, which is common on preview
      // models; fall through to the next one rather than failing the lookup.
      lastError = new Error(res.status === 503
        ? 'That model is busy right now — trying another…'
        : `Lookup failed (${res.status})`)
      if ([403, 404, 429, 500, 502, 503, 504].includes(res.status)) continue
      throw lastError
    }
    const data = await res.json()
    const txt = data?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text
    if (!txt) { lastError = new Error('Empty response'); continue }
    try { return JSON.parse(txt) } catch { lastError = new Error('Could not read the response'); }
  }
  throw lastError || new Error('Lookup failed')
}

// Adapted from the user's prompt template. No glass panel in the image itself:
// the app's plant tile already provides the frosted rounded-square panel, so a
// panel inside the render would double-frame the icon and shrink the plant.
export function buildIconPrompt({ name, details, material, potColor, bloom }) {
  // the pot: material always stated, colour only when it isn't the raw material
  const potPhrase = potColor?.render
    ? `${material.render}, coloured ${potColor.render}`
    : `${material.render} in its own natural colour`

  // the blooms: an explicit choice wins over anything the model would infer
  const bloomPhrase = bloom?.id === 'none'
    ? `This specimen is not in flower — render foliage only, with no blooms or buds.`
    : bloom?.render
      ? `Its flowers are ${bloom.render}: render every bloom and bud in that exact colour, and no other flower colour.`
      : `If the species flowers, render the blooms in its true natural colours.`

  return `A single, centralized, stylized matte 3D render of ${name} with ${details}, planted in ${potPhrase}. ` +
    `The potted plant fills most of the frame, set against a plain, soft green-to-white gradient background. ` +
    `Nothing else is in the image: no glass panel, no frame, no border, no decorative shapes, no ornaments, ` +
    `no background objects — only the potted plant. ` +
    `The texture is friendly, tactile, and clean, like soft clay, with a soft-focus depth of field. ` +
    `${bloomPhrase} ` +
    `Use these palette colours for the BACKGROUND AND FOLIAGE ONLY: olive green #40916C, mint green #74C69D, ` +
    `pale beige-green #D8F3DC, deep forest green #1B4332, white #FFFFFF. ` +
    `The pot and flower colours specified above override the palette and must be rendered exactly as stated — ` +
    `never recolour them green or to the background palette. ` +
    `Square image, no text.`
}

export async function generatePlantIcon(apiKey, promptFields) {
  let lastError = null
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildIconPrompt(promptFields) }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      lastError = new Error(`Gemini error ${res.status}: ${body.slice(0, 200)}`)
      // model not available on this plan/region — try the next one
      if (res.status === 404 || res.status === 429 || res.status === 403) continue
      throw lastError
    }
    const data = await res.json()
    const parts = data?.candidates?.[0]?.content?.parts || []
    const img = parts.find(p => p.inlineData?.data)
    if (!img) {
      lastError = new Error('Gemini returned no image')
      continue
    }
    const dataUrl = `data:${img.inlineData.mimeType || 'image/png'};base64,${img.inlineData.data}`
    return downscale(dataUrl, 320)
  }
  throw lastError || new Error('Icon generation failed')
}

// Downscale to keep stored icons small
function downscale(dataUrl, size) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, size, size)
      resolve(canvas.toDataURL('image/webp', 0.85))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

export async function saveGeneratedIcon(plantId, dataUrl) {
  await idbSet(`icon:${plantId}`, dataUrl)
}
