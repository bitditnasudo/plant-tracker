// Shrink a photo before it is stored: care-log photos ride along in the Drive
// sync file, so a 4 MB phone shot is cut to a ~100 KB JPEG first.
export function resizeImage(file, maxSide = 900, quality = 0.74) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t an image this browser can read')) }
    img.src = url
  })
}
