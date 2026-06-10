// ── ID generation ─────────────────────────────────────────
export function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ── Date formatting ───────────────────────────────────────
export function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Deadline info ─────────────────────────────────────────
export function deadlineInfo(dl) {
  if (!dl) return null
  const d    = new Date(dl + 'T00:00:00')
  const now  = new Date()
  now.setHours(0, 0, 0, 0)
  const diff = Math.round((d - now) / 86400000)
  if (diff < 0)  return { label: `Overdue ${Math.abs(diff)}d`, cls: 'over' }
  if (diff === 0) return { label: 'Due today',              cls: 'over' }
  if (diff <= 2)  return { label: `Due in ${diff}d`,        cls: 'warn' }
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cls: '' }
}

// ── Search matching ───────────────────────────────────────
export function matchesSearch(order, query) {
  if (!query) return true
  const q = query.toLowerCase()
  return [
    order.shop, order.worker, order.supervisor,
    order.notes, order.transport,
    order.orderNum ? `#${order.orderNum}` : '',
  ].some(v => v && String(v).toLowerCase().includes(q))
}

export function matchesDateRange(order, from, to) {
  if (!from && !to) return true
  const d = new Date(order.createdAt).toISOString().slice(0, 10)
  if (from && d < from) return false
  if (to   && d > to)   return false
  return true
}

// ── Highlight search matches ──────────────────────────────
export function highlight(text, query) {
  if (!query || !text) return text || ''
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return String(text).replace(
    new RegExp(`(${escaped})`, 'gi'),
    '<mark>$1</mark>',
  )
}

// ── Image compression ─────────────────────────────────────
export function compressImage(dataURL, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const ratio  = img.width > maxWidth ? maxWidth / img.width : 1
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataURL)
    img.src = dataURL
  })
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error('File too large (max 15MB)'))
      return
    }
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export async function processPhoto(file) {
  const dataURL    = await readFileAsDataURL(file)
  const compressed = await compressImage(dataURL)
  return compressed
}

// ── Next order number ─────────────────────────────────────
export function getNextOrderNum(orders) {
  return orders.reduce((max, o) => Math.max(max, o.orderNum || 0), 0) + 1
}

// ── Transport config ──────────────────────────────────────
export const TRANSPORTS = [
  { id: 'Lorry', icon: '🚛', label: 'Lorry' },
  { id: 'Van',   icon: '🚐', label: 'Van'   },
  { id: 'Bike',  icon: '🏍️', label: 'Bike'  },
  { id: 'Auto',  icon: '🛺', label: 'Auto'  },
]
