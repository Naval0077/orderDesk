import { useRef } from 'react'
import styles from './PhotoPicker.module.css'
import { processPhoto } from '../lib/utils'

export function PhotoPicker({ photo, onChange, onToast }) {
  const cameraRef  = useRef()
  const galleryRef = useRef()

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressed = await processPhoto(file)
      onChange(compressed)
    } catch (err) {
      onToast?.(err.message, 'err')
    }
    e.target.value = ''
  }

  if (photo) {
    return (
      <div className={styles.preview}>
        <img
          src={photo}
          className={styles.previewImg}
          alt="Order"
          onClick={() => window.dispatchEvent(new CustomEvent('lightbox', { detail: photo }))}
        />
        <div className={styles.overlay}>
          <label className={styles.overlayBtn}>
            📷 Retake
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
          </label>
          <label className={styles.overlayBtn}>
            🖼️ Gallery
            <input ref={galleryRef} type="file" accept="image/*" hidden onChange={handleFile} />
          </label>
          <button className={styles.overlayBtn} onClick={() => onChange(null)}>✕ Remove</button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.grid}>
      <label className={styles.camBtn}>
        <span className={styles.camIcon}>📷</span>
        <span className={styles.camLabel}>Take Photo</span>
        <input type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
      </label>
      <label className={styles.camBtn}>
        <span className={styles.camIcon}>🖼️</span>
        <span className={styles.camLabel}>From Gallery</span>
        <input type="file" accept="image/*" hidden onChange={handleFile} />
      </label>
    </div>
  )
}
