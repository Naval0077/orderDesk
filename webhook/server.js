require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const admin   = require('firebase-admin');

// ── Firebase Admin init ───────────────────────────────────
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT env var missing or invalid JSON');
  process.exit(1);
}

console.log('🔑  Project ID:', serviceAccount.project_id);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ── Express setup ─────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const {
  WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_ID,
  PORT = 3000
} = process.env;

// ── Helpers ───────────────────────────────────────────────
function makeOrderId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function normalizePhone(raw) {
  return String(raw).replace(/\D/g, '');
}

async function findShopByPhone(phone) {
  const normalized = normalizePhone(phone);
  const snap = await db.collection('shops').get();
  let match = null;
  snap.forEach(doc => {
    const shopPhone = normalizePhone(doc.data().whatsappNumber || '');
    if (
      shopPhone === normalized ||
      shopPhone.endsWith(normalized.slice(-10)) ||
      normalized.endsWith(shopPhone.slice(-10))
    ) {
      match = { id: doc.id, ...doc.data() };
    }
  });
  return match;
}

async function getNextOrderNum(uid) {
  const snap = await db.collection('orders').doc(uid).collection('userOrders').get();
  let max = 0;
  snap.forEach(d => { if (d.data().orderNum > max) max = d.data().orderNum; });
  return max + 1;
}

// Download WhatsApp image and convert to base64 data URL
// Stored directly in Firestore — no Firebase Storage needed
async function downloadAsBase64(mediaId) {
  // Step 1: get media URL
  const infoRes = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
  const mediaUrl = infoRes.data.url;
  console.log('📥  Downloading media...');

  // Step 2: download binary
  const mediaRes = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
  });

  const mimeType = mediaRes.headers['content-type'] || 'image/jpeg';
  const base64   = Buffer.from(mediaRes.data).toString('base64');
  const dataURL  = `data:${mimeType};base64,${base64}`;

  console.log(`🖼   Photo ready (${Math.round(base64.length / 1024)}KB)`);
  return dataURL;
}

// ── Webhook verification (GET) ────────────────────────────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log('✅  Webhook verified');
    res.status(200).send(challenge);
  } else {
    console.warn('❌  Webhook verification failed');
    res.sendStatus(403);
  }
});

// ── Incoming WhatsApp messages (POST) ─────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value    = change.value;
        const messages = value?.messages;
        if (!messages) continue;

        for (const msg of messages) {
          if (msg.type !== 'image') {
            console.log(`⏭   Skipping non-image message (type: ${msg.type})`);
            continue;
          }

          const fromPhone = msg.from;
          const mediaId   = msg.image.id;
          const caption   = (msg.image.caption || '').trim();
          const timestamp = parseInt(msg.timestamp) * 1000 || Date.now();

          console.log(`📨  Image from ${fromPhone}, mediaId=${mediaId}`);

          // 1. Look up shop
          const shop = await findShopByPhone(fromPhone);
          console.log(`🏪  Shop match: ${shop ? shop.name : 'none'}`);

          // 2. Download image as base64
          let photoData = null;
          try {
            photoData = await downloadAsBase64(mediaId);
          } catch (e) {
            console.error('Photo download failed:', e.message);
          }

          // 3. Build and save order
          const targetUid = process.env.DEFAULT_UID || 'whatsapp_incoming';
          const orderId   = makeOrderId();
          const orderNum  = await getNextOrderNum(targetUid);

          const order = {
            id:           orderId,
            createdAt:    timestamp,
            shop:         shop ? shop.name : `Unknown (${fromPhone})`,
            shopId:       shop ? shop.id   : null,
            fromPhone:    fromPhone,
            status:       'pending',
            photo:        photoData,
            source:       'whatsapp',
            worker:       '',
            supervisor:   '',
            deadline:     '',
            notes:        caption || '',
            orderNum:     orderNum,
            shopResolved: !!shop,
            isBooking:    false,
            transport:    '',
            vehicleNum:   '',
          };

          await db
            .collection('orders')
            .doc(targetUid)
            .collection('userOrders')
            .doc(orderId)
            .set(order);

          console.log(`✅  Order ${orderId} saved (shop: ${order.shop}, photo: ${photoData ? 'yes' : 'no'})`);

          // 4. Reply to sender
          if (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
            const replyText = shop
              ? `✅ Order received from *${shop.name}*. Order #${orderNum} created.`
              : `✅ Order received. Shop not recognised — assign it in OrderDesk.`;

            await axios.post(
              `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`,
              {
                messaging_product: 'whatsapp',
                to: fromPhone,
                type: 'text',
                text: { body: replyText }
              },
              {
                headers: {
                  Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                  'Content-Type': 'application/json'
                }
              }
            ).catch(e => console.warn('Reply failed:', e.message));
          }
        }
      }
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

// ── Health check ──────────────────────────────────────────
app.get('/health', (_, res) => res.json({
  status: 'ok',
  service: 'OrderDesk Webhook',
  time: new Date().toISOString()
}));

app.listen(PORT, () => console.log(`🚀  OrderDesk webhook running on port ${PORT}`));