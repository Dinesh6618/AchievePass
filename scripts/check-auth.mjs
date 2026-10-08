#!/usr/bin/env node
/**
 * Checks that student sign-up / sign-in (username + password, no e-mail verification) can work on YOUR
 * Supabase project, using only the public URL + anon/publishable key from .env.local.
 *
 *   npm run check-auth
 *
 * The one project setting CertiPass depends on: Authentication → Providers → Email → "Confirm email" must be OFF.
 * Students have no real e-mail address, so a confirmation message could never be delivered.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnvFile('.env.local')
loadEnvFile('.env')

const url = (process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const key = process.env.VITE_SUPABASE_ANON_KEY || ''
if (!url || !key) {
  console.error('\n✗ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — create .env.local first.\n')
  process.exit(1)
}

let problems = 0
const ok = (m) => console.log(`  ✓ ${m}`)
const bad = (m, hint) => {
  problems++
  console.log(`  ✗ ${m}`)
  if (hint) console.log(`      ${hint}`)
}

console.log(`\nCertiPass sign-in check — ${url}\n`)

try {
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const s = await res.json()
  s.external?.email === false
    ? bad('E-mail/password sign-in is turned OFF.', 'Authentication → Providers → Email → enable it (students sign in with a username, which uses this provider).')
    : ok('Password sign-in is enabled')
  s.mailer_autoconfirm === true
    ? ok('"Confirm email" is OFF — new students are signed in immediately, with no e-mail step')
    : bad('"Confirm email" is still ON — registration will fail.', 'Supabase dashboard → Authentication → Providers → Email → turn OFF "Confirm email" → Save.')
  s.disable_signup ? bad('Sign-ups are disabled for this project.', 'Authentication → Sign In / Providers → allow new users to sign up.') : ok('Sign-ups are allowed')
} catch (err) {
  bad(`Could not read the project's auth settings (${err.message}). Check the URL and key.`)
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const check = await supabase.rpc('username_available', { p_username: 'a-name-nobody-has-0123' })
check.error
  ? bad(`The database does not support usernames yet (${check.error.message})`, 'Run supabase/migrations/20260101000006_username_auth.sql in the SQL Editor.')
  : ok('Database supports username sign-in')

console.log(problems ? `\n✗ ${problems} problem(s) found.\n` : '\n✓ Ready: students can create an account with a username and password.\n')
process.exit(problems ? 1 : 0)
