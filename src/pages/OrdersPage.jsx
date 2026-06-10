import { useState, useMemo } from 'react'
import { OrderCard }        from '../components/OrderCard'
import { OrderDetailSheet } from '../components/OrderDetailSheet'
import { NewOrderSheet }    from '../components/NewOrderSheet'
import { ConfirmSheet }     from '../components/ConfirmSheet'
import { matchesSearch, matchesDateRange } from '../lib/utils'
import styles from './OrdersPage.module.css'

const TABS = ['active', 'pending', 'done']

export function OrdersPage({
  user, orders, shops, syncing,
  onSaveOrder, onDeleteOrder, onDeleteBatch,
  onCreateOrder, onActivateOrder, onCompleteOrder, onReopenOrder,
  onShowShops, onSignOut, onToast,
}) {
  const [tab,        setTab]        = useState('active')
  const [query,      setQuery]      = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [bulkMode,   setBulkMode]   = useState(false)
  const [selected,   setSelected]   = useState(new Set())
  const [detailId,   setDetailId]   = useState(null)
  const [newOpen,    setNewOpen]     = useState(false)
  const [userOpen,   setUserOpen]    = useState(false)
  const [confirmDel, setConfirmDel] = useState(null) // { ids, label }

  // ── Derived data ────────────────────────────────────────
  const counts = useMemo(() => ({
    active:  orders.filter(o => o.status === 'active').length,
    pending: orders.filter(o => o.status === 'pending').length,
    done:    orders.filter(o => o.status === 'done').length,
  }), [orders])

  const filtered = useMemo(() => {
    return orders
      .filter(o => o.status === tab)
      .filter(o => matchesSearch(o, query))
      .filter(o => matchesDateRange(o, dateFrom, dateTo))
      .sort((a, b) => {
        const ta = a.completedAt || a.createdAt
        const tb = b.completedAt || b.createdAt
        return tb - ta
      })
  }, [orders, tab, query, dateFrom, dateTo])

  const detailOrder = detailId ? orders.find(o => o.id === detailId) : null

  // ── Bulk select ─────────────────────────────────────────
  function enterBulk()  { setBulkMode(true);  setSelected(new Set()) }
  function exitBulk()   { setBulkMode(false); setSelected(new Set()) }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function askBulkDelete() {
    if (selected.size === 0) { onToast('Select orders first', 'err'); return }
    setConfirmDel({
      ids:   Array.from(selected),
      label: `Delete ${selected.size} order${selected.size > 1 ? 's' : ''}?`,
      msg:   `Permanently delete ${selected.size} selected order${selected.size > 1 ? 's' : ''}? This cannot be undone.`,
      btn:   `Delete ${selected.size} Orders`,
    })
  }

  async function executeBulkDelete() {
    const ids = confirmDel.ids
    setConfirmDel(null)
    await onDeleteBatch(ids)
    exitBulk()
    onToast(`Deleted ${ids.length} orders`, 'err')
  }

  // ── Order actions ────────────────────────────────────────
  async function handleAddOrder({ shop, shopId, photo }) {
    const order = onCreateOrder({ shop, shopId, photo })
    await onSaveOrder(order)
    onToast('Order added', 'ok')
    setTab('pending')
  }

  async function handleActivate(orderData) {
    const updated = onActivateOrder(orderData)
    await onSaveOrder(updated)
  }

  async function handleComplete(orderData) {
    const updated = onCompleteOrder(orderData)
    await onSaveOrder(updated)
    setTab('done')
  }

  async function handleReopen(orderData) {
    const updated = onReopenOrder(orderData)
    await onSaveOrder(updated)
    setTab('active')
  }

  function askDeleteOne(id) {
    const o = orders.find(x => x.id === id)
    setConfirmDel({
      ids:   [id],
      label: `Delete Order?`,
      msg:   `Delete order for "${o?.shop}"? This cannot be undone.`,
      btn:   'Delete Order',
    })
  }

  async function executeDelete() {
    const { ids } = confirmDel
    setConfirmDel(null)
    if (ids.length === 1) {
      if (detailId === ids[0]) setDetailId(null)
      await onDeleteOrder(ids[0])
    } else {
      await onDeleteBatch(ids)
    }
    onToast(ids.length > 1 ? `Deleted ${ids.length} orders` : 'Order deleted', 'err')
  }

  const unresolved = orders.filter(o => o.source === 'whatsapp' && !o.shopResolved).length
  const userName   = user?.displayName || user?.email || 'User'
  const userLetter = userName.charAt(0).toUpperCase()

  return (
    <div className={styles.app}>

      {/* ── Topbar ── */}
      {bulkMode ? (
        <div className={styles.bulkBar}>
          <button className={styles.bulkCancel} onClick={exitBulk}>Cancel</button>
          <span className={styles.bulkCount}>{selected.size} selected</span>
          <button className={styles.bulkDel} onClick={askBulkDelete}>🗑 Delete</button>
        </div>
      ) : (
        <div className={styles.topbar}>
          <div className={styles.logo}>O<em>D</em></div>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              className={styles.searchInput}
              type="search"
              placeholder="Search orders…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div
            className={styles.avatar}
            onClick={() => setUserOpen(true)}
            title={userName}
          >
            {user?.photoURL
              ? <img src={user.photoURL} alt="" />
              : userLetter
            }
          </div>
        </div>
      )}

      {/* ── Stats strip ── */}
      <div className={styles.stats}>
        <div className={styles.statItem}>
          <span className={styles.statNum} style={{ color: 'var(--ac)' }}>{counts.active}</span>
          <span className={styles.statLbl}>Active</span>
        </div>
        <div className={styles.statSep} />
        <div className={styles.statItem}>
          <span className={styles.statNum} style={{ color: 'var(--bl)' }}>{counts.pending}</span>
          <span className={styles.statLbl}>Pending</span>
        </div>
        <div className={styles.statSep} />
        <div className={styles.statItem}>
          <span className={styles.statNum} style={{ color: 'var(--gn)' }}>{counts.done}</span>
          <span className={styles.statLbl}>Done</span>
        </div>
        <div className={styles.statSep} />
        <div className={styles.statItem}>
          <span className={styles.statNum} style={{ color: 'var(--ink2)' }}>{orders.length}</span>
          <span className={styles.statLbl}>Total</span>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t}
            className={`${styles.tab} ${styles['tab_' + t]} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t.toUpperCase()}
            <span className={`${styles.badge} ${styles['badge_' + t]}`}>{counts[t]}</span>
          </button>
        ))}
      </div>

      {/* ── Date filter bar ── */}
      {filterOpen && (
        <div className={styles.filterBar}>
          <span className={styles.filterLbl}>Date</span>
          <input type="date" className={styles.dateInput} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className={styles.filterSep}>→</span>
          <input type="date" className={styles.dateInput} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <button className={styles.clearBtn} onClick={() => { setDateFrom(''); setDateTo('') }}>Clear</button>
          <div className={styles.syncWrap}>
            <span className={`${styles.syncDot} ${syncing ? styles.syncDotOn : ''}`} />
            <span>{syncing ? 'Syncing…' : 'Live'}</span>
          </div>
        </div>
      )}

      {/* ── WhatsApp banner ── */}
      {unresolved > 0 && !bulkMode && (
        <div className={styles.waBanner}>
          <span>💬</span>
          <span className={styles.waBannerTxt}>
            <strong>{unresolved} WhatsApp order{unresolved > 1 ? 's' : ''} need shop assignment</strong>
            Tap each order to assign a shop.
          </span>
        </div>
      )}

      {/* ── Orders list ── */}
      <div className={styles.list}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>{{ active: '📦', pending: '⏳', done: '✅' }[tab]}</div>
            <div>No {tab} orders</div>
          </div>
        ) : filtered.map(o => (
          <OrderCard
            key={o.id}
            order={o}
            query={query}
            bulkMode={bulkMode}
            selected={selected.has(o.id)}
            onPress={() => bulkMode ? toggleSelect(o.id) : setDetailId(o.id)}
            onLongPress={() => { enterBulk(); toggleSelect(o.id) }}
          />
        ))}
        <div style={{ height: 8 }} />
      </div>

      {/* ── FAB ── */}
      {!bulkMode && (
        <button className={styles.fab} onClick={() => setNewOpen(true)}>＋</button>
      )}

      {/* ── Bottom nav ── */}
      <nav className={styles.nav}>
        <button className={`${styles.ni} ${styles.niActive}`} onClick={() => {}}>
          <span className={styles.niIcon}>📦</span><span>Orders</span>
        </button>
        <button className={styles.ni} onClick={() => setQuery(prev => { document.querySelector('.' + styles.searchInput)?.focus(); return prev })}>
          <span className={styles.niIcon}>🔍</span><span>Search</span>
        </button>
        <button className={styles.ni} onClick={() => setNewOpen(true)}>
          <span className={styles.niIcon}>＋</span><span>New</span>
        </button>
        <button className={styles.ni} onClick={onShowShops}>
          <span className={styles.niIcon}>🏪</span><span>Shops</span>
        </button>
        <button className={styles.ni} onClick={() => setFilterOpen(f => !f)}>
          <span className={styles.niIcon}>📅</span><span>Filter</span>
        </button>
      </nav>

      {/* ── Sheets & modals ── */}
      <NewOrderSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onAdd={handleAddOrder}
        shops={shops}
        onToast={onToast}
      />

      <OrderDetailSheet
        order={detailOrder}
        shops={shops}
        open={!!detailOrder}
        onClose={() => setDetailId(null)}
        onSave={onSaveOrder}
        onActivate={handleActivate}
        onComplete={handleComplete}
        onReopen={handleReopen}
        onDelete={askDeleteOne}
        onToast={onToast}
      />

      <ConfirmSheet
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={executeDelete}
        title={confirmDel?.label || 'Delete?'}
        message={confirmDel?.msg || ''}
        confirmLabel={confirmDel?.btn || 'Delete'}
      />

      {/* User sheet */}
      {userOpen && (
        <>
          <div className={styles.uBack} onClick={() => setUserOpen(false)} />
          <div className={`${styles.uSheet} ${userOpen ? styles.uSheetOpen : ''}`}>
            <div className={styles.uHandle} />
            <div className={styles.uAv}>
              {user?.photoURL ? <img src={user.photoURL} alt="" /> : userLetter}
            </div>
            <div className={styles.uName}>{userName}</div>
            <div className={styles.uEmail}>{user?.email}</div>
            <button className={styles.uSignOut} onClick={onSignOut}>Sign Out</button>
          </div>
        </>
      )}
    </div>
  )
}
