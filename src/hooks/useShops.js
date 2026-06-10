import { useState, useEffect } from 'react'
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { makeId } from '../lib/utils'

const SHOPS_COL = collection(db, 'shops')

export function useShops() {
  const [shops, setShops] = useState([])

  useEffect(() => {
    const unsub = onSnapshot(SHOPS_COL, snap => {
      const docs = []
      snap.forEach(d => docs.push({ id: d.id, ...d.data() }))
      setShops(docs.sort((a, b) => a.name.localeCompare(b.name)))
    })
    return unsub
  }, [])

  async function saveShop(shop) {
    const id = shop.id || makeId()
    await setDoc(doc(db, 'shops', id), { ...shop, id })
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
