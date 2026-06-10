# OrderDesk

Mobile-first order management web app for pipe distribution. Built with React + Vite + Firebase.

## Features

- 📦 **Orders** — Active / Pending / Done tabs with real-time sync across devices
- 🏪 **Shops database** — Store shop name, WhatsApp number, area/location
- 💬 **WhatsApp integration** — Receive orders as images via WhatsApp Cloud API (see `webhook/`)
- 📷 **Camera support** — Take photos or choose from gallery directly on mobile
- 🚛 **Booking & transport** — Mark orders as bookings with Lorry / Van / Bike / Auto
- ✅ **Bulk select & delete** — Long-press any card to enter bulk mode
- 🔐 **Auth** — Google sign-in or email/password via Firebase Auth
- 📲 **PWA** — Install to home screen for native app feel

---

## Project structure

```
orderdesk/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── BottomSheet      # Animated slide-up sheet (base)
│   │   ├── ConfirmSheet     # Delete confirmation sheet
│   │   ├── Lightbox         # Full-screen image viewer
│   │   ├── NewOrderSheet    # Add new order form
│   │   ├── OrderCard        # Single order row card
│   │   ├── OrderDetailSheet # Full order edit/action panel
│   │   ├── PhotoPicker      # Camera / gallery picker
│   │   └── Toast            # Toast notifications
│   ├── hooks/               # Custom React hooks
│   │   ├── useAuth          # Firebase auth state + actions
│   │   ├── useOrders        # Firestore orders CRUD + realtime
│   │   ├── useShops         # Firestore shops CRUD + realtime
│   │   └── useToast         # Toast notification state
│   ├── lib/
│   │   ├── firebase.js      # Firebase app initialization
│   │   └── utils.js         # Helpers: dates, IDs, image compression
│   ├── pages/
│   │   ├── LoginPage        # Auth screen
│   │   ├── OrdersPage       # Main orders view
│   │   └── ShopsPage        # Shops management screen
│   ├── styles/
│   │   └── global.css       # CSS variables + resets
│   ├── App.jsx              # Root component, routing
│   └── main.jsx             # React entry point
├── webhook/                 # WhatsApp Cloud API backend (Node.js)
│   ├── server.js
│   ├── package.json
│   └── README.md
├── public/
│   └── manifest.json        # PWA manifest
├── index.html
├── vite.config.js
├── .env.example
└── package.json
```

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/orderdesk.git
cd orderdesk
npm install
```

### 2. Set up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com) → Create a project
2. Enable **Authentication** → Sign-in methods → Google + Email/Password
3. Enable **Firestore Database** → Start in production mode
4. Go to **Project Settings** → Your Apps → Add Web App → copy config

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env` with your Firebase config values:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 4. Set Firestore security rules

In Firebase Console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Orders: each user owns their own
    match /orders/{uid}/userOrders/{orderId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    // Shops: any logged-in user can read/write
    match /shops/{shopId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 5. Run locally

```bash
npm run dev
# Open http://localhost:5173
```

### 6. Build for production

```bash
npm run build
# Output in dist/ — deploy to Vercel, Netlify, Firebase Hosting, etc.
```

---

## Deploy to Vercel (recommended)

```bash
npm install -g vercel
vercel
# Follow prompts, set env vars in Vercel dashboard
```

Or connect your GitHub repo to Vercel for automatic deploys on every push.

---

## Deploy to Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # select dist/ as public dir, SPA: yes
npm run build
firebase deploy
```

---

## WhatsApp webhook setup

See `webhook/README.md` for full instructions on deploying the Node.js backend that receives WhatsApp image orders and saves them to Firestore.

Short version:
1. Deploy `webhook/` to Railway or Render (free tier)
2. Set env vars (WhatsApp token, Firebase service account)
3. Paste the Railway URL into Meta Developer Console as webhook URL
4. Subscribe to the `messages` field

WhatsApp orders appear instantly in the app with a 💬 badge. If the sender's phone number matches a shop in your Shops database, the shop is auto-assigned. Otherwise you can assign it manually in the order detail view.

---

## Usage tips

| Action | How |
|---|---|
| Add order | Tap **＋** FAB or bottom nav |
| Open order details | Tap any card |
| Activate pending order | Open order → ⚡ Activate |
| Complete order | Open order → ✓ Complete |
| Bulk delete | Long-press a card → select → 🗑 Delete |
| Add a shop | Shops tab → ＋ Add Shop |
| Assign WhatsApp order | Open WA order → select shop in dropdown |
| Filter by date | Bottom nav 📅 Filter |
| Install as app | Browser → Share → Add to Home Screen |
