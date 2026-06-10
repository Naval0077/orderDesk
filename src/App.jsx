import { useState } from 'react'
import { useAuth }    from './hooks/useAuth'
import { useOrders }  from './hooks/useOrders'
import { useShops }   from './hooks/useShops'
import { useToast }   from './hooks/useToast'
import { LoginPage }  from './pages/LoginPage'
import { OrdersPage } from './pages/OrdersPage'
import { ShopsPage }  from './pages/ShopsPage'
import { ToastContainer } from './components/Toast'
import { Lightbox }   from './components/Lightbox'
import './styles/global.css'

export default function App() {
  const auth   = useAuth()
  const orders = useOrders(auth.user?.uid)
  const shops  = useShops()
  const { toasts, toast } = useToast()
  const [view, setView] = useState('orders') // 'orders' | 'shops'

  // ── Loading splash ────────────────────────────────────
  if (auth.user === undefined) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 36, letterSpacing: 3,
          color: 'var(--ink)',
        }}>
          ORDER<span style={{ color: 'var(--ac)' }}>DESK</span>
        </div>
      </div>
    )
  }

  // ── Login screen ──────────────────────────────────────
  if (!auth.user) {
    return (
      <>
        <LoginPage
          onLogin={auth.loginEmail}
          onRegister={auth.registerEmail}
          onGoogle={auth.loginGoogle}
          error={auth.error}
          loading={auth.loading}
        />
        <ToastContainer toasts={toasts} />
      </>
    )
  }

  // ── Main app ──────────────────────────────────────────
  return (
    <>
      {view === 'orders' && (
        <OrdersPage
          user={auth.user}
          orders={orders.orders}
          shops={shops.shops}
          syncing={orders.syncing}
          onSaveOrder={orders.saveOrder}
          onDeleteOrder={orders.deleteOrder}
          onDeleteBatch={orders.deleteBatch}
          onCreateOrder={orders.createOrder}
          onActivateOrder={orders.activateOrder}
          onCompleteOrder={orders.completeOrder}
          onReopenOrder={orders.reopenOrder}
          onShowShops={() => setView('shops')}
          onSignOut={auth.logout}
          onToast={toast}
        />
      )}

      {view === 'shops' && (
        <ShopsPage
          shops={shops.shops}
          onBack={() => setView('orders')}
          onSave={shops.saveShop}
          onDelete={shops.deleteShop}
          onToast={toast}
        />
      )}

      <ToastContainer toasts={toasts} />
      <Lightbox />
    </>
  )
}
