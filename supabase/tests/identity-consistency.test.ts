/**
 * The username rules live in three places that must agree: the app (src/lib/identity.ts), the database sign-up
 * trigger, and the admin-create-user edge function. If one drifts, students could register but not sign in.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INTERNAL_EMAIL_DOMAIN, RESERVED_USERNAMES, USERNAME_PATTERN, usernameToAuthEmail } from '../../src/lib/identity'

const root = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8')

const sql = read('supabase', 'migrations', '20260101000006_username_auth.sql')
const edgeFunction = read('supabase', 'functions', 'admin-create-user', 'index.ts')

describe('username rules are identical everywhere', () => {
  it('uses the same internal login domain in the app, the database trigger and the edge function', () => {
    expect(sql).toContain(`v_internal_domain constant text := '${INTERNAL_EMAIL_DOMAIN}'`)
    expect(edgeFunction).toContain(`INTERNAL_EMAIL_DOMAIN = '${INTERNAL_EMAIL_DOMAIN}'`)
  })

  it('builds the login address the same way: "@" in a username becomes "+"', () => {
    expect(usernameToAuthEmail('Name@College.edu')).toBe('name+college.edu@certipass.invalid')
    expect(sql).toContain(`replace(v_username, '@', '+') || '@' || v_internal_domain`)
    expect(edgeFunction).toContain(`username.replace('@', '+')`)
    expect(read('scripts', 'seed.mjs')).toContain(`username.replace('@', '+')`)
  })

  it('reserves the same names in the database as in the app', () => {
    const block = /is_reserved_username[\s\S]*?in \(([\s\S]*?)\)/.exec(sql)?.[1] ?? ''
    const inSql = [...block.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()
    expect(inSql).toEqual([...RESERVED_USERNAMES].sort())
  })

  it('uses the same username pattern in SQL and TypeScript, and in the edge function', () => {
    const pattern = USERNAME_PATTERN.source
    expect(sql).toContain(`'${pattern}'`)
    expect(edgeFunction).toContain(pattern)
  })

  it('does not leave the old e-mail-verification pieces behind', () => {
    for (const gone of [
      'src/pages/public/VerifyEmailPage.tsx', 'src/pages/public/AuthCallbackPage.tsx', 'src/components/auth/ResendVerification.tsx',
      'src/lib/pendingVerification.ts', 'src/lib/authRedirect.ts', 'supabase/templates/confirmation.html', 'scripts/check-email.mjs',
    ]) {
      expect(() => readFileSync(join(root, gone)), `${gone} should be deleted`).toThrow()
    }
    const app = read('src', 'App.tsx')
    expect(app).not.toMatch(/verify-email|auth\/callback|VerifyEmailPage|AuthCallbackPage/)
  })
})
