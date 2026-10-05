import { describe, it, expect, vi, afterEach } from 'vitest'
import { exchange } from '../api/google-token.js'

const env = { VITE_GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec' }
afterEach(() => vi.restoreAllMocks())

describe('google-token exchange', () => {
  it('reports when the secret is missing (the app then falls back)', async () => {
    const r = await exchange({}, { VITE_GOOGLE_CLIENT_ID: 'cid' })
    expect(r.data.error).toBe('not_configured')
  })

  it('answers an empty request with missing_grant once configured', async () => {
    expect((await exchange({}, env)).data.error).toBe('missing_grant')
  })

  it('refuses a code for any page other than this app’s callback', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    for (const redirect_uri of ['https://evil.example/auth/callback', 'https://plant-tracker-pied.vercel.app/other', 'nonsense']) {
      expect((await exchange({ code: 'c', redirect_uri }, env)).data.error).toBe('bad_redirect')
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('adds the secret, and passes back only the token fields', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      access_token: 'at', expires_in: 3599, refresh_token: 'rt', id_token: 'should-not-leak',
    }), { status: 200 }))
    const r = await exchange({ code: 'c', redirect_uri: 'http://localhost:5173/auth/callback' }, env)
    const sent = new URLSearchParams(spy.mock.calls[0][1].body)
    expect(sent.get('client_secret')).toBe('sec')
    expect(sent.get('grant_type')).toBe('authorization_code')
    expect(r.data).toMatchObject({ access_token: 'at', refresh_token: 'rt' })
    expect(r.data.id_token).toBeUndefined()
  })
})
