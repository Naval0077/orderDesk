import { useState, useEffect } from 'react'
import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { makeId, getNextOrderNum } from '../lib/utils'

function ordersCol(uid) {
  return collection(db, 'orders', uid, 'userOrders')
}
function orderDoc(uid, id) {
  return doc(db, 'orders', uid, 'userOrders', id)
}

export function useOrders(uid) {
  const [orders,  setOrders]  = useState([])
  const [syncing, setSyncing] = useState(true)

  useEffect(() => {
    if (!uid) { setOrders([]); return }
    setSyncing(true)
    const unsub = onSnapshot(
      ordersCol(uid),
      snap => {
        const docs = []
        snap.forEach(d => docs.push(d.data()))
        setOrders(docs)
        setSyncing(false)
      },
      () => setSyncing(false),
    )
    return unsub
  }, [uid])

  async function saveOrder(order) {
    setSyncing(true)
    try {
      await setDoc(orderDoc(uid, order.id), order)
    } finally {
      setSyncing(false)
    }
  }

  async function deleteOrder(id) {
    setSyncing(true)
    try {
      await deleteDoc(orderDoc(uid, id))
    } finally {
      setSyncing(false)
    }
  }

  async function deleteBatch(ids) {
    setSyncing(true)
    try {
      const batch = writeBatch(db)
      ids.forEach(id => batch.delete(orderDoc(uid, id)))
      await batch.commit()
    } finally {
      setSyncing(false)
    }
  }

  function createOrder({ shop, shopId = null, photo = null }) {
    return {
      id:           makeId(),
      createdAt:    Date.now(),
      shop,
      shopId,
      status:       'pending',
      photo,
      photoUrl:     null,
      worker:       '',
      supervisor:   '',
      deadline:     '',
      notes:        '',
      orderNum:     null,
      isBooking:    false,
      transport:    '',
      vehicleNum:   '',
      source:       'manual',
      shopResolved: true,
    }
  }

  function activateOrder(order) {
    return {
      ...order,
      status:    'active',
      orderNum:  order.orderNum || getNextOrderNum(orders),
    }
  }

  function completeOrder(order) {
    return { ...order, status: 'done', completedAt: Date.now() }
  }

  function reopenOrder(order) {
    const { completedAt, ...rest } = order
    return { ...rest, status: 'active' }
  }

  return {
    orders, syncing,
    saveOrder, deleteOrder, deleteBatch,
    createOrder, activateOrder, completeOrder, reopenOrder,
  }
}
