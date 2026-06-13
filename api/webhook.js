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

module.exports = async function handler(req, res) {
  // ── GET — verification ──────────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode']
    const token     = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('✅ Verified')
      return res.status(200).send(challenge)
    }
    return res.status(403).send('Forbidden')
  }

  // ── POST — incoming message ─────────────────────────
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  // ACK immediately
  res.status(200).json({ status: 'ok' })

  const WA_TOKEN    = process.env.WHATSAPP_TOKEN
  const PHONE_ID    = process.env.WHATSAPP_PHONE_ID
  const DEFAULT_UID = process.env.DEFAULT_UID

  console.log('📬 POST received')
  console.log('DEFAULT_UID:', DEFAULT_UID ? DEFAULT_UID.substring(0,8)+'...' : '❌ MISSING')

  try {
    const body = req.body
    if (body?.object !== 'whatsapp_business_account') {
      console.log('Not WA event, skipping')
      return
    }

    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages
    if (!messages || messages.length === 0) {
      console.log('No messages found in payload')
      return
    }

    for (const msg of messages) {
      console.log(`📨 Message from ${msg.from}, type: ${msg.type}`)
      if (msg.type !== 'image') continue

      const fromPhone = msg.from
      const mediaId   = msg.image?.id
      const caption   = msg.image?.caption || ''
      const timestamp = parseInt(msg.timestamp) * 1000 || Date.now()

      // Step 1: Get Firebase
      console.log('Step 1: Getting Firebase...')
      const admin = getAdmin()
      if (!admin) { console.error('❌ Firebase unavailable'); continue }
      const db = admin.firestore()
      console.log('✅ Got Firestore')

      // Step 2: Find shop
      console.log('Step 2: Looking up shop for', fromPhone)
      let shop = null
      try {
        const normalized = normalizePhone(fromPhone)
        const snap = await db.collection('shops').get()
        console.log(`Found ${snap.size} shops in database`)
        snap.forEach(doc => {
          const data = doc.data()
          const shopPhone = normalizePhone(data.whatsappNumber || '')
          console.log(`  Comparing ${shopPhone} vs ${normalized}`)
          if (
            shopPhone === normalized ||
            shopPhone.endsWith(normalized.slice(-10)) ||
            normalized.endsWith(shopPhone.slice(-10))
          ) {
            shop = { id: doc.id, ...data }
          }
        })
        console.log('🏪 Shop match:', shop ? shop.name : 'none')
      } catch (e) {
        console.error('❌ Shop lookup failed:', e.message)
      }

      // Step 3: Download photo
      console.log('Step 3: Downloading photo, mediaId:', mediaId)
      let photo = null
      try {
        const infoRes = await axios.get(
          `https://graph.facebook.com/v19.0/${mediaId}`,
          { headers: { Authorization: `Bearer ${WA_TOKEN}` } }
        )
        console.log('Got media URL:', infoRes.data.url ? 'yes' : 'no')
        const mediaRes = await axios.get(infoRes.data.url, {
          responseType: 'arraybuffer',
          headers: { Authorization: `Bearer ${WA_TOKEN}` },
        })
        const mimeType = mediaRes.headers['content-type'] || 'image/jpeg'
        photo = `data:${mimeType};base64,${Buffer.from(mediaRes.data).toString('base64')}`
        console.log(`🖼 Photo ready: ${Math.round(photo.length / 1024)}KB`)
      } catch (e) {
        console.error('❌ Photo download failed:', e.message)
      }

      // Step 4: Get next order number
      console.log('Step 4: Getting next order number for UID:', DEFAULT_UID)
      let orderNum = 1
      try {
        const snap = await db
          .collection('orders')
          .doc(DEFAULT_UID)
          .collection('userOrders')
          .get()
        let max = 0
        snap.forEach(d => { if ((d.data().orderNum || 0) > max) max = d.data().orderNum })
        orderNum = max + 1
        console.log('Next order number:', orderNum)
      } catch (e) {
        console.error('❌ Order num fetch failed:', e.message)
      }

      // Step 5: Save order
      const orderId = makeOrderId()
      console.log(`Step 5: Saving order ${orderId} under UID ${DEFAULT_UID}`)
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
            shopId:       shop ? shop.id : null,
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
        console.log('✅ Order saved successfully!')
      } catch (e) {
        console.error('❌ Firestore write failed:', e.message)
        console.error(e.stack)
      }

      // Step 6: Reply
      console.log('Step 6: Sending WhatsApp reply...')
      try {
        const replyText = shop
          ? `✅ Order received from *${shop.name}*. Order #${orderNum} created.`
          : `✅ Order received. Shop not recognised — assign it in OrderDesk.`
        await axios.post(
          `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
          {
            messaging_product: 'whatsapp',
            to: fromPhone,
            type: 'text',
            text: { body: replyText },
          },
          { headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' } }
        )
        console.log('✅ Reply sent')
      } catch (e) {
        console.warn('⚠️ Reply failed:', e.message)
      }
    }
  } catch (err) {
    console.error('❌ Top level error:', err.message)
    console.error(err.stack)
  }
}
