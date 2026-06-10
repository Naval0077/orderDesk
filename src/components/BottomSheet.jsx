import { useEffect, useRef } from 'react'
import styles from './BottomSheet.module.css'

export function BottomSheet({ open, onClose, children, maxHeight = '92vh' }) {
  const sheetRef = useRef(null)

  // Swipe down to close
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    let startY = 0
    const onTouchStart = e => { startY = e.touches[0].clientY }
    const onTouchEnd   = e => {
      if (e.changedTouches[0].clientY - startY > 80) onClose()
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [onClose])

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.open : ''}`}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${open ? styles.open : ''}`}
        style={{ maxHeight }}
      >
        <div className="sheet-handle" />
        {children}
      </div>
    </>
  )
}
