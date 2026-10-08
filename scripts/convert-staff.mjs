#!/usr/bin/env node
/**
 * One-off helper for projects that already had faculty / admin accounts BEFORE username sign-in existed.
 *
 *   npm run convert-staff            # do it
 *   npm run convert-staff -- --dry-run   # only list what would change
 *
 * Those accounts still log in to Supabase Auth with their real e-mail address. Migration 7 gave each of them a
 * username; this switches their Auth login to the internal address derived from that username, so they can sign in
 * on /login/faculty or /login/admin with Username + Password. Their password is unchanged and their real e-mail stays
 * on the profile as plain contact information (it is no longer used to sign in).
 *
 * Runs on YOUR machine with the service-role key (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local) — never
 * in the browser. Safe to run again: accounts that are already converted are skipped.
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

const INTERNAL_EMAIL_DOMAIN = 'certipass.invalid' // must match src/lib/identity.ts
const dryRun = process.argv.includes('--dry-run')

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.local (no VITE_ prefix on the key).')
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: staff, error } = await db
  .from('profiles')
  .select('id, role, username, full_name, email')
  .in('role', ['faculty', 'admin'])
  .order('role')
if (error) {
  console.error(`✗ reading profiles: ${error.message} — has migration 20260101000007_role_logins.sql been run?`)
  process.exit(1)
}

let changed = 0
let skipped = 0
for (const p of staff) {
  if (!p.username) {
    console.log(`✗ ${p.full_name}: no username yet — run migration 20260101000007_role_logins.sql first`)
    process.exit(1)
  }
  const { data, error: getError } = await db.auth.admin.getUserById(p.id)
  if (getError || !data?.user) {
    console.log(`✗ ${p.username}: could not read the auth account (${getError?.message ?? 'not found'})`)
    continue
  }
  const target = `${p.username.replace('@', '+')}@${INTERNAL_EMAIL_DOMAIN}`
  if (data.user.email?.toLowerCase() === target) {
    skipped++
    continue
  }
  console.log(`${dryRun ? '•' : '→'} ${p.role.padEnd(7)} ${p.full_name} — username "${p.username}"`)
  if (dryRun) {
    changed++
    continue
  }
  // keep the real address as contact information on the profile
  if (!p.email && data.user.email) await db.from('profiles').update({ email: data.user.email }).eq('id', p.id)
  const { error: updateError } = await db.auth.admin.updateUserById(p.id, { email: target, email_confirm: true })
  if (updateError) console.log(`  ✗ ${updateError.message}`)
  else changed++
}

console.log(
  dryRun
    ? `\n${changed} account(s) would be converted, ${skipped} already use a username login.`
    : `\n✓ ${changed} account(s) converted, ${skipped} already used a username login. They sign in with Username + Password.`,
)
