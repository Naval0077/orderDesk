import { useState, useEffect } from 'react'
import { BottomSheet } from './BottomSheet'
import { PhotoPicker } from './PhotoPicker'
import { deadlineInfo, TRANSPORTS, formatDate } from '../lib/utils'
import styles from './OrderDetailSheet.module.css'

export function OrderDetailSheet({ order, shops, open, onClose, onSave, onActivate, onComplete, onReopen, onDelete, onToast }) {
  const [shop,       setShop]       = useState('')
  const [shopId,     setShopId]     = useState('')
  const [photo,      setPhoto]      = useState(null)
  const [deadline,   setDeadline]   = useState('')
  const [worker,     setWorker]     = useState('')
  const [supervisor, setSupervisor] = useState('')
  const [notes,      setNotes]      = useState('')
  const [isBooking,  setIsBooking]  = useState(false)
  const [transport,  setTransport]  = useState('')
  const [vehicleNum, setVehicleNum] = useState('')
  const [waShop,     setWaShop]     = useState('')

  // Sync local state when order changes
  useEffect(() => {
    if (!order) return
    setShop(order.shop       || '')
    setShopId(order.shopId   || '')
    setPhoto(order.photo || order.photoUrl || null)
    setDeadline(order.deadline   || '')
    setWorker(order.worker       || '')
    setSupervisor(order.supervisor || '')
    setNotes(order.notes         || '')
    setIsBooking(order.isBooking || false)
    setTransport(order.transport || '')
    setVehicleNum(order.vehicleNum || '')
    setWaShop('')
  }, [order])

  if (!order) return null

  function collect() {
    return {
      ...order,
      shop, shopId,
      photo,
      deadline, worker, supervisor, notes,
      isBooking, transport: isBooking ? transport : '',
      vehicleNum: isBooking ? vehicleNum : '',
    }
  }

  async function handleSave() {
    await onSave(collect())
    onToast('Saved ✓', 'ok')
  }

  async function handleActivate() {
    await onActivate(collect())
    onClose()
    onToast(`Order #${order.orderNum || '?'} activated`, 'ok')
  }

  async function handleComplete() {
    await onComplete(collect())
    onClose()
    onToast(`Order completed ✓`, 'ok')
  }

  async function handleReopen() {
    await onReopen(collect())
    onClose()
    onToast('Order reopened', 'ok')
  }

  function handleShopSelect(e) {
    const sid = e.target.value
    setShopId(sid)
    if (sid) {
      const found = shops.find(s => s.id === sid)
      if (found) setShop(found.name)
    }
  }

  async function handleWaShopAssign(e) {
    const val = e.target.value
    if (!val) return
    const [sid, ...rest] = val.split('|')
    const sname = rest.join('|')
    setShopId(sid)
    setShop(sname)
    setWaShop(val)
    const updated = { ...collect(), shop: sname, shopId: sid, shopResolved: true }
    await onSave(updated)
    onToast(`Shop assigned: ${sname}`, 'ok')
  }

  const dl         = deadlineInfo(deadline)
  const isActive   = order.status === 'active'
  const isPending  = order.status === 'pending'
  const isDone     = order.status === 'done'
  const isWa       = order.source === 'whatsapp'
  const unresolved = isWa && !order.shopResolved

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Header */}
      <div className={styles.head}>
        {(isActive || isDone)
          ? <div className={styles.num}>#{order.orderNum}</div>
          : <div className={styles.dash}>—</div>
        }
        <div className={styles.titleWrap}>
          <div className={styles.shopName}>{order.shop}</div>
          <div className={styles.meta}>
            <span className={`${styles.badge} ${styles['badge_' + order.status]}`}>
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </span>
            <span>{formatDate(order.createdAt)}</span>
            {isWa && <span className={styles.waBadge}>💬 WhatsApp</span>}
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Body */}
      <div className={styles.body}>

        {/* WhatsApp notice */}
        {isWa && (
          <div className={styles.waNotice}>
            <span className={styles.waIcon}>💬</span>
            <div className={styles.waInfo}>
              <div className={styles.waTitle}>WhatsApp Order</div>
              <div className={styles.waFrom}>From: <code>{order.fromPhone}</code></div>
              {unresolved && (
                <div className={styles.waAssign}>
                  <span className={styles.waWarn}>⚠️ Shop not matched — assign below:</span>
                  <select className={styles.select} value={waShop} onChange={handleWaShopAssign}>
                    <option value="">— Select shop —</option>
                    {shops.map(s => (
                      <option key={s.id} value={`${s.id}|${s.name}`}>
                        {s.name}{s.area ? ` · ${s.area}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Photo */}
        <section>
          <div className={styles.secTitle}>Photo</div>
          <div className={styles.photoBox}>
            <PhotoPicker photo={photo} onChange={async p => { setPhoto(p); await onSave({ ...collect(), photo: p }); onToast('Photo updated', 'ok') }} onToast={onToast} />
          </div>
        </section>

        {/* Shop */}
        <section>
          <div className={styles.secTitle}>Shop</div>
          <select className={styles.select} value={shopId} onChange={handleShopSelect}>
            <option value="">— Select existing shop —</option>
            {shops.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.area ? ` (${s.area})` : ''}</option>
            ))}
          </select>
          <input
            className={styles.input}
            style={{ marginTop: 8 }}
            type="text"
            placeholder="Or type shop name manually"
            value={shop}
            onChange={e => setShop(e.target.value)}
          />
        </section>

        {/* Booking toggle */}
        <section>
          <div className={styles.secTitle}>Booking</div>
          <div className={styles.toggleRow}>
            <div>
              <div className={styles.toggleLabel}>This is a booking</div>
              <div className={styles.toggleSub}>Assign a transport vehicle</div>
            </div>
            <button
              className={`${styles.toggle} ${isBooking ? styles.toggleOn : ''}`}
              onClick={() => { setIsBooking(b => !b); if (isBooking) setTransport('') }}
            />
          </div>
          {isBooking && (
            <div className={styles.transportSection}>
              <div className={styles.transportGrid}>
                {TRANSPORTS.map(t => (
                  <button
                    key={t.id}
                    className={`${styles.trBtn} ${transport === t.id ? styles.trBtnSel : ''}`}
                    onClick={() => setTransport(t.id)}
                  >
                    <span className={styles.trIcon}>{t.icon}</span>
                    <span className={styles.trLabel}>{t.label}</span>
                  </button>
                ))}
              </div>
              <input
                className={styles.input}
                style={{ marginTop: 8 }}
                type="text"
                placeholder="Vehicle number (optional)"
                value={vehicleNum}
                onChange={e => setVehicleNum(e.target.value)}
              />
            </div>
          )}
        </section>

        {/* Deadline */}
        <section>
          <div className={styles.secTitle}>Deadline</div>
          <div className={styles.dlRow}>
            <input
              className={styles.input}
              style={{ flex: 1 }}
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
            />
            {dl && (
              <span className={`${styles.dlBadge} ${dl.cls === 'over' ? styles.dlOver : styles.dlWarn}`}>
                {dl.label}
              </span>
            )}
          </div>
        </section>

        {/* Assignment */}
        <section>
          <div className={styles.secTitle}>Assignment</div>
          <div className={styles.twoCol}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Worker No.</label>
              <input className={styles.input} type="text" placeholder="e.g. W-04" value={worker} onChange={e => setWorker(e.target.value)} autoComplete="off" />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Supervisor</label>
              <input className={styles.input} type="text" placeholder="e.g. Omar" value={supervisor} onChange={e => setSupervisor(e.target.value)} autoComplete="off" />
            </div>
          </div>
        </section>

        {/* Notes */}
        <section>
          <div className={styles.secTitle}>Notes</div>
          <textarea
            className={styles.input}
            rows={3}
            placeholder="Special instructions…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ resize: 'none', width: '100%' }}
          />
        </section>

        <div style={{ height: 20 }} />
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        {isPending && <button className={`${styles.btn} ${styles.btnActivate}`} onClick={handleActivate}>⚡ Activate</button>}
        {isActive  && <button className={`${styles.btn} ${styles.btnComplete}`} onClick={handleComplete}>✓ Complete</button>}
        {isDone    && <button className={`${styles.btn} ${styles.btnActivate}`} onClick={handleReopen}>↩ Re-open</button>}
        <button className={`${styles.btn} ${styles.btnSave}`} onClick={handleSave}>Save</button>
        <button className={styles.btnDel} onClick={() => onDelete(order.id)}>🗑</button>
      </div>
    </BottomSheet>
  )
}
