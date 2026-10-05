import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// read rather than import: JSON import assertions differ across Node versions
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Build stamp. The version number lives in package.json (bumped per release);
// the commit is read from Vercel's env when deploying, or local git otherwise,
// so the Account tab can never drift out of date with what's actually running.
const commit = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' }
})()

// `npm run dev` has no Vercel functions, so serve /api/google-token from the
// same module, with the server-only env from .env.local.
function devApi(env) {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/google-token', async (req, res) => {
        let raw = ''
        for await (const chunk of req) raw += chunk
        const { exchange } = await server.ssrLoadModule('/api/google-token.js')
        const { status, data } = await exchange(JSON.parse(raw || '{}'), env)
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(data))
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(loadEnv(mode, process.cwd(), ''))],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
}))
