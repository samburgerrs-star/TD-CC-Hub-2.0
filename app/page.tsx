'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowRight, BadgeCheck, Bell, Check, ChevronDown, CircleHelp, Clock3, Copy,
  CreditCard, Database, Eye, EyeOff, FileKey2, LayoutDashboard, LockKeyhole,
  Mail, Menu, PackageCheck, Plus, QrCode, RefreshCw, ShieldCheck, Sparkles,
  TicketCheck, UserRound, Users, X, Zap, LogOut, Globe2, MessageCircle, AtSign,
} from 'lucide-react'

const initialAssets = [
  { id: 'a1', category: 'standard', provider: 'Type A', region: 'United States', prefix: '41A7X2', key: '41A7X2K9M4P8R1Q6', price: 0 },
  { id: 'a2', category: 'standard', provider: 'Type B', region: 'Singapore', prefix: '41B3N8', key: '41B3N8V2L7D5S0Z4', price: 0 },
  { id: 'a3', category: 'priority', provider: 'Type C', region: 'United Kingdom', prefix: '41C9P4', key: '41C9P4H8N2W6X5M1', price: 29 },
  { id: 'a4', category: 'priority', provider: 'Type D', region: 'Canada', prefix: '41D2Q7', key: '41D2Q7F6T9K3B8L0', price: 49 },
]

type Asset = typeof initialAssets[number]
type User = { id: string; name: string; email: string; provider?: string }
type Verification = { id: string; assetId: string; email: string; code: string; status: 'pending' | 'approved' | 'rejected'; timestamp: string; userId: string }
type Order = { id: string; assetId: string; email: string; transaction: string; status: 'pending' | 'approved'; created: string }

const masked = (key: string) => `${key.slice(0, 2)}${'*'.repeat(Math.max(0, key.length - 4))}${key.slice(-2)}`
const money = (value: number) => `$${value.toFixed(2)}`
const demoMode = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_TD_HUB_REAL_BACKEND !== 'true'
const demoUser: User = { id: 'demo-user', name: '', email: '', provider: 'email' }

function useSharedState() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<User | null>(null)
  const [assets, setAssets] = useState<Asset[]>(initialAssets)
  const [verifications, setVerifications] = useState<Verification[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [approvedVerification, setApprovedVerification] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const refresh = async (session: Session | null) => {
    if (!session?.user) { setUser(null); setHydrated(true); return }
    const profile = await supabase.from('profiles').select('display_name, email, auth_provider, is_admin').eq('id', session.user.id).maybeSingle()
    const isAdmin = profile.data?.is_admin === true
    setUser({ id: session.user.id, email: session.user.email || profile.data?.email || '', name: profile.data?.display_name || '', provider: profile.data?.auth_provider || session.user.app_metadata?.provider || 'email' })
    const [assetResult, verificationResult, orderResult] = await Promise.all([
      supabase.from('assets').select('id, category, provider, region, prefix_code, asset_key, price_usd').order('created_at', { ascending: false }),
      isAdmin ? supabase.rpc('admin_verification_queue') : supabase.from('verification_requests').select('id, asset_id, email, otp, status, requested_at, user_id').order('requested_at', { ascending: false }),
      isAdmin ? supabase.rpc('admin_payment_queue') : supabase.from('payment_orders').select('id, asset_id, email, transaction_id, status, created_at, user_id').order('created_at', { ascending: false }),
    ])
    if (assetResult.data?.length) setAssets(assetResult.data.map((a: any) => ({ id: a.id, category: a.category, provider: a.provider, region: a.region, prefix: a.prefix_code, key: a.asset_key, price: Number(a.price_usd) })))
    if (verificationResult.data) setVerifications(verificationResult.data.map((v: any) => ({ id: v.id, assetId: v.asset_id, email: v.email, code: v.otp, status: v.status, timestamp: v.requested_at, userId: v.user_id })))
    if (orderResult.data) setOrders(orderResult.data.map((o: any) => ({ id: o.id, assetId: o.asset_id, email: o.email, transaction: o.transaction_id, status: o.status, created: o.created_at, userId: o.user_id })))
    setHydrated(true)
  }

  useEffect(() => {
    if (demoMode) {
      try {
        const saved = JSON.parse(localStorage.getItem('td-hub-demo-state') || '{}')
        if (saved.user) setUser(saved.user)
        if (saved.assets?.length) setAssets(saved.assets)
        if (saved.verifications) setVerifications(saved.verifications)
        if (saved.orders) setOrders(saved.orders)
      } catch { /* use seeded preview state */ }
      setHydrated(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => refresh(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session) => { void refresh(session) })
    const channel = supabase.channel('td-hub-live').on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests' }, () => supabase.auth.getSession().then(({ data }) => refresh(data.session))).on('postgres_changes', { event: '*', schema: 'public', table: 'payment_orders' }, () => supabase.auth.getSession().then(({ data }) => refresh(data.session))).subscribe()
    return () => { data.subscription.unsubscribe(); void supabase.removeChannel(channel) }
  }, [supabase])

  useEffect(() => {
    if (!demoMode || !hydrated) return
    localStorage.setItem('td-hub-demo-state', JSON.stringify({ user, assets, verifications, orders }))
  }, [user, assets, verifications, orders, hydrated])

  useEffect(() => {
    if (!demoMode) return
    const sync = (event: StorageEvent) => {
      if (event.key !== 'td-hub-demo-state' || !event.newValue) return
      try {
        const next = JSON.parse(event.newValue)
        if (next.user !== undefined) setUser(next.user)
        if (next.assets) setAssets(next.assets)
        if (next.verifications) setVerifications(next.verifications)
        if (next.orders) setOrders(next.orders)
      } catch { /* ignore malformed external state */ }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  return { user, setUser, assets, setAssets, verifications, setVerifications, orders, setOrders, approvedVerification, setApprovedVerification, supabase, hydrated }
}

export default function Page() {
  const { user, setUser, assets, setAssets, verifications, setVerifications, orders, setOrders, approvedVerification, setApprovedVerification, supabase } = useSharedState()
  const [view, setView] = useState<'dashboard' | 'orders' | 'support'>('dashboard')
  const [admin, setAdmin] = useState(false)
  const [modal, setModal] = useState<'verify' | 'payment' | 'asset' | 'auth' | null>(null)
  const [authStep, setAuthStep] = useState<'method' | 'name'>('method')
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [selected, setSelected] = useState<Asset | null>(null)
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [transaction, setTransaction] = useState('')
  const [inr, setInr] = useState(false)
  const [notice, setNotice] = useState('')
  const [secureAsset, setSecureAsset] = useState<Asset | null>(null)
  const [seconds, setSeconds] = useState(300)
  const [verifySeconds, setVerifySeconds] = useState(120)
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [newAsset, setNewAsset] = useState({ category: 'standard', provider: 'Type A', region: '', prefix: '', key: '', price: '25' })
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [nameInput, setNameInput] = useState('')

  useEffect(() => {
    if (!user) { setAuthStep('method'); setModal('auth') }
    else if (!user.name) { setAuthStep('name'); setModal('auth') }
  }, [user])

  useEffect(() => {
    if (modal === 'payment') { setSeconds(300); const timer = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000); return () => clearInterval(timer) }
  }, [modal])

  useEffect(() => {
    if (step === 3 && verifySeconds > 0) { const timer = setInterval(() => setVerifySeconds(s => Math.max(0, s - 1)), 1000); return () => clearInterval(timer) }
  }, [step, verifySeconds])

  useEffect(() => {
    if (approvedVerification) {
      const approved = verifications.find(v => v.id === approvedVerification)
      if (approved && approved.status === 'approved') {
        setSecureAsset(assets.find(a => a.id === approved.assetId) || null)
        setNotice('Successfully Unlocked')
        setApprovedVerification(null)
      }
    }
  }, [approvedVerification, verifications, assets, setApprovedVerification])

  const standard = useMemo(() => assets.filter(a => a.category === 'standard'), [assets])
  const priority = useMemo(() => assets.filter(a => a.category === 'priority'), [assets])
  const pendingCount = verifications.filter(v => v.status === 'pending').length + orders.filter(o => o.status === 'pending').length
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  async function finishAuth(provider: string) {
    if (demoMode && provider !== 'email') {
      setUser({ ...demoUser, id: `demo-${provider.toLowerCase()}`, email: `${provider.toLowerCase()}@tdhub.local`, provider })
      setAuthStep('name'); setNameInput(provider === 'email' ? '' : provider)
      return
    }
    if (demoMode && provider === 'email') {
      if (!authEmail.includes('@') || authPassword.length < 6) { setNotice('Enter a valid email and a password with at least 6 characters.'); return }
      setUser({ ...demoUser, id: `demo-${authEmail.toLowerCase()}`, email: authEmail.trim(), provider: 'email' })
      setAuthStep('name'); setNameInput(authEmail.split('@')[0] || '')
      return
    }
    if (provider !== 'email') {
      const oauthProvider = provider === 'X' ? 'twitter' : provider.toLowerCase() as 'google' | 'facebook'
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: oauthProvider,
          options: {
            redirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/auth/callback`,
            skipBrowserRedirect: true,
          },
        })
        if (error || !data.url) {
          setNotice('Social login is under configuration, please use Email/Password for now.')
          return
        }
        // OAuth providers block being embedded inside the preview iframe. Open the hosted consent screen at top level.
        const authWindow = window.open(data.url, '_blank', 'noopener,noreferrer')
        if (!authWindow) setNotice('Your browser blocked the sign-in window. Allow pop-ups for TD HUB and try again.')
        else setNotice(`Continue with ${provider} in the new sign-in window.`)
      } catch {
        setNotice('Social login is under configuration, please use Email/Password for now.')
      }
      return
    }
    if (!authEmail.includes('@') || authPassword.length < 6) return
    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword, options: { emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/auth/callback` } })
      if (error) { setNotice(error.message.includes('confirm') ? 'Check your email to confirm your account.' : 'Unable to create that account.'); return }
      if (!data.session) { setNotice('Check your email to confirm your new TD HUB account.'); return }
      setAuthStep('name'); setNameInput(authEmail.split('@')[0] || '')
      return
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
    if (error && error.message.toLowerCase().includes('invalid login')) { setNotice('Invalid email or password'); return }
    if (error || !data.user) { setNotice('Unable to sign in right now.'); return }
    setAuthStep('name'); setNameInput(data.user.user_metadata?.display_name || authEmail.split('@')[0] || '')
  }
  async function saveUser() {
    const nextName = nameInput.trim() || 'Alex'
    if (demoMode) {
      setUser(prev => ({ ...(prev || demoUser), name: nextName, email: prev?.email || authEmail || 'demo@tdhub.local' }))
      setModal(null); setNotice(`Welcome to TD HUB, ${nextName}`); return
    }
    if (!user) { const session = (await supabase.auth.getSession()).data.session; if (!session?.user) return; setUser({ id: session.user.id, email: session.user.email || authEmail, name: nextName, provider: session.user.app_metadata?.provider || 'email' }) }
    const current = user || (await supabase.auth.getUser()).data.user
    if (!current) return
    await supabase.from('profiles').upsert({ id: current.id, email: current.email || authEmail, display_name: nextName, auth_provider: current.app_metadata?.provider || 'email' })
    setUser(prev => prev ? { ...prev, name: nextName } : { id: current.id, email: current.email || authEmail, name: nextName, provider: current.app_metadata?.provider || 'email' })
    setModal(null); setNotice(`Welcome to TD HUB, ${nextName}`)
  }
  async function logout() { if (!demoMode) await supabase.auth.signOut(); localStorage.removeItem('td-hub-demo-state'); setUser(null); setAdmin(false); setSecureAsset(null) }
  function openVerify(asset: Asset) { setSelected(asset); setStep(1); setVerifySeconds(120); setVerificationId(null); setEmail(user?.email || ''); setCode(''); setModal('verify') }
  async function sendCode() {
    if (!email.includes('@') || !selected || !user) { setNotice('Enter a valid bind email address.'); return }
    if (demoMode) {
      const id = `demo-verification-${Date.now()}`
      setVerificationId(id)
      setVerifications(prev => [{ id, assetId: selected.id, email: email.trim(), code: '', status: 'pending', timestamp: new Date().toISOString(), userId: user.id }, ...prev])
      setStep(2)
      return
    }
    const { data, error } = await supabase.from('verification_requests').insert({ user_id: user.id, asset_id: selected.id, email: email.trim(), otp: null, status: 'pending' }).select('id').single()
    if (error || !data) { setNotice('Unable to start verification. Please try again.'); return }
    setVerificationId(data.id); setStep(2)
  }
  async function submitVerification() {
    if (code.length !== 6 || !verificationId || !user) { setNotice('Enter the 6-digit verification code.'); return }
    if (demoMode) {
      setVerifications(prev => prev.map(item => item.id === verificationId ? { ...item, code, status: 'pending' } : item))
      setStep(3)
      return
    }
    const { error } = await supabase.from('verification_requests').update({ otp: code }).eq('id', verificationId).eq('user_id', user.id)
    if (error) { setNotice('Unable to submit the verification code. Please try again.'); return }
    setStep(3)
  }
  function openPayment(asset: Asset) { setSelected(asset); setTransaction(''); setModal('payment') }
  async function submitPayment() {
    if (!transaction || !selected || !user) { setNotice('Enter a transaction ID to continue.'); return }
    const order: Order = { id: `demo-order-${Date.now()}`, assetId: selected.id, email: user.email, transaction, status: 'pending', created: new Date().toISOString(), userId: user.id }
    if (demoMode) setOrders(prev => [order, ...prev])
    else { const { error } = await supabase.from('payment_orders').insert({ user_id: user.id, asset_id: selected.id, email: user.email, price_usd: selected.price, price_inr: selected.price * 83, transaction_id: transaction }); if (error) { setNotice('Unable to submit payment. Please try again.'); return } }
    setModal(null); setNotice('Your order is confirmed, check it out in order section!'); setView('orders')
  }
  async function approveVerification(item: Verification) {
    if (demoMode) {
      setVerifications(prev => prev.map(request => request.id === item.id ? { ...request, status: 'approved' } : request))
      setApprovedVerification(item.id)
      return
    }
    const { error } = await supabase.rpc('admin_approve_verification', { request_id: item.id })
    if (error) { setNotice('Admin approval failed.'); return }
    setApprovedVerification(item.id)
  }
  async function approveOrder(item: Order) {
    if (demoMode) { setOrders(prev => prev.map(order => order.id === item.id ? { ...order, status: 'approved' } : order)); setNotice('Order approved successfully'); return }
    const { error } = await supabase.rpc('admin_approve_payment', { order_id: item.id })
    setNotice(error ? 'Order approval failed.' : 'Order approved successfully')
  }
  async function addAsset() {
    if (!newAsset.region || !newAsset.prefix || !newAsset.key || !user) { setNotice('Complete all asset fields first.'); return }
    const asset: Asset = { id: `demo-asset-${Date.now()}`, category: newAsset.category as Asset['category'], provider: newAsset.provider, region: newAsset.region, prefix: newAsset.prefix, key: newAsset.key, price: Number(newAsset.price) || 0 }
    if (demoMode) setAssets(prev => [asset, ...prev])
    else { const { error } = await supabase.from('assets').insert({ category: newAsset.category, provider: newAsset.provider, region: newAsset.region, prefix_code: newAsset.prefix, asset_key: newAsset.key, price_usd: Number(newAsset.price) || 0, created_by: user.id }); if (error) { setNotice('Unable to add asset.'); return } }
    setNewAsset({ category: 'standard', provider: 'Type A', region: '', prefix: '', key: '', price: '25' }); setNotice('New asset added to the marketplace')
  }

  return <main className="td-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar glass-panel">
      <div className="brand"><div className="brand-mark"><Zap /></div><div><div className="brand-name">TD HUB</div><div className="brand-sub">ASSET EXCHANGE</div></div><span className="live-badge"><i /> LIVE</span></div>
      <div className="top-actions"><div className="welcome"><span className="muted">Welcome back,</span><strong>Hello {user?.name || 'Guest'}</strong></div><nav>{(['dashboard', 'orders', 'support'] as const).map(item => <button key={item} className={view === item ? 'nav-active' : ''} onClick={() => { setView(item); setSecureAsset(null) }}>{item === 'dashboard' ? 'Dashboard' : item === 'orders' ? 'My Orders' : 'Customer Support'}</button>)}</nav><button className="role-switch" onClick={() => setAdmin(!admin)}><span className={!admin ? 'selected' : ''}>User View</span><span className={admin ? 'selected admin-selected' : ''}>Admin Panel</span></button><button className="icon-button mobile-menu" aria-label="Menu"><Menu /></button><button className="icon-button" onClick={logout} aria-label="Log out"><LogOut /></button></div>
    </header>

    {!admin && !secureAsset && view === 'dashboard' && <section className="page-content">
      <div className="hero-row"><div><div className="eyebrow"><Sparkles /> LIVE MARKETPLACE</div><h1>Unlock your <span>edge.</span></h1><p>Access verified digital assets built for speed, security, and seamless integration.</p></div><div className="hero-stats"><div><strong>{assets.length}</strong><span>Live Assets</span></div><div><strong>24/7</strong><span>Availability</span></div><div><strong>99.9%</strong><span>Uptime</span></div></div></div>
      <section className="asset-section"><div className="section-heading"><div><div className="section-kicker"><LockKeyhole /> VERIFICATION FLOW</div><h2>Standard Assets</h2><p>Free verification. Unlock instantly after email confirmation.</p></div><span className="count-pill">{standard.length} available</span></div><div className="asset-grid">{standard.map(asset => <AssetCard key={asset.id} asset={asset} onAction={() => openVerify(asset)} action="Unlock Asset" />)}</div></section>
      <section className="asset-section priority-section"><div className="section-heading"><div><div className="section-kicker priority-kicker"><QrCode /> PAID QR GATEWAY</div><h2>Priority Assets</h2><p>Premium access with instant QR payment verification.</p></div><span className="count-pill priority-pill">{priority.length} available</span></div><div className="asset-grid">{priority.map(asset => <AssetCard key={asset.id} asset={asset} onAction={() => openPayment(asset)} action="Buy Now" />)}</div></section>
    </section>}

    {!admin && view === 'orders' && <OrdersView orders={orders} assets={assets} />}
    {!admin && view === 'support' && <SupportView name={user?.name || ''} setName={(next) => user && setUser({ ...user, name: next })} />}
    {secureAsset && <SecureView asset={secureAsset} onBack={() => setSecureAsset(null)} />}
    {admin && <AdminView assets={assets} verifications={verifications} orders={orders} newAsset={newAsset} setNewAsset={setNewAsset} onAdd={addAsset} onApproveVerification={approveVerification} onApproveOrder={approveOrder} />}

    {modal === 'auth' && <Modal title="Welcome to TD HUB" icon={<ShieldCheck />} onClose={() => {}}>{authStep === 'method' ? <><p className="modal-copy">Sign in securely inside the app to access live assets and verification.</p><div className="auth-buttons"><button className="secondary-button full" onClick={() => finishAuth('Google')}><Globe2 /> Continue with Google</button><button className="secondary-button full" onClick={() => finishAuth('Facebook')}><MessageCircle /> Continue with Facebook</button><button className="secondary-button full" onClick={() => finishAuth('X')}><AtSign /> Continue with X / Twitter</button></div><div className="auth-divider"><span>or continue with email</span></div><label>Email address<input type="email" placeholder="you@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} /></label><label>Password<input type="password" placeholder="Enter password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} /></label><button className="primary-button full" onClick={() => void finishAuth('email')}>{authMode === 'login' ? 'Sign in with email' : 'Create account'} <ArrowRight /></button><button className="text-button" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>{authMode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}</button></> : <><p className="modal-copy">One last step: what should we call you?</p><label>Your name<input autoFocus placeholder="Enter your name" value={nameInput} onChange={e => setNameInput(e.target.value)} /></label><button className="primary-button full" onClick={saveUser}>Enter TD HUB <ArrowRight /></button></>}</Modal>}
    {modal === 'verify' && <Modal title="Unlock Standard Asset" icon={<ShieldCheck />} onClose={() => setModal(null)}><div className="stepper"><span className={step >= 1 ? 'done' : ''}>1</span><i /><span className={step >= 2 ? 'done' : ''}>2</span><i /><span className={step >= 3 ? 'done' : ''}>3</span></div>{step === 1 && <><p className="modal-copy">Bind an email address to start the free verification flow.</p><label>Email address<input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /></label><button className="primary-button full" onClick={sendCode}>Send verification code <ArrowRight /></button></>}{step === 2 && <><p className="modal-copy">We sent a 6-digit code to <strong>{email}</strong>.</p><label>6-Digit Verification Code<input inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label><button className="primary-button full" onClick={submitVerification}>Submit code <Check /></button></>}{step === 3 && <div className="waiting"><RefreshCw className="spin" /><h3>Verification submitted</h3><p>Wait 2 minutes to confirm verification. The admin queue is syncing in real-time.</p><strong className="verification-timer">{String(Math.floor(verifySeconds / 60)).padStart(2, '0')}:{String(verifySeconds % 60).padStart(2, '0')}</strong><div className="progress-track"><span /></div><small>Usually confirmed within 2 minutes</small></div>}</Modal>}
    {modal === 'payment' && selected && <Modal title="Priority Checkout" icon={<CreditCard />} onClose={() => setModal(null)}><div className="checkout-meta"><div><span>{selected.provider} · {selected.region}</span><strong>{inr ? `₹${(selected.price * 83).toLocaleString('en-IN')}` : money(selected.price)}</strong></div><button className="convert-button" onClick={() => setInr(!inr)}><RefreshCw /> {inr ? 'Show USD' : 'Convert to INR'}</button></div><div className="qr-wrap"><img src="/payment-qr.png" alt="Payment QR code" /><div><span>SCAN TO PAY</span><strong>{money(selected.price)} / ₹{(selected.price * 83).toLocaleString('en-IN')}</strong></div></div><div className="timer"><Clock3 /> Payment window <strong>{time}</strong></div><label>Transaction ID / UTR Number<input placeholder="Enter transaction reference" value={transaction} onChange={e => setTransaction(e.target.value)} /></label><button className="primary-button full" onClick={submitPayment}>Submit transaction <ArrowRight /></button></Modal>}
    {modal === 'asset' && <Modal title="Add New Asset" icon={<Plus />} onClose={() => setModal(null)}><AssetForm newAsset={newAsset} setNewAsset={setNewAsset} onAdd={() => { addAsset(); setModal(null) }} /></Modal>}
    {notice && <div className="toast"><BadgeCheck /> {notice}</div>}
    <footer><span>TD HUB © 2024</span><span><Database /> Secure infrastructure · <span className="live-text">All systems operational</span></span></footer>
  </main>
}

function AssetCard({ asset, onAction, action }: { asset: Asset; onAction: () => void; action: string }) { const [showInr, setShowInr] = useState(false); return <article className="asset-card glass-panel"><div className="card-top"><span className="live-badge"><i /> LIVE</span><span className="provider">{asset.provider}</span></div><div className="asset-icon"><FileKey2 /></div><h3>{asset.region}</h3><p className="asset-type">{asset.category === 'standard' ? 'Standard verification asset' : 'Priority gateway asset'}</p><div className="key-preview"><span>ASSET KEY</span><code>{asset.prefix}<b>{'•'.repeat(10)}</b></code><span className="key-lock"><LockKeyhole /></span></div><div className="card-bottom">{asset.category === 'priority' ? <div><strong>{showInr ? `₹${(asset.price * 83).toLocaleString('en-IN')}` : money(asset.price)}</strong><button className="currency-toggle" onClick={() => setShowInr(!showInr)}>{showInr ? 'USD' : '₹ INR'}</button></div> : <div><strong>FREE</strong><span className="subprice">Email verification</span></div>}<button className={`primary-button ${asset.category === 'priority' ? 'priority-button' : ''}`} onClick={onAction}>{action} <ArrowRight /></button></div></article> }

function OrdersView({ orders, assets }: { orders: Order[]; assets: Asset[] }) { return <section className="page-content inner-page"><div className="page-title"><div className="section-kicker"><PackageCheck /> ORDER CENTER</div><h1>My Orders</h1><p>Track your priority asset purchases and approval status.</p></div>{orders.length === 0 ? <EmptyState icon={<PackageCheck />} title="No orders yet" text="Your purchased priority assets will appear here." /> : <div className="orders-list">{orders.map(order => { const asset = assets.find(a => a.id === order.assetId); if (!asset) return null; return <div className="order-row glass-panel" key={order.id}><div className="order-icon"><FileKey2 /></div><div className="order-main"><div><strong>{asset.region}</strong><span>{asset.provider} · {order.created}</span></div><code>{order.status === 'approved' ? asset.key : masked(asset.key)}</code></div><span className={`status ${order.status}`}>{order.status === 'approved' ? 'Approved' : 'Pending Admin Approval'}</span></div>})}</div>}</section> }

function SupportView({ name, setName }: { name: string; setName: (x: string) => void }) { return <section className="page-content inner-page support-page"><div className="page-title"><div className="section-kicker"><CircleHelp /> SUPPORT DESK</div><h1>We&apos;ve got you covered.</h1><p>Our specialists are online and ready to help with your access.</p></div><div className="support-grid"><div className="support-card glass-panel"><div className="support-icon"><Users /></div><h2>Talk to a specialist</h2><p>Get help with verification, payment approvals, or asset access.</p><a href="mailto:support@tdhub.example">support@tdhub.example <ArrowRight /></a></div><div className="support-card glass-panel"><div className="support-icon"><UserRound /></div><h2>Personalize your hub</h2><p>Set the name used in your welcome banner and order updates.</p><label>Your name<input value={name} onChange={e => setName(e.target.value || 'Alex')} /></label></div></div></section> }

function SecureView({ asset, onBack }: { asset: Asset; onBack: () => void }) { return <section className="secure-view page-content"><div className="secure-badge"><ShieldCheck /></div><div className="section-kicker">VERIFIED ACCESS GRANTED</div><h1>Secure Yourself<br /><span>and Talk to Admin.</span></h1><p>Your asset has been successfully unlocked. Keep these details private and contact our team if you need help.</p><div className="secure-card glass-panel"><div><span>FULL ASSET KEY</span><code>{asset.key}</code></div><button className="icon-button" onClick={() => navigator.clipboard?.writeText(asset.key)} aria-label="Copy asset key"><Copy /></button></div><button className="secondary-button" onClick={onBack}>Return to marketplace</button></section> }

function AdminView({ assets, verifications, orders, newAsset, setNewAsset, onAdd, onApproveVerification, onApproveOrder }: any) { return <section className="page-content admin-page"><div className="admin-heading"><div><div className="section-kicker priority-kicker"><LayoutDashboard /> CONTROL CENTER</div><h1>Admin Panel</h1><p>Manage live assets, verifications, and payment approvals.</p></div><button className="primary-button" onClick={() => document.getElementById('asset-form')?.scrollIntoView({ behavior: 'smooth' })}><Plus /> Add new asset</button></div><div className="admin-stats"><div className="glass-panel"><Database /><strong>{assets.length}</strong><span>Total assets</span></div><div className="glass-panel"><Mail /><strong>{verifications.filter((v: Verification) => v.status === 'pending').length}</strong><span>Verification queue</span></div><div className="glass-panel"><CreditCard /><strong>{orders.filter((o: Order) => o.status === 'pending').length}</strong><span>Payment queue</span></div></div><div className="admin-grid"><div className="admin-column"><Queue title="Verification Queue" icon={<Mail />} empty="No verification requests" items={verifications.filter((v: Verification) => v.status === 'pending')} render={(item: Verification) => <><div className="queue-info"><strong>{item.email}</strong><span>Code: {item.code}</span><span>{assets.find((a: Asset) => a.id === item.assetId)?.region || 'Asset'} · {new Date(item.timestamp).toLocaleTimeString()}</span></div><button className="approve-button" onClick={() => onApproveVerification(item)}><Check /> Approve & Unlock</button></>} /><Queue title="Payment Orders Queue" icon={<CreditCard />} empty="No payment orders" items={orders.filter((o: Order) => o.status === 'pending')} render={(item: Order) => <><div className="queue-info"><strong>{item.email}</strong><span>UTR: {item.transaction}</span></div><button className="approve-button" onClick={() => onApproveOrder(item)}><Check /> Approve order</button></>} /></div><div className="asset-form-panel glass-panel" id="asset-form"><div className="section-kicker"><Plus /> ASSET INVENTORY</div><h2>Add New Asset</h2><AssetForm newAsset={newAsset} setNewAsset={setNewAsset} onAdd={onAdd} /></div></div></section> }

function Queue({ title, icon, empty, items, render }: any) { return <div className="queue glass-panel"><div className="queue-title"><div>{icon}<h2>{title}</h2></div><span>{items.length} pending</span></div>{items.length === 0 ? <div className="queue-empty"><Check /> {empty}</div> : <div className="queue-items">{items.map((item: any) => <div className="queue-item" key={item.id}>{render(item)}</div>)}</div>}</div> }

function AssetForm({ newAsset, setNewAsset, onAdd }: any) { const change = (key: string, value: string) => setNewAsset({ ...newAsset, [key]: value }); return <div className="form-grid"><label>Category<select value={newAsset.category} onChange={e => change('category', e.target.value)}><option value="standard">Standard Asset</option><option value="priority">Priority Asset</option></select></label><label>Network provider<select value={newAsset.provider} onChange={e => change('provider', e.target.value)}>{['Type A', 'Type B', 'Type C', 'Type D'].map(x => <option key={x}>{x}</option>)}</select></label><label>Origin / Region name<input placeholder="e.g. United States" value={newAsset.region} onChange={e => change('region', e.target.value)} /></label><label>Prefix code<input maxLength={6} placeholder="41ABCD" value={newAsset.prefix} onChange={e => change('prefix', e.target.value.toUpperCase())} /></label><label>Full asset key<input maxLength={16} placeholder="16 characters" value={newAsset.key} onChange={e => change('key', e.target.value.toUpperCase())} /></label><label>Price in USD ($)<input type="number" value={newAsset.price} onChange={e => change('price', e.target.value)} /></label><button className="primary-button full" onClick={onAdd}><Plus /> Publish asset</button></div> }
function Modal({ title, icon, onClose, children }: any) { return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal glass-panel"><div className="modal-header"><div className="modal-title"><span>{icon}</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div>{children}</div></div> }
function EmptyState({ icon, title, text }: any) { return <div className="empty-state glass-panel">{icon}<h2>{title}</h2><p>{text}</p></div> }
