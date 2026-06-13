const axios = require('axios')

let _admin = null

function getAdmin() {
  if (_admin) return _admin
  try {
    const admin = require('firebase-admin')
    if (!admin.apps.length) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT
      if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not set')
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) })
      console.log('✅ Firebase initialized')
    }
    _admin = admin
    return admin
  } catch (e) {
    console.error('❌ Firebase init error:', e.message)
    return null
  }
}

function makeOrderId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function normalizePhone(raw) {
  return String(raw).replace(/\D/g, '')
}

// Timeout wrapper - if Firestore query takes more than 5s, skip it
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => { console.warn(`⏱ Timed out after ${ms}ms`); resolve(fallback) }, ms))
  ])
}

module.exports = async function handler(req, res) {
  // ── GET — verification ──────────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode']
    const token     = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }
    return res.status(403).send('Forbidden')
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  res.status(200).json({ status: 'ok' })

  const WA_TOKEN    = process.env.WHATSAPP_TOKEN
  const PHONE_ID    = process.env.WHATSAPP_PHONE_ID
  const DEFAULT_UID = process.env.DEFAULT_UID

  console.log('📬 POST received, UID:', DEFAULT_UID?.substring(0,8))

  try {
    const body = req.body
    if (body?.object !== 'whatsapp_business_account') return

    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages
    if (!messages?.length) { console.log('No messages'); return }

    for (const msg of messages) {
      console.log(`📨 ${msg.type} from ${msg.from}`)
      if (msg.type !== 'image') continue

      const fromPhone = msg.from
      const mediaId   = msg.image?.id
      const caption   = msg.image?.caption || ''
      const timestamp = parseInt(msg.timestamp) * 1000 || Date.now()

      // Step 1: Firebase
      const admin = getAdmin()
      if (!admin) { console.error('❌ No Firebase'); continue }
      const db = admin.firestore()

      // Step 2: Shop lookup with 5s timeout
      console.log('Step 2: Shop lookup...')
      let shop = null
      try {
        const normalized = normalizePhone(fromPhone)
        const snap = await withTimeout(
          db.collection('shops').get(),
          5000,
          null
        )
        if (snap) {
          console.log(`Found ${snap.size} shops`)
          snap.forEach(doc => {
            const shopPhone = normalizePhone(doc.data().whatsappNumber || '')
            if (shopPhone.endsWith(normalized.slice(-10)) || normalized.endsWith(shopPhone.slice(-10))) {
              shop = { id: doc.id, ...doc.data() }
            }
          })
        } else {
          console.log('Shop lookup timed out, continuing without shop match')
        }
      } catch (e) {
        console.error('❌ Shop lookup error:', e.message)
      }
      console.log('🏪 Shop:', shop ? shop.name : 'none')

      // Step 3: Download photo
      console.log('Step 3: Downloading photo...')
      let photo = null
      try {
        const infoRes = await axios.get(
          `https://graph.facebook.com/v19.0/${mediaId}`,
          { headers: { Authorization: `Bearer ${WA_TOKEN}` } }
        )
        const mediaRes = await axios.get(infoRes.data.url, {
          responseType: 'arraybuffer',
          headers: { Authorization: `Bearer ${WA_TOKEN}` },
        })
        const mimeType = mediaRes.headers['content-type'] || 'image/jpeg'
        photo = `data:${mimeType};base64,${Buffer.from(mediaRes.data).toString('base64')}`
        console.log(`🖼 Photo: ${Math.round(photo.length / 1024)}KB`)
      } catch (e) {
        console.error('❌ Photo failed:', e.message)
      }

      // Step 4: Next order number with timeout
      console.log('Step 4: Getting order number...')
      let orderNum = 1
      try {
        const snap = await withTimeout(
          db.collection('orders').doc(DEFAULT_UID).collection('userOrders').get(),
          5000,
          null
        )
        if (snap) {
          let max = 0
          snap.forEach(d => { if ((d.data().orderNum || 0) > max) max = d.data().orderNum })
          orderNum = max + 1
        }
        console.log('Order number:', orderNum)
      } catch (e) {
        console.error('❌ Order num error:', e.message)
      }

      // Step 5: Save order
      const orderId = makeOrderId()
      console.log(`Step 5: Saving ${orderId}...`)
      try {
        await db
          .collection('orders')
          .doc(DEFAULT_UID)
          .collection('userOrders')
          .doc(orderId)
          .set({
            id:           orderId,
            createdAt:    timestamp,
            shop:         shop ? shop.name : `Unknown (${fromPhone})`,
            shopId:       shop?.id || null,
            fromPhone,
            status:       'pending',
            photo:        photo || null,
            source:       'whatsapp',
            worker:       '',
            supervisor:   '',
            deadline:     '',
            notes:        caption,
            orderNum,
            shopResolved: !!shop,
            isBooking:    false,
            transport:    '',
            vehicleNum:   '',
          })
        console.log('✅ Order saved!')
      } catch (e) {
        console.error('❌ Save failed:', e.message)
        console.error(e.stack)
      }

      // Step 6: Reply
      try {
        const replyText = shop
          ? `✅ Order received from *${shop.name}*. Order #${orderNum} created.`
          : `✅ Order received. Assign shop in OrderDesk.`
        await axios.post(
          `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
          { messaging_product: 'whatsapp', to: fromPhone, type: 'text', text: { body: replyText } },
          { headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' } }
        )
        console.log('✅ Reply sent')
      } catch (e) {
        console.warn('⚠️ Reply failed:', e.message)
      }
    }
  } catch (err) {
    console.error('❌ Error:', err.message, err.stack)
  }
}
