# OrderDesk — WhatsApp Webhook Backend

This is the backend server that receives WhatsApp image orders and saves them to Firebase.

---

## 🚀 Deploy in 5 minutes (Railway — recommended free option)

### Step 1 — Push to GitHub
1. Create a new GitHub repo (e.g. `orderdesk-webhook`)
2. Upload these files: `server.js`, `package.json`, `.env.example`
3. Do NOT upload `.env` (keep secrets out of GitHub)

### Step 2 — Deploy on Railway
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select your repo
3. Railway auto-detects Node.js and runs `npm start`
4. After deploy, copy your Railway URL (e.g. `https://orderdesk-webhook-production.up.railway.app`)

### Step 3 — Set environment variables on Railway
In Railway → your project → Variables, add each line from `.env.example`:

| Variable | Where to get it |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Make up any random string, e.g. `orderdesk_secret_2024` |
| `WHATSAPP_TOKEN` | Meta Developer Console → WhatsApp → API Setup → copy token |
| `WHATSAPP_PHONE_ID` | Meta Developer Console → WhatsApp → API Setup → Phone Number ID |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Project Settings → Service Accounts → Generate Key → open JSON → copy ALL contents as one line |
| `FIREBASE_STORAGE_BUCKET` | Firebase Console → Storage → shows bucket name at top |
| `DEFAULT_UID` | Firebase Console → Authentication → Users → copy your UID |

### Step 4 — Configure Firebase Storage rules
In Firebase Console → Storage → Rules, allow public read (images need to be accessible):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /whatsapp-orders/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

### Step 5 — Connect WhatsApp webhook in Meta Developer Console
1. Go to [developers.facebook.com](https://developers.facebook.com) → your app
2. WhatsApp → Configuration → Webhooks
3. **Callback URL**: `https://YOUR-RAILWAY-URL.railway.app/webhook`
4. **Verify token**: the same string you set as `WHATSAPP_VERIFY_TOKEN`
5. Click Verify and Save
6. Subscribe to: **messages** field

### Step 6 — Test it
Send an image from any WhatsApp number to your business number.  
Check Railway logs — you should see:
```
📨  Image from 919876543210, mediaId=xxx
🖼   Stored: https://storage.googleapis.com/...
✅  Order abc123 saved (shop: Al Noor Store)
```
Then open OrderDesk app → the order appears instantly!

---

## How phone → shop matching works

When a WhatsApp image arrives from phone `+91 98765 43210`:
1. The webhook normalizes it to `919876543210`
2. It scans your **Shops** database in Firebase
3. It matches on last 10 digits (so `919876543210` matches shop with `9876543210`)
4. If found → order is created with that shop name
5. If not found → order is created as `Unknown (919876543210)` — you can edit it in the app

---

## Firestore data structure

```
orders/
  {uid}/
    userOrders/
      {orderId}: { shop, status, photo, photoUrl, source, fromPhone, shopId, ... }

shops/
  {shopId}: { name, whatsappNumber, area, createdAt }
```

---

## Local development

```bash
cp .env.example .env
# Fill in your values in .env
npm install
npm run dev
# Use ngrok to expose localhost for testing:
npx ngrok http 3000
```
