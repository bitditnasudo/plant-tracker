// Google OAuth token exchange — the one server-side step the app needs.
//
// The browser can't hold the OAuth client secret, and Google only hands out a
// refresh token (which is what lets sync renew itself instead of expiring every
// hour) to a client that proves it has that secret. So the browser sends either
// the one-time `code` from the sign-in redirect, or its stored refresh token,
// and this function adds the secret and asks Google. Nothing is stored here.
//
// Env (Vercel project settings, and .env.local for `npm run dev`):
//   GOOGLE_CLIENT_SECRET   the OAuth client's secret (never VITE_-prefixed)
//   VITE_GOOGLE_CLIENT_ID  the client id the browser already uses

const ALLOWED_ORIGINS = [
  'https://plant-tracker-pied.vercel.app',
  'http://localhost:5173',
]

export async function exchange(body, env = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID
  const secret = env.GOOGLE_CLIENT_SECRET
  if (!clientId || !secret) {
    return { status: 500, data: { error: 'not_configured', error_description: 'GOOGLE_CLIENT_SECRET is not set on the server' } }
  }

  const params = new URLSearchParams({ client_id: clientId, client_secret: secret })
  if (body?.code) {
    // only ever for this app's own callback page
    let origin = ''
    try { origin = new URL(body.redirect_uri).origin } catch { /* invalid */ }
    if (!ALLOWED_ORIGINS.includes(origin) || !String(body.redirect_uri).endsWith('/auth/callback')) {
      return { status: 400, data: { error: 'bad_redirect' } }
    }
    params.set('grant_type', 'authorization_code')
    params.set('code', body.code)
    params.set('redirect_uri', body.redirect_uri)
  } else if (body?.refresh_token) {
    params.set('grant_type', 'refresh_token')
    params.set('refresh_token', body.refresh_token)
  } else {
    return { status: 400, data: { error: 'missing_grant' } }
  }

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  const d = await r.json().catch(() => ({}))
  // pass back only what the app uses
  const { access_token, expires_in, refresh_token, scope, error, error_description } = d
  return { status: r.status, data: { access_token, expires_in, refresh_token, scope, error, error_description } }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
  const { status, data } = await exchange(body)
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(data)
}
