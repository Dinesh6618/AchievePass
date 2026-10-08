/**
 * Upgrading a project that already has migrations 1–5 (students registered with real e-mail addresses) to the
 * username model must keep every existing row, give each student a unique username, and add the new constraints.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { USERNAME_PATTERN } from '../../src/lib/identity'
import { BOOTSTRAP } from './bootstrap'

const MIGRATIONS = join(__dirname, '..', 'migrations')
const sql = (file: string) => readFileSync(join(MIGRATIONS, file), 'utf8')

let db: PGlite
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(BOOTSTRAP)
  for (const f of ['20260101000001_schema.sql', '20260101000002_rls.sql', '20260101000003_functions.sql', '20260101000004_reference_data.sql', '20260101000005_email_verification.sql']) {
    await db.exec(sql(f))
  }
  const [{ id: dept }] = await q<{ id: string }>(`select id from departments where code = 'CSE'`)

  // students as the OLD flow created them: real college e-mail, no username
  const legacy: [string, string, string][] = [
    ['dinesh.g.2024.aids@rajalakshmi.edu.in', 'Dinesh G', '2024-AIDS-001'],
    ['dinesh2@rajalakshmi.edu.in', 'Dinesh Two', '2024AIDS001x'], // different reg number…
    ['priya@rajalakshmi.edu.in', 'Priya S', '2024aids-001'], // …that strips down to the same base as the first
    ['x@rajalakshmi.edu.in', 'Short Reg', 'A1'], // reg number too short to be a username
  ]
  for (const [email, name, reg] of legacy) {
    await db.query(
      `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) values ($1, $2::jsonb, '{}'::jsonb, now())`,
      [email, JSON.stringify({ full_name: name, register_number: reg, department_id: dept, year: 2, section: 'A' })],
    )
  }
  // plus a faculty member, who must be left alone
  await db.query(
    `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) values ('fac@rajalakshmi.edu.in', $1::jsonb, $2::jsonb, now())`,
    [JSON.stringify({ full_name: 'Dr Fac', faculty_id: 'F9', department_id: dept }), JSON.stringify({ role: 'faculty', provisioned: 'true' })],
  )

  await db.exec(sql('20260101000006_username_auth.sql'))
})

afterAll(async () => {
  await db.close()
})

describe('upgrading existing students to usernames', () => {
  it('keeps every existing profile and its data', async () => {
    const rows = await q<{ full_name: string; register_number: string; email: string | null }>(`select full_name, register_number, email from profiles where role = 'student' order by full_name`)
    expect(rows.map((r) => r.full_name)).toEqual(['Dinesh G', 'Dinesh Two', 'Priya S', 'Short Reg'])
    expect(rows.find((r) => r.full_name === 'Dinesh G')?.register_number).toBe('2024-AIDS-001')
    // the old address stays on file (it is their real e-mail) — nothing is deleted
    expect(rows.find((r) => r.full_name === 'Dinesh G')?.email).toBe('dinesh.g.2024.aids@rajalakshmi.edu.in')
  })

  it('gives each student a valid, unique username derived from their register number', async () => {
    const rows = await q<{ full_name: string; username: string }>(`select full_name, username from profiles where role = 'student' order by created_at, full_name`)
    const byName = Object.fromEntries(rows.map((r) => [r.full_name, r.username]))
    expect(byName['Dinesh G']).toBe('2024aids001')
    expect(byName['Priya S']).toBe('2024aids0012') // collided with the first → suffix
    expect(byName['Dinesh Two']).toMatch(/^2024aids001x$/)
    expect(byName['Short Reg']).toMatch(/^student[0-9a-f]{6}$/) // too short → generated
    expect(new Set(rows.map((r) => r.username)).size).toBe(rows.length)
    for (const r of rows) expect(r.username).toMatch(USERNAME_PATTERN)
  })

  it('leaves staff untouched', async () => {
    const [f] = await q<{ username: string | null; email: string }>(`select username, email from profiles where role = 'faculty'`)
    expect(f).toEqual({ username: null, email: 'fac@rajalakshmi.edu.in' })
  })

  it('adds the constraints: unique usernames, required for students', async () => {
    await expect(db.query(`update profiles set username = '2024aids001' where full_name = 'Priya S'`)).rejects.toThrow(/duplicate key|unique/i)
    await expect(db.query(`update profiles set username = null where role = 'student' and full_name = 'Priya S'`)).rejects.toThrow(/student_has_username|check/i)
    await expect(db.query(`update profiles set username = 'No Spaces!' where full_name = 'Priya S'`)).rejects.toThrow(/username_format|check/i)
  })

  it('retires the e-mail-domain setting and the e-mail column requirement', async () => {
    expect(await q(`select 1 from app_settings where key = 'student_email_domain'`)).toHaveLength(0)
    const [col] = await q<{ is_nullable: string }>(`select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'`)
    expect(col.is_nullable).toBe('YES')
  })

  it('accepts new username sign-ups afterwards', async () => {
    const [{ id: dept }] = await q<{ id: string }>(`select id from departments where code = 'IT'`)
    await db.query(
      `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) values ('newbie@certipass.invalid', $1::jsonb, '{}'::jsonb, now())`,
      [JSON.stringify({ username: 'newbie', full_name: 'New Student', register_number: 'NEW-1', department_id: dept, year: 1, section: 'B' })],
    )
    const [p] = await q<{ username: string; email: string | null }>(`select username, email from profiles where username = 'newbie'`)
    expect(p).toEqual({ username: 'newbie', email: null })
  })

  it('can be run again — e.g. on a project that installed the earlier 3–30-character rule — without losing anything', async () => {
    const before = await q(`select id, username from profiles order by id`)
    // put the earlier, stricter constraint back, as that version of the file would have left it
    await db.exec(`alter table profiles drop constraint profiles_username_format`)
    await db.exec(`alter table profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$')`)
    const [{ id: dept }] = await q<{ id: string }>(`select id from departments where code = 'IT'`)
    const longName = 'dinesh.g.2024.aids@rajalakshmi.edu.in'
    const signUp = () => db.query(
      `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) values ($1, $2::jsonb, '{}'::jsonb, now())`,
      ['dinesh.g.2024.aids+rajalakshmi.edu.in@certipass.invalid', JSON.stringify({ username: longName, full_name: 'Long Name', register_number: 'LONG-1', department_id: dept, year: 1, section: 'A' })],
    )
    await expect(signUp()).rejects.toThrow() // the old rule (and old trigger text) refuses it

    await db.exec(sql('20260101000006_username_auth.sql')) // second run: must not fail
    expect(await q(`select id, username from profiles order by id`)).toEqual(before)
    await signUp()
    const [p] = await q<{ username: string; email: string | null }>(`select username, email from profiles where register_number = 'LONG-1'`)
    expect(p).toEqual({ username: longName, email: null })
  })
})
