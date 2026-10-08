#!/usr/bin/env node
/**
 * Verifies that supabase/setup.sql has been applied to YOUR Supabase project — using only the public
 * URL + publishable/anon key from .env.local (no secrets, no database password). It also proves the
 * security setup works from the outside: an anonymous visitor must not be able to read private data.
 *
 *   npm run check-db
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

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
let failures = 0
const pass = (m) => console.log(`  ✓ ${m}`)
const fail = (m, hint) => {
  failures++
  console.log(`  ✗ ${m}`)
  if (hint) console.log(`      ${hint}`)
}

console.log(`\nCertiPass database check — ${url}\n`)

// 1. the SQL has been applied at all ----------------------------------------------------------------------------------
const settings = await supabase.rpc('public_settings')
if (settings.error) {
  fail(`Database not installed yet (${settings.error.message})`, 'Paste supabase/setup.sql into Supabase → SQL Editor → New query → Run, then run this check again.')
  console.log('\nNothing else can be checked until the setup SQL has been run.\n')
  process.exit(1)
}
const keys = Object.keys(settings.data ?? {}).sort().join(', ')
keys === 'allow_student_registration, institution_name'
  ? pass('Functions and settings exist (public_settings)')
  : fail(`public_settings returned unexpected keys: ${keys}`, keys.includes('student_email_domain') ? 'This project still has the old e-mail setup — run supabase/migrations/20260101000006_username_auth.sql in the SQL Editor.' : undefined)

// username sign-in (migration 6)
const uname = await supabase.rpc('username_available', { p_username: 'a-name-nobody-has-0123' })
if (uname.error) fail(`Username sign-in is not installed yet (${uname.error.message})`, 'Run supabase/migrations/20260101000006_username_auth.sql in the SQL Editor (it upgrades an existing CertiPass database).')
else if (uname.data !== true) fail('username_available should return true for an unused username')
else pass('Username sign-in is installed (username_available)')
const reserved = await supabase.rpc('username_available', { p_username: 'admin' })
if (!reserved.error) reserved.data === false ? pass('Reserved usernames such as "admin" cannot be claimed') : fail('The username "admin" should be reserved')

// 2. reference data --------------------------------------------------------------------------------------------------
const depts = await supabase.from('departments').select('code')
depts.error
  ? fail(`Cannot read departments: ${depts.error.message}`)
  : depts.data.length === 8
    ? pass(`8 departments loaded (${depts.data.map((d) => d.code).sort().join(', ')})`)
    : fail(`Expected 8 departments, found ${depts.data.length}`, 'The reference-data migration may not have run — re-check the SQL Editor output for errors.')

// 3. public functions behave -----------------------------------------------------------------------------------------
const free = await supabase.rpc('register_number_available', { p_register_number: 'NOT-A-REAL-REGISTER-NUMBER' })
free.error || free.data !== true ? fail('register_number_available did not return true for an unused number', free.error?.message) : pass('Register-number check works')

const verify = await supabase.rpc('get_public_verification', { p_code: 'CP-0000-AAAAA' })
verify.error || verify.data !== null ? fail('get_public_verification should return null for an unknown ID', verify.error?.message) : pass('Public QR verification lookup works (unknown ID → not found)')

// 4. Row Level Security, proven from the outside ---------------------------------------------------------------------
console.log('\n  Anonymous visitor must NOT be able to read private data:')
const PRIVATE = [
  'profiles', 'achievements', 'certificates', 'od_requests', 'verification_records', 'notifications', 'audit_logs',
  'app_settings', 'event_categories', 'achievement_details', 'od_details', 'student_summaries',
]
for (const table of PRIVATE) {
  const { data, error } = await supabase.from(table).select('*').limit(1)
  if (error && (error.code === '42501' || /permission denied|not found|does not exist/i.test(error.message))) {
    // 42501 = denied, which is what we want. "does not exist" would mean the table is missing.
    if (/does not exist|not found/i.test(error.message) && error.code !== '42501') fail(`${table}: missing (${error.message})`)
    else pass(`${table}: denied`)
  } else if (error) {
    fail(`${table}: unexpected error ${error.code} ${error.message}`)
  } else if (data.length > 0) {
    fail(`${table}: ANONYMOUS READ RETURNED DATA — Row Level Security is not protecting it`)
  } else {
    pass(`${table}: no rows visible`)
  }
}

// 5. storage ---------------------------------------------------------------------------------------------------------
console.log('')
try {
  const res = await fetch(`${url}/storage/v1/object/public/avatars/__probe__.png`, { headers: { apikey: key } })
  const body = await res.text()
  const bucketMissing = /bucket not found/i.test(body)
  if (bucketMissing) fail('Storage bucket "avatars" is missing', 'It is created by setup.sql — re-check the SQL Editor output for errors.')
  else pass('Storage bucket "avatars" exists (public profile photos)')
} catch (err) {
  fail(`Could not reach Storage: ${err.message}`)
}
console.log('  – Storage bucket "certificates" is private, so it cannot be probed anonymously: confirm it under Dashboard → Storage.')

console.log(failures ? `\n✗ ${failures} problem(s) found.\n` : '\n✓ Database is set up and protected. Next step: e-mail (SMTP) — see README → Email verification.\n')
process.exit(failures ? 1 : 0)
