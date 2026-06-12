import axios from 'axios'
import admin from 'firebase-admin'

// ── Firebase Admin (initialize once) ─────────────────────
if (!admin.apps.length) {
  let serviceAccount
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  } catch (e) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT invalid JSON:', e.message)
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
  }
}

const db = admin.apps.length ? admin.firestore() : null

// ── Helpers ───────────────────────────────────────────────
function makeOrderId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function normalizePhone(raw) {
  return String(raw).replace(/\D/g, '')
}

async function findShopByPhone(phone) {
  if (!db) return null
  const normalized = normalizePhone(phone)
  const snap = await db.collection('shops').get()
  let match = null
  snap.forEach(doc => {
    const shopPhone = normalizePhone(doc.data().whatsappNumber || '')
    if (
      shopPhone === normalized ||
      shopPhone.endsWith(normalized.slice(-10)) ||
      normalized.endsWith(shopPhone.slice(-10))
    ) {
      match = { id: doc.id, ...doc.data() }
    }
  })
  return match
}

async function getNextOrderNum(uid) {
  if (!db) return 1
  const snap = await db.collection('orders').doc(uid).collection('userOrders').get()
  let max = 0
  snap.forEach(d => { if (d.data().orderNum > max) max = d.data().orderNum })
  return max + 1
}

async function downloadAsBase64(mediaId, token) {
  // Get media URL from WhatsApp
  const infoRes = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const mediaUrl = infoRes.data.url

  // Download binary and convert to base64
  const mediaRes = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${token}` },
  })

  const mimeType = mediaRes.headers['content-type'] || 'image/jpeg'
  const base64   = Buffer.from(mediaRes.data).toString('base64')
  return `data:${mimeType};base64,${base64}`
}

// ── Main handler ──────────────────────────────────────────
export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN
  const WA_TOKEN     = process.env.WHATSAPP_TOKEN
  const PHONE_ID     = process.env.WHATSAPP_PHONE_ID
  const DEFAULT_UID  = process.env.DEFAULT_UID

  // ── GET — webhook verification ────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode']
    const token     = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified')
      return res.status(200).send(challenge)
    }
    return res.status(403).json({ error: 'Verification failed' })
  }

  // ── POST — incoming message ───────────────────────────
  if (req.method === 'POST') {
    // Always ACK immediately so WhatsApp doesn't retry
    res.status(200).json({ status: 'ok' })

    try {
      const body = req.body
      if (body.object !== 'whatsapp_business_account') return

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const messages = change.value?.messages
          if (!messages) continue

          for (const msg of messages) {
            if (msg.type !== 'image') {
              console.log(`⏭ Skipping non-image (type: ${msg.type})`)
              continue
            }

            const fromPhone = msg.from
            const mediaId   = msg.image.id
            const caption   = (msg.image.caption || '').trim()
            const timestamp = parseInt(msg.timestamp) * 1000 || Date.now()

            console.log(`📨 Image from ${fromPhone}`)

            // 1. Match shop
            const shop = await findShopByPhone(fromPhone)
            console.log(`🏪 Shop: ${shop ? shop.name : 'unknown'}`)

            // 2. Download image
            let photo = null
            try {
              photo = await downloadAsBase64(mediaId, WA_TOKEN)
              console.log(`🖼 Photo downloaded (${Math.round(photo.length / 1024)}KB)`)
            } catch (e) {
              console.error('Photo download failed:', e.message)
            }

            // 3. Save order to Firestore
            if (db && DEFAULT_UID) {
              const orderId  = makeOrderId()
              const orderNum = await getNextOrderNum(DEFAULT_UID)

              const order = {
                id:           orderId,
                createdAt:    timestamp,
                shop:         shop ? shop.name : `Unknown (${fromPhone})`,
                shopId:       shop ? shop.id   : null,
                fromPhone,
                status:       'pending',
                photo,
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
              }

              await db
                .collection('orders')
                .doc(DEFAULT_UID)
                .collection('userOrders')
                .doc(orderId)
                .set(order)

              console.log(`✅ Order ${orderId} saved (photo: ${photo ? 'yes' : 'no'})`)

              // 4. Reply to sender
              if (WA_TOKEN && PHONE_ID) {
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
                  {
                    headers: {
                      Authorization: `Bearer ${WA_TOKEN}`,
                      'Content-Type': 'application/json',
                    },
                  }
                ).catch(e => console.warn('Reply failed:', e.message))
              }
            } else {
              console.error('❌ Firestore not initialized or DEFAULT_UID missing')
            }
          }
        }
      }
    } catch (err) {
      console.error('Webhook error:', err.message)
    }

    return
  }

  // ── Other methods ─────────────────────────────────────
  res.status(405).json({ error: 'Method not allowed' })
}