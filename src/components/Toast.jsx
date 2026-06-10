import styles from './Toast.module.css'

export function ToastContainer({ toasts }) {
  return (
    <div className={styles.wrap}>
      {toasts.map(t => (
        <div key={t.id} className={`${styles.toast} ${styles[t.type] || ''}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
