require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const admin   = require('firebase-admin');

// ── Firebase Admin init ───────────────────────────────────
// Paste your serviceAccountKey.json content into FIREBASE_SERVICE_ACCOUNT env var
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT env var missing or invalid JSON');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET // e.g. orderdesk-9023f.firebasestorage.app
});

const db      = admin.firestore();
const bucket  = admin.storage().bucket();

// ── Express setup ─────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const {
  WHATSAPP_VERIFY_TOKEN,   // any random string you set in Meta dashboard
  WHATSAPP_TOKEN,          // your permanent WhatsApp Cloud API token
  WHATSAPP_PHONE_ID,       // your WhatsApp Phone Number ID
  PORT = 3000
} = process.env;

// ── Helpers ───────────────────────────────────────────────
function makeOrderId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Strip non-digits and normalize phone for matching
// WhatsApp sends numbers like "919876543210" (country code + number, no +)
function normalizePhone(raw) {
  return String(raw).replace(/\D/g, '');
}

// Find shop in Firestore by whatsappNumber
async function findShopByPhone(phone) {
  const normalized = normalizePhone(phone);
  // Try exact match first, then suffix match (last 10 digits)
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

// Get next order number across ALL orders (scan max)
async function getNextOrderNum(uid) {
  const snap = await db.collection('orders').doc(uid).collection('userOrders').get();
  let max = 0;
  snap.forEach(d => { if (d.data().orderNum > max) max = d.data().orderNum; });
  return max + 1;
}

// Download WhatsApp media and upload to Firebase Storage, return public URL
async function downloadAndStoreMedia(mediaId) {
  // Step 1: get media URL from WhatsApp
  const infoRes = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
  const mediaUrl = infoRes.data.url;

  // Step 2: download binary
  const mediaRes = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
  });

  const mimeType   = mediaRes.headers['content-type'] || 'image/jpeg';
  const ext        = mimeType.split('/')[1] || 'jpg';
  const fileName   = `whatsapp-orders/${mediaId}.${ext}`;
  const fileBuffer = Buffer.from(mediaRes.data);

  // Step 3: upload to Firebase Storage
  const file = bucket.file(fileName);
  await file.save(fileBuffer, {
    metadata: { contentType: mimeType },
    public: true
  });
  await file.makePublic();

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  return publicUrl;
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
  // Always ACK immediately so WhatsApp doesn't retry
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
          // Only handle image messages
          if (msg.type !== 'image') continue;

          const fromPhone = msg.from; // e.g. "919876543210"
          const mediaId   = msg.image.id;
          const caption   = (msg.image.caption || '').trim();
          const timestamp = parseInt(msg.timestamp) * 1000 || Date.now();

          console.log(`📨  Image from ${fromPhone}, mediaId=${mediaId}`);

          // 1. Look up shop by phone number
          const shop = await findShopByPhone(fromPhone);

          // 2. Download image → Firebase Storage (returns URL string)
          let photoUrl = null;
          try {
            photoUrl = await downloadAndStoreMedia(mediaId);
            console.log(`🖼   Stored: ${photoUrl}`);
          } catch (e) {
            console.error('Photo download failed:', e.message);
          }

          // 3. Build order object
          // We store it under a special "whatsapp" UID so the app can show
          // incoming WhatsApp orders separately until assigned to a user.
          // You can change this logic to store under a specific staff UID.
          const targetUid = process.env.DEFAULT_UID || 'whatsapp_incoming';

          const orderId  = makeOrderId();
          const orderNum = await getNextOrderNum(targetUid);

          const order = {
            id:           orderId,
            createdAt:    timestamp,
            shop:         shop ? shop.name : `Unknown (${fromPhone})`,
            shopId:       shop ? shop.id   : null,
            fromPhone:    fromPhone,
            status:       'pending',
            photo:        photoUrl,
            photoUrl:     photoUrl,     // URL reference (not base64)
            source:       'whatsapp',
            worker:       '',
            supervisor:   '',
            deadline:     '',
            notes:        caption || '',
            orderNum:     orderNum,
            shopResolved: !!shop        // flag so app can highlight unresolved
          };

          // 4. Save to Firestore
          await db
            .collection('orders')
            .doc(targetUid)
            .collection('userOrders')
            .doc(orderId)
            .set(order);

          console.log(`✅  Order ${orderId} saved (shop: ${order.shop})`);

          // 5. Optional: send WhatsApp reply to confirm receipt
          if (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
            const replyText = shop
              ? `✅ Order received from *${shop.name}*. Order #${orderNum} created.`
              : `✅ Order received. Shop not found for this number — please update in OrderDesk.`;

            await axios.post(
              `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`,
              {
                messaging_product: 'whatsapp',
                to: fromPhone,
                type: 'text',
                text: { body: replyText }
              },
              { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
            ).catch(e => console.warn('Reply failed:', e.message));
          }
        }
      }
    }
  } catch (err) {
    console.error('Webhook error:', err);
  }
});

// ── Health check ──────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.listen(PORT, () => console.log(`🚀  OrderDesk webhook running on port ${PORT}`));
