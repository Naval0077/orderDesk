import { useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { PhotoPicker } from './PhotoPicker'
import styles from './NewOrderSheet.module.css'

export function NewOrderSheet({ open, onClose, onAdd, shops, onToast }) {
  const [shopName, setShopName] = useState('')
  const [shopId,   setShopId]   = useState('')
  const [photo,    setPhoto]    = useState(null)

  function reset() {
    setShopName(''); setShopId(''); setPhoto(null)
  }

  function handleClose() { reset(); onClose() }

  async function handleAdd() {
    if (!shopName.trim()) {
      onToast('Shop name is required', 'err')
      return
    }
    await onAdd({ shop: shopName.trim(), shopId: shopId || null, photo })
    reset()
    onClose()
  }

  function handleShopSelect(e) {
    const sid = e.target.value
    setShopId(sid)
    if (sid) {
      const found = shops.find(s => s.id === sid)
      if (found) setShopName(found.name)
    }
  }

  return (
    <BottomSheet open={open} onClose={handleClose} maxHeight="88vh">
      <div className={styles.head}>
        <div className={styles.title}>New Order</div>
        <button className={styles.closeBtn} onClick={handleClose}>✕</button>
      </div>

      <div className={styles.body}>
        <section>
          <div className={styles.secTitle}>Order Photo</div>
          <div className={styles.photoBox}>
            <PhotoPicker photo={photo} onChange={setPhoto} onToast={onToast} />
          </div>
        </section>

        <section>
          <div className={styles.secTitle}>Shop</div>
          <select className={styles.select} value={shopId} onChange={handleShopSelect}>
            <option value="">— Select existing shop —</option>
            {shops.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.area ? ` (${s.area})` : ''}</option>
            ))}
          </select>
          <div className={styles.fieldGroup} style={{ marginTop: 8 }}>
            <label className={styles.fieldLabel}>Shop Name *</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Or type name"
              value={shopName}
              onChange={e => setShopName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoComplete="off"
            />
          </div>
        </section>

        <div style={{ height: 16 }} />
      </div>

      <div className={styles.footer}>
        <button className={styles.cancelBtn} onClick={handleClose}>Cancel</button>
        <button className={styles.addBtn} onClick={handleAdd}>Add Order</button>
      </div>
    </BottomSheet>
  )
}
