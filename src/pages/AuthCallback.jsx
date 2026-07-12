import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { storeToken } from '../lib/googleDrive.js'
import { useStore } from '../lib/store.jsx'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { refreshSync } = useStore()
  const processed = useRef(false)

  useEffect(() => {
    // Guard against StrictMode's double effect invocation — the hash is a
    // one-time value, consumed on the first pass.
    if (processed.current) return
    processed.current = true

    const hash = new URLSearchParams(window.location.hash.replace('#', ''))
    const token = hash.get('access_token')
    const expiry = hash.get('expires_in')

    if (token) {
      storeToken(token, Number(expiry || 3600))
      refreshSync()
      navigate('/account', { replace: true })
    } else {
      console.error('OAuth callback error:', hash.get('error'), hash.get('error_description'))
      navigate('/account', { replace: true })
    }
  }, [navigate, refreshSync])

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span className="muted">Connecting to Google…</span>
    </div>
  )
}
