import { useState } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { ConfirmSheet } from '../components/ConfirmSheet'
import styles from './ShopsPage.module.css'

export function ShopsPage({ shops, onBack, onSave, onDelete, onToast }) {
  const [query,       setQuery]       = useState('')
  const [sheetOpen,   setSheetOpen]   = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editing,     setEditing]     = useState(null) // null = new

  // Form state
  const [name,  setName]  = useState('')
  const [phone, setPhone] = useState('')
  const [area,  setArea]  = useState('')

  function openNew() {
    setEditing(null); setName(''); setPhone(''); setArea('')
    setSheetOpen(true)
  }

  function openEdit(shop) {
    setEditing(shop)
    setName(shop.name || '')
    setPhone(shop.whatsappNumber || '')
    setArea(shop.area || '')
    setSheetOpen(true)
  }

  async function handleSave() {
    if (!name.trim()) { onToast('Shop name is required', 'err'); return }
    const shop = {
      ...(editing || {}),
      name: name.trim(),
      whatsappNumber: phone.trim(),
      area: area.trim(),
    }
    await onSave(shop)
    setSheetOpen(false)
    onToast(editing ? 'Shop updated' : 'Shop added', 'ok')
  }

  async function handleDelete() {
    if (!editing) return
    await onDelete(editing.id)
    setConfirmOpen(false)
    setSheetOpen(false)
    onToast('Shop deleted', 'err')
  }

  const filtered = shops.filter(s => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      s.name?.toLowerCase().includes(q) ||
      s.area?.toLowerCase().includes(q) ||
      s.whatsappNumber?.includes(q)
    )
  })

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.hdr}>
        <button className={styles.back} onClick={onBack}>‹</button>
        <span className={styles.title}>Shops</span>
        <button className={styles.addBtn} onClick={openNew}>＋ Add Shop</button>
      </div>

      {/* Search */}
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search shops…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* List */}
      <div className={styles.list}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🏪</div>
            <div>No shops yet</div>
          </div>
        ) : filtered.map(s => (
          <div key={s.id} className={styles.card} onClick={() => openEdit(s)}>
            <div className={styles.av}>{s.name.substring(0, 2).toUpperCase()}</div>
            <div className={styles.info}>
              <div className={styles.shopName}>{s.name}</div>
              <div className={styles.sub}>
                {s.area && <span>📍 {s.area}</span>}
                {s.whatsappNumber && <span className={styles.waPhone}>💬 {s.whatsappNumber}</span>}
              </div>
            </div>
            <div className={styles.chev}>›</div>
          </div>
        ))}
        <div style={{ height: 40 }} />
      </div>

      {/* Edit / Add sheet */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} maxHeight="80vh">
        <div className={styles.shHead}>
          <div className={styles.shTitle}>{editing ? 'Edit Shop' : 'Add Shop'}</div>
          <button className={styles.shClose} onClick={() => setSheetOpen(false)}>✕</button>
        </div>
        <div className={styles.shBody}>
          <div className={styles.fieldGroup}>
            <label className={styles.lbl}>Shop Name *</label>
            <input className={styles.input} type="text" placeholder="e.g. Al Noor Store" value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.lbl}>WhatsApp Number</label>
            <input className={styles.input} type="tel" placeholder="e.g. 919876543210" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="off" />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.lbl}>Area / Location</label>
            <input className={styles.input} type="text" placeholder="e.g. Gandhipuram, Coimbatore" value={area} onChange={e => setArea(e.target.value)} autoComplete="off" />
          </div>
          <div style={{ height: 16 }} />
        </div>
        <div className={styles.shFoot}>
          {editing && (
            <button className={styles.delBtn} onClick={() => setConfirmOpen(true)}>🗑</button>
          )}
          <button className={styles.cancelBtn} onClick={() => setSheetOpen(false)}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave}>Save Shop</button>
        </div>
      </BottomSheet>

      {/* Confirm delete */}
      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete Shop?"
        message={`Remove "${editing?.name}"? Orders linked to it are not affected.`}
        confirmLabel="Delete Shop"
      />
    </div>
  )
}
