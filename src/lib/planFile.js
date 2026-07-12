// Converts an uploaded floor plan (PDF, SVG, or image) into a raster data URL
// plus intrinsic dimensions, ready to render and annotate.

export async function fileToPlanImage(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return pdfToImage(file)
  if (name.endsWith('.svg') || file.type === 'image/svg+xml') return svgToImage(file)
  if (file.type.startsWith('image/')) return rasterToImage(file)
  throw new Error('Unsupported file — use PDF, SVG, PNG or JPG')
}

async function pdfToImage(file) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const page = await doc.getPage(1)

  // render at ~2800px on the long side for crisp zooming
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(4, 2800 / Math.max(base.width, base.height))
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // 'print' intent paces rendering with timeouts instead of requestAnimationFrame,
  // so the conversion still finishes if the tab is hidden or throttled mid-upload.
  await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise

  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
}

async function svgToImage(file) {
  const text = await file.text()
  const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)))
  const dims = await measureImage(dataUrl)
  // SVGs without explicit size: fall back to viewBox or a sane default
  if (!dims.width || !dims.height) {
    const vb = text.match(/viewBox\s*=\s*["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
    dims.width = vb ? parseFloat(vb[1]) : 1200
    dims.height = vb ? parseFloat(vb[2]) : 900
  }
  return { dataUrl, width: dims.width, height: dims.height }
}

async function rasterToImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
  const dims = await measureImage(dataUrl)
  return { dataUrl, width: dims.width, height: dims.height }
}

function measureImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Could not read image'))
    img.src = src
  })
}
