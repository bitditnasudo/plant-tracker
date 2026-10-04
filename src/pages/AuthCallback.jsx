import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { storeToken, consumeAuthState } from '../lib/googleDrive.js'
import { useStore } from '../lib/store.jsx'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { refreshSync } = useStore()
  const processed = useRef(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Guard against StrictMode's double effect invocation — the hash is a
    // one-time value, consumed on the first pass.
    if (processed.current) return
    processed.current = true

    const hash = new URLSearchParams(window.location.hash.replace('#', ''))
    const token = hash.get('access_token')
    const expiry = hash.get('expires_in')
    // drop the token from the address bar and history either way
    window.history.replaceState(null, '', window.location.pathname)

    if (token && consumeAuthState(hash.get('state'))) {
      storeToken(token, Number(expiry || 3600))
      refreshSync()
      navigate('/account', { replace: true })
    } else if (token) {
      // a token this tab never asked for: a crafted link, not our sign-in
      setError('This sign-in link didn’t come from this app, so it was ignored. Connect again from Account.')
    } else {
      const code = hash.get('error')
      setError(code === 'access_denied'
        ? 'Google sign-in was cancelled.'
        : `Google sign-in failed${code ? ` (${hash.get('error_description') || code})` : ''}.`)
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
