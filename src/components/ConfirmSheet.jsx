import { BottomSheet } from './BottomSheet'
import styles from './ConfirmSheet.module.css'

export function ConfirmSheet({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete' }) {
  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="50vh">
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        <div className={styles.message}>{message}</div>
        <button className={styles.del} onClick={onConfirm}>{confirmLabel}</button>
        <button className={styles.cancel} onClick={onClose}>Cancel</button>
      </div>
    </BottomSheet>
  )
}
