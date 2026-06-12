import { useState, useEffect } from 'react'
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { makeId } from '../lib/utils'

export function useShops(uid) {
  const [shops, setShops] = useState([])

  useEffect(() => {
    // Don't start listener until user is logged in
    if (!uid) { setShops([]); return }

    const unsub = onSnapshot(
      collection(db, 'shops'),
      snap => {
        const docs = []
        snap.forEach(d => docs.push({ id: d.id, ...d.data() }))
        setShops(docs.sort((a, b) => a.name.localeCompare(b.name)))
      },
      err => {
        console.error('Shops listener error:', err.message)
      }
    )
    return unsub
  }, [uid])

  async function saveShop(shop) {
    const id = shop.id || makeId()
    const data = { ...shop, id, createdAt: shop.createdAt || Date.now() }
    await setDoc(doc(db, 'shops', id), data)
    return id
  }

  async function deleteShop(id) {
    await deleteDoc(doc(db, 'shops', id))
  }

  function createShop({ name, whatsappNumber = '', area = '' }) {
    return { id: makeId(), name, whatsappNumber, area, createdAt: Date.now() }
  }

  return { shops, saveShop, deleteShop, createShop }
}