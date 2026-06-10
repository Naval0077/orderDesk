import { useState } from 'react'
import styles from './LoginPage.module.css'

export function LoginPage({ onLogin, onRegister, onGoogle, error, loading }) {
  const [mode,  setMode]  = useState('login')
  const [email, setEmail] = useState('')
  const [pass,  setPass]  = useState('')

  function submit() {
    if (mode === 'login') onLogin(email, pass)
    else                  onRegister(email, pass)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.logo}>ORDER<em>DESK</em></div>
      <div className={styles.tag}>Order Management</div>

      <div className={styles.card}>
        <button className={styles.google} onClick={onGoogle} disabled={loading}>
          <GoogleIcon />
          Continue with Google
        </button>

        <div className={styles.or}><span>or</span></div>

        <label className={styles.lbl}>Email</label>
        <input
          className={styles.input}
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && document.getElementById('passInput').focus()}
        />

        <label className={styles.lbl}>Password</label>
        <input
          id="passInput"
          className={styles.input}
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={pass}
          onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ marginBottom: 4 }}
        />

        <button className={styles.btn} onClick={submit} disabled={loading}>
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        {error && <div className={styles.err}>{error}</div>}

        <div className={styles.toggle}>
          <span>{mode === 'login' ? 'No account? ' : 'Have an account? '}</span>
          <a onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Register' : 'Sign In'}
          </a>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )
}
