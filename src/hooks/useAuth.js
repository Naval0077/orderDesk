import { useState, useEffect } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { auth, googleProvider } from '../lib/firebase'

export function useAuth() {
  const [user,    setUser]    = useState(undefined) // undefined = loading
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u ?? null))
    return unsub
  }, [])

  function clearError() { setError('') }

  async function loginEmail(email, password) {
    setError(''); setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (e) {
      setError(friendlyError(e.code))
    } finally {
      setLoading(false)
    }
  }

  async function registerEmail(email, password) {
    setError(''); setLoading(true)
    try {
      await createUserWithEmailAndPassword(auth, email, password)
    } catch (e) {
      setError(friendlyError(e.code))
    } finally {
      setLoading(false)
    }
  }

  async function loginGoogle() {
    setError(''); setLoading(true)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      setError(friendlyError(e.code))
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await signOut(auth)
  }

  return { user, error, loading, clearError, loginEmail, registerEmail, loginGoogle, logout }
}

function friendlyError(code) {
  const map = {
    'auth/user-not-found':      'No account with this email.',
    'auth/wrong-password':      'Wrong password.',
    'auth/invalid-email':       'Invalid email address.',
    'auth/email-already-in-use':'Email already registered.',
    'auth/weak-password':       'Password too short (min 6 chars).',
    'auth/popup-closed-by-user':'Sign-in popup closed.',
    'auth/invalid-credential':  'Invalid email or password.',
  }
  return map[code] || 'Authentication error. Please try again.'
}
