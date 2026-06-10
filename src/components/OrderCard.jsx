import { useRef } from 'react'
import { deadlineInfo } from '../lib/utils'
import styles from './OrderCard.module.css'

export function OrderCard({ order, query = '', bulkMode, selected, onPress, onLongPress }) {
  const lpTimer = useRef(null)

  function startLP() {
    lpTimer.current = setTimeout(() => {
      if (!bulkMode) onLongPress?.()
    }, 600)
  }
  function endLP() {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null }
  }

  const dl       = deadlineInfo(order.deadline)
  const photoSrc = order.photo || order.photoUrl
  const isActive = order.status === 'active'
  const isDone   = order.status === 'done'

  const stripeClass = isActive ? styles.stripeA : isDone ? styles.stripeD : styles.stripeP

  return (
    <div
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      onClick={onPress}
      onContextMenu={e => { e.preventDefault(); onLongPress?.() }}
      onTouchStart={startLP}
      onTouchEnd={endLP}
      onTouchMove={endLP}
    >
      <div className={`${styles.stripe} ${stripeClass}`} />

      {/* Checkbox (bulk mode) */}
      {bulkMode && (
        <div className={`${styles.check} ${selected ? styles.checkOn : ''}`}>
          {selected && (
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}

      {/* Order number */}
      {(isActive || isDone)
        ? <div className={styles.num}>#{order.orderNum}</div>
        : <div className={styles.dash}>—</div>
      }

      {/* Main info */}
      <div className={styles.main}>
        <div
          className={`${styles.shop} ${isDone ? styles.shopDone : ''}`}
          dangerouslySetInnerHTML={{ __html: hlText(order.shop, query) }}
        />
        <div className={styles.sub}>
          {order.worker && (
            <span dangerouslySetInnerHTML={{ __html: `👷 ${hlText(order.worker, query)}` }} />
          )}
          {order.supervisor && (
            <span dangerouslySetInnerHTML={{ __html: `🎯 ${hlText(order.supervisor, query)}` }} />
          )}
          {dl && (
            <span style={{ color: dl.cls === 'over' ? 'var(--ac)' : 'var(--am)' }}>
              📅 {dl.label}
            </span>
          )}
          {order.isBooking && order.transport && (
            <span className={styles.bookingTag}>🚛 {order.transport}</span>
          )}
          {order.source === 'whatsapp' && (
            <span className={styles.waTag}>💬 WhatsApp</span>
          )}
        </div>
      </div>

      {/* Indicator dots */}
      <div className={styles.dots}>
        {photoSrc      && <span className={`${styles.dot} ${styles.dotPh}`} title="Has photo" />}
        {dl?.cls === 'over' && <span className={`${styles.dot} ${styles.dotOv}`} title={dl.label} />}
        {dl?.cls === 'warn' && <span className={`${styles.dot} ${styles.dotDl}`} title={dl.label} />}
        {order.worker  && <span className={`${styles.dot} ${styles.dotWk}`} title="Worker assigned" />}
        {order.source === 'whatsapp' && <span className={`${styles.dot} ${styles.dotWa}`} title="WhatsApp" />}
      </div>

      {!bulkMode && <div className={styles.chev}>›</div>}
    </div>
  )
}

function hlText(text, query) {
  if (!query || !text) return text || ''
  const e = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return String(text).replace(new RegExp(`(${e})`, 'gi'), '<mark>$1</mark>')
}
