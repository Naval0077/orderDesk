const axios = require('axios')

// ── Body parser helper ────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve, reject) => {
    // Already parsed by Vercel
    if (req.body && typeof req.body === 'object') {
      return resolve(req.body)
    }
    // Parse raw string
    if (req.body && typeof req.body === 'string') {
      try { return resolve(JSON.parse(req.body)) }
      catch (e) { return reject(new Error('Invalid JSON string')) }
    }
    // Read stream
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) }
      catch (e) { reject(new Error('Invalid JSON: ' + data.slice(0, 100))) }
    })
    req.on('error', reject)
  })
}

function makeOrderId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function normalizePhone(raw) {
  return String(raw).replace(/\D/g, '')
}

function fromFs(val) {
  if (!val) return null
  if ('stringValue'  in val) return val.stringValue
  if ('integerValue' in val) return parseInt(val.integerValue)
  if ('doubleValue'  in val) return val.doubleValue
  if ('booleanValue' in val) return val.booleanValue
  if ('nullValue'    in val) return null
  if ('mapValue'     in val) {
    const obj = {}
    for (const k in (val.mapValue.fields || {})) obj[k] = fromFs(val.mapValue.fields[k])
    return obj
  }
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromFs)
  return null
}

function toFs(val) {
  if (val === null || val === undefined) return { nullValue: null }
  if (typeof val === 'boolean') return { booleanValue: val }
  if (typeof val === 'string')  return { stringValue: val }
  if (typeof val === 'number')  return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val }
  if (Array.isArray(val))       return { arrayValue: { values: val.map(toFs) } }
  if (typeof val === 'object') {
    const fields = {}
    for (const k in val) fields[k] = toFs(val[k])
    return { mapValue: { fields } }
  }
  return { nullValue: null }
}

function toFsDoc(obj) {
  const fields = {}
  for (const k in obj) fields[k] = toFs(obj[k])
  return { fields }
}

async function getFirebaseToken(sa) {
  function base64url(str) {
    return Buffer.from(str).toString('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  }
  const now    = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform'
  }))
  const crypto = require('crypto')
  const sign   = crypto.createSign('RSA-SHA256')
  sign.update(`${header}.${claims}`)
  const sig = sign.sign(sa.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwt = `${header}.${claims}.${sig}`

  const res = await axios.post(
    'https://oauth2.googleapis.com/token',
    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
  )
  return res.data.access_token
}

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

  // GET — verification
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Verified')
      return res.status(200).send(challenge)
    }
    return res.status(403).send('Forbidden')
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  // Parse body first
  let body
  try {
    body = await parseBody(req)
    console.log('📬 Body parsed, object:', body?.object)
  } catch (e) {
    console.error('❌ Body parse error:', e.message)
    return res.status(200).json({ status: 'ok' }) // always 200 to Meta
  }

  // ACK to Meta
  res.status(200).json({ status: 'ok' })

  try {
    if (body?.object !== 'whatsapp_business_account') {
      console.log('Not WA event:', body?.object)
      return
    }

    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages
    if (!messages?.length) { console.log('No messages in payload'); return }

    // Parse service account
    let sa
    try {
      sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      console.log('✅ SA parsed:', sa.project_id)
    } catch (e) {
      console.error('❌ SA parse failed:', e.message)
      return
    }

    const projectId = sa.project_id
    const BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`

    // Get Firebase token
    let fbToken
    try {
      fbToken = await getFirebaseToken(sa)
      console.log('✅ Firebase token obtained')
    } catch (e) {
      console.error('❌ Token failed:', e.response?.data || e.message)
      return
    }

    for (const msg of messages) {
      console.log(`📨 ${msg.type} from ${msg.from}`)
      if (msg.type !== 'image') continue

      const fromPhone = msg.from
      const mediaId   = msg.image?.id
      const caption   = msg.image?.caption || ''
      const timestamp = parseInt(msg.timestamp) * 1000 || Date.now()

      // Find shop
      let shop = null
      try {
        const normalized = normalizePhone(fromPhone)
        const r = await axios.get(`${BASE}/shops`, {
          headers: { Authorization: `Bearer ${fbToken}` }, timeout: 8000
        })
        const docs = r.data.documents || []
        console.log(`🏪 ${docs.length} shops in DB`)
        for (const doc of docs) {
          const data = {}
          for (const k in (doc.fields || {})) data[k] = fromFs(doc.fields[k])
          const shopPhone = normalizePhone(data.whatsappNumber || '')
          if (shopPhone.endsWith(normalized.slice(-10)) || normalized.endsWith(shopPhone.slice(-10))) {
            shop = { id: doc.name.split('/').pop(), ...data }
            break
          }
        }
        console.log('Shop:', shop ? shop.name : 'none')
      } catch (e) {
        console.error('❌ Shop lookup:', e.response?.status, e.message)
      }

      // Download photo
      let photo = null
      try {
        photo = await downloadAsBase64(mediaId, WA_TOKEN)
        console.log(`🖼 Photo: ${Math.round(photo.length / 1024)}KB`)
      } catch (e) {
        console.error('❌ Photo:', e.message)
      }

      // Get order number
      let orderNum = 1
      try {
        const r = await axios.get(`${BASE}/orders/${DEFAULT_UID}/userOrders`, {
          headers: { Authorization: `Bearer ${fbToken}` }, timeout: 8000
        })
        const docs = r.data.documents || []
        let max = 0
        docs.forEach(d => {
          const n = parseInt(d.fields?.orderNum?.integerValue || 0)
          if (n > max) max = n
        })
        orderNum = max + 1
        console.log('Order #:', orderNum)
      } catch (e) {
        console.error('❌ Order num:', e.message)
        orderNum = Date.now() % 1000 // fallback
      }

      // Save order
      const orderId = makeOrderId()
      console.log(`💾 Saving ${orderId}...`)
      try {
        await axios.post(
          `${BASE}/orders/${DEFAULT_UID}/userOrders?documentId=${orderId}`,
          toFsDoc({
            id: orderId, createdAt: timestamp,
            shop: shop ? shop.name : `Unknown (${fromPhone})`,
            shopId: shop?.id || null, fromPhone,
            status: 'pending', photo: photo || null,
            source: 'whatsapp', worker: '', supervisor: '',
            deadline: '', notes: caption, orderNum,
            shopResolved: !!shop, isBooking: false,
            transport: '', vehicleNum: '',
          }),
          {
            headers: { Authorization: `Bearer ${fbToken}`, 'Content-Type': 'application/json' },
            timeout: 8000
          }
        )
        console.log('✅ Order saved!')
      } catch (e) {
        console.error('❌ Save failed:', e.response?.status, e.response?.data || e.message)
      }

      // Reply
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
        console.warn('⚠️ Reply:', e.message)
      }
    }
  } catch (err) {
    console.error('❌ Top error:', err.message)
    console.error(err.stack)
  }
}