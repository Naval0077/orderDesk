import { useEffect, useState } from 'react'
import styles from './Lightbox.module.css'

export function Lightbox() {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    const handler = e => setSrc(e.detail)
    window.addEventListener('lightbox', handler)
    return () => window.removeEventListener('lightbox', handler)
  }, [])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setSrc(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!src) return null

  return (
    <div className={styles.lb} onClick={() => setSrc(null)}>
      <button className={styles.close} onClick={() => setSrc(null)}>✕</button>
      <img src={src} alt="Order" onClick={e => e.stopPropagation()} />
    </div>
  )
}
