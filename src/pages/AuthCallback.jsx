import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { completeSignIn, consumeAuthState, storeToken } from '../lib/googleDrive.js'
import { useStore } from '../lib/store.jsx'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { refreshSync } = useStore()
  const processed = useRef(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Guard against StrictMode's double effect invocation — the code is a
    // one-time value, consumed on the first pass.
    if (processed.current) return
    processed.current = true

    const q = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace('#', ''))
    const code = q.get('code')
    const token = hash.get('access_token') // fallback flow: no refresh token
    // drop the code/token from the address bar and history either way
    window.history.replaceState(null, '', window.location.pathname)

    if (token && consumeAuthState(hash.get('state'))) {
      storeToken(token, Number(hash.get('expires_in') || 3600))
      refreshSync()
      navigate('/account', { replace: true })
    } else if (token) {
      setError('This sign-in link didn’t come from this app, so it was ignored. Connect again from Account.')
    } else if (code && consumeAuthState(q.get('state'))) {
      completeSignIn(code)
        .then(() => { refreshSync(); navigate('/account', { replace: true }) })
        .catch(e => setError(e.message))
    } else if (code) {
      // a code this device never asked for: a crafted link, not our sign-in
      setError('This sign-in link didn’t come from this app, so it was ignored. Connect again from Account.')
    } else {
      const err = q.get('error') || hash.get('error')
      setError(err === 'access_denied'
        ? 'Google sign-in was cancelled.'
        : `Google sign-in failed${err ? ` (${q.get('error_description') || err})` : ''}.`)
    }
  }, [navigate, refreshSync])

  return (
    <div className="auth-page">
      {error ? (
        <div className="card center">
          <p>{error}</p>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/account', { replace: true })}>Back to Account</button>
        </div>
      ) : (
        <span className="muted">Connecting to Google…</span>
      )}
    </div>
  )
}
