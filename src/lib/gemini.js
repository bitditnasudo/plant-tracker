// Optional plant-icon generation with Gemini image models.
// Needs a Google AI Studio API key (https://aistudio.google.com/apikey) saved in Account.
// Note: a Gemini Pro *subscription* does not include API access, but AI Studio
// keys have a free tier that covers this use.
import { idbSet } from './idb.js'

// Newest image model first; falls back if the key's plan doesn't include it.
const MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image']

// Adapted from the user's prompt template. No glass panel in the image itself:
// the app's plant tile already provides the frosted rounded-square panel, so a
// panel inside the render would double-frame the icon and shrink the plant.
export function buildIconPrompt({ name, details, pot, potColor }) {
  return `A single, centralized, stylized matte 3D render of ${name} with ${details} in a ${pot} of ${potColor} color. ` +
    `The potted plant fills most of the frame, set against a plain, soft green-to-white gradient background. ` +
    `Nothing else is in the image: no glass panel, no frame, no border, no decorative shapes, no ornaments, ` +
    `no background objects — only the potted plant. ` +
    `The texture is friendly, tactile, and clean, like soft clay, with a soft-focus depth of field. ` +
    `Color palette for the background, pot and foliage tones only: olive green #40916C, mint green #74C69D, ` +
    `pale beige-green #D8F3DC, deep forest green #1B4332, white #FFFFFF. ` +
    `Important: if the plant has flowers or buds, render them in the species' true natural colors ` +
    `(vivid pinks, reds, oranges, yellows, purples or whites as appropriate) — never recolor blooms green or to the palette. ` +
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
