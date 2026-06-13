const axios = require('axios')

// ── Use Firebase REST API instead of Admin SDK ────────────
// This avoids the gRPC/network issues with firebase-admin in Vercel serverless

function makeOrderId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function normalizePhone(raw) {
  return String(raw).replace(/\D/g, '')
}

// Get a Firebase access token from service account credentials
async function getFirebaseToken() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  
  // Create JWT for service account
  const jwt = require('jsonwebtoken')
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform'
  }
  
  const token = jwt.sign(payload, sa.private_key, { algorithm: 'RS256' })
  
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: token
  })
  
  return res.data.access_token
}

// Firestore REST base URL
function fsUrl(projectId, path) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`
}

// Convert Firestore REST value to JS value
function fromFsValue(val) {
  if (val.stringValue !== undefined) return val.stringValue
  if (val.integerValue !== undefined) return parseInt(val.integerValue)
  if (val.doubleValue !== undefined) return val.doubleValue
  if (val.booleanValue !== undefined) return val.booleanValue
  if (val.nullValue !== undefined) return null
  if (val.mapValue) {
    const obj = {}
    const fields = val.mapValue.fields || {}
    for (const k in fields) obj[k] = fromFsValue(fields[k])
    return obj
  }
  if (val.arrayValue) {
    return (val.arrayValue.values || []).map(fromFsValue)
  }
  return null
}

// Convert JS value to Firestore REST value
function toFsValue(val) {
  if (val === null || val === undefined) return { nullValue: null }
  if (typeof val === 'string') return { stringValue: val }
  if (typeof val === 'boolean') return { booleanValue: val }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) }
    return { doubleValue: val }
  }
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFsValue) } }
  if (typeof val === 'object') {
    const fields = {}
    for (const k in val) fields[k] = toFsValue(val[k])
    return { mapValue: { fields } }
  }
  return { nullValue: null }
}

// Convert JS object to Firestore fields
function toFsFields(obj) {
  const fields = {}
  for (const k in obj) fields[k] = toFsValue(obj[k])
  return fields
}

// Get all shops from Firestore via REST
async function getShops(projectId, token) {
  try {
    const res = await axios.get(fsUrl(projectId, 'shops'), {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000
    })
    const docs = res.data.documents || []
    return docs.map(doc => {
      const data = {}
      for (const k in (doc.fields || {})) data[k] = fromFsValue(doc.fields[k])
      const id = doc.name.split('/').pop()
      return { id, ...data }
    })
  } catch (e) {
    console.error('❌ Get shops failed:', e.message)
    return []
  }
}

// Get max order number via REST
async function getMaxOrderNum(projectId, token, uid) {
  try {
    const res = await axios.get(
      fsUrl(projectId, `orders/${uid}/userOrders`),
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000
      }
    )
    const docs = res.data.documents || []
    let max = 0
    docs.forEach(doc => {
      const num = doc.fields?.orderNum?.integerValue
      if (num && parseInt(num) > max) max = parseInt(num)
    })
    return max + 1
  } catch (e) {
    console.error('❌ Get order num failed:', e.message)
    return 1
  }
}

// Save order via REST
async function saveOrder(projectId, token, uid, orderId, orderData) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders/${uid}/userOrders?documentId=${orderId}`
  await axios.post(url, 
    { fields: toFsFields(orderData) },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 8000 }
  )
}

// Download WhatsApp image as base64
async function downloadAsBase64(mediaId, waToken) {
  const infoRes = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${waToken}` }, timeout: 10000 }
  )
  const mediaRes = await axios.get(infoRes.data.url, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${waToken}` },
    timeout: 15000
  })
  const mimeType = mediaRes.headers['content-type'] || 'image/jpeg'
  return `data:${mimeType};base64,${Buffer.from(mediaRes.data).toString('base64')}`
}

// ── Main handler ──────────────────────────────────────────
module.exports = async function handler(req, res) {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN
  const WA_TOKEN     = process.env.WHATSAPP_TOKEN
  const PHONE_ID     = process.env.WHATSAPP_PHONE_ID
  const DEFAULT_UID  = process.env.DEFAULT_UID

  // ── GET — verification ──────────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode']
    const token     = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Verified')
      return res.status(200).send(challenge)
    }
    return res.status(403).send('Forbidden')
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  res.status(200).json({ status: 'ok' })

  try {
    const body = req.body
    if (body?.object !== 'whatsapp_business_account') return

    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages
    if (!messages?.length) { console.log('No messages in payload'); return }

    for (const msg of messages) {
      console.log(`📨 ${msg.type} from ${msg.from}`)
      if (msg.type !== 'image') continue

      const fromPhone = msg.from
      const mediaId   = msg.image?.id
      const caption   = msg.image?.caption || ''
      const timestamp = parseInt(msg.timestamp) * 1000 || Date.now()

      // Get project ID from service account
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      const projectId = sa.project_id
      console.log('Project:', projectId)

      // Step 1: Get Firebase access token
      console.log('Step 1: Getting Firebase token...')
      let fbToken
      try {
        fbToken = await getFirebaseToken()
        console.log('✅ Got Firebase token')
      } catch (e) {
        console.error('❌ Token failed:', e.message)
        continue
      }

      // Step 2: Find shop
      console.log('Step 2: Finding shop...')
      let shop = null
      const normalized = normalizePhone(fromPhone)
      const shops = await getShops(projectId, fbToken)
      console.log(`Found ${shops.length} shops`)
      for (const s of shops) {
        const shopPhone = normalizePhone(s.whatsappNumber || '')
        if (shopPhone.endsWith(normalized.slice(-10)) || normalized.endsWith(shopPhone.slice(-10))) {
          shop = s
          break
        }
      }
      console.log('🏪 Shop:', shop ? shop.name : 'none')

      // Step 3: Download photo
      console.log('Step 3: Downloading photo...')
      let photo = null
      try {
        photo = await downloadAsBase64(mediaId, WA_TOKEN)
        console.log(`🖼 Photo: ${Math.round(photo.length / 1024)}KB`)
      } catch (e) {
        console.error('❌ Photo failed:', e.message)
      }

      // Step 4: Order number
      console.log('Step 4: Getting order number...')
      const orderNum = await getMaxOrderNum(projectId, fbToken, DEFAULT_UID)
      console.log('Order #:', orderNum)

      // Step 5: Save order
      const orderId = makeOrderId()
      console.log(`Step 5: Saving order ${orderId}...`)
      try {
        await saveOrder(projectId, fbToken, DEFAULT_UID, orderId, {
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
          ? `✅ Order from *${shop.name}*. Order #${orderNum} created.`
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
    console.error('❌ Top error:', err.message)
    console.error(err.stack)
  }
}
