const axios = require('axios')

// ── Firebase Admin ────────────────────────────────────────
let db = null

function getDb() {
  if (db) return db
  try {
    const admin = require('firebase-admin')
    if (!admin.apps.length) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT
      if (!raw) { console.error('❌ FIREBASE_SERVICE_ACCOUNT not set'); return null }
      const serviceAccount = JSON.parse(raw)
      console.log('🔑 Initializing Firebase for project:', serviceAccount.project_id)
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
    }
    db = admin.firestore()
    console.log('✅ Firestore connected')
    return db
  } catch (e) {
    console.error('❌ Firebase init failed:', e.message)
    return null
  }
}

// ── Helpers ───────────────────────────────────────────────
function makeOrderId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function normalizePhone(raw) {
  return String(raw).replace(/\D/g, '')
}

async function findShopByPhone(phone) {
  const firestore = getDb()
  if (!firestore) return null
  const normalized = normalizePhone(phone)
  const snap = await firestore.collection('shops').get()
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
  const firestore = getDb()
  if (!firestore) return 1
  const snap = await firestore
    .collection('orders')
    .doc(uid)
    .collection('userOrders')
    .get()
  let max = 0
  snap.forEach(d => { if (d.data().orderNum > max) max = d.data().orderNum })
  return max + 1
}

async function downloadAsBase64(mediaId, token) {
  const infoRes = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const mediaRes = await axios.get(infoRes.data.url, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${token}` },
  })
  const mimeType = mediaRes.headers['content-type'] || 'image/jpeg'
  const base64   = Buffer.from(mediaRes.data).toString('base64')
  return `data:${mimeType};base64,${base64}`
}

// ── Main handler ──────────────────────────────────────────
module.exports = async function handler(req, res) {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN
  const WA_TOKEN     = process.env.WHATSAPP_TOKEN
  const PHONE_ID     = process.env.WHATSAPP_PHONE_ID
  const DEFAULT_UID  = process.env.DEFAULT_UID

  // ── GET — verification ────────────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode']
    const token     = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    console.log('Verification — mode:', mode, '| matches:', token === VERIFY_TOKEN)
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified')
      return res.status(200).send(challenge)
    }
    return res.status(403).json({ error: 'Verification failed' })
  }

  // ── POST — incoming message ───────────────────────────
  if (req.method === 'POST') {
    res.status(200).json({ status: 'ok' })

    try {
      const body = req.body
      console.log('📬 POST received, object:', body.object)

      if (body.object !== 'whatsapp_business_account') {
        console.log('⏭ Not a whatsapp_business_account event, skipping')
        return
      }

      // Log env var status
      console.log('🔧 ENV check — DEFAULT_UID:', DEFAULT_UID ? DEFAULT_UID.slice(0,8)+'...' : '❌ MISSING')
      console.log('🔧 ENV check — WA_TOKEN:', WA_TOKEN ? '✅ set' : '❌ MISSING')
      console.log('🔧 ENV check — FIREBASE_SERVICE_ACCOUNT:', process.env.FIREBASE_SERVICE_ACCOUNT ? '✅ set' : '❌ MISSING')

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const messages = change.value?.messages
          if (!messages) {
            console.log('⏭ No messages in this change event')
            continue
          }

          for (const msg of messages) {
            console.log(`📨 Message type: ${msg.type} from ${msg.from}`)

            if (msg.type !== 'image') {
              console.log(`⏭ Skipping non-image message`)
              continue
            }

            const fromPhone = msg.from
            const mediaId   = msg.image.id
            const caption   = (msg.image.caption || '').trim()
            const timestamp = parseInt(msg.timestamp) * 1000 || Date.now()

            // 1. Match shop
            const shop = await findShopByPhone(fromPhone)
            console.log(`🏪 Shop match: ${shop ? shop.name : 'none found'}`)

            // 2. Download photo
            let photo = null
            try {
              photo = await downloadAsBase64(mediaId, WA_TOKEN)
              console.log(`🖼 Photo ready (${Math.round(photo.length / 1024)}KB)`)
            } catch (e) {
              console.error('❌ Photo download failed:', e.message)
            }

            // 3. Save to Firestore
            if (!DEFAULT_UID) {
              console.error('❌ DEFAULT_UID is not set — cannot save order')
              continue
            }

            const firestore = getDb()
            if (!firestore) {
              console.error('❌ Firestore not available — cannot save order')
              continue
            }

            const orderId  = makeOrderId()
            const orderNum = await getNextOrderNum(DEFAULT_UID)

            console.log(`💾 Saving order ${orderId} under UID ${DEFAULT_UID.slice(0,8)}... orderNum: ${orderNum}`)

            await firestore
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
              })

            console.log(`✅ Order ${orderId} saved successfully`)

            // 4. Reply
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
              ).catch(e => console.warn('⚠️ Reply failed:', e.message))
            }
          }
        }
      }
    } catch (err) {
      console.error('❌ Webhook error:', err.message)
      console.error(err.stack)
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}