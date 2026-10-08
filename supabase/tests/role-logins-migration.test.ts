/**
 * Upgrading a project that already has migrations 1–6 and faculty / admin accounts made with REAL e-mail addresses
 * to username sign-in for every role (migration 7) must keep every row, give each staff member a unique username,
 * require one from then on, and apply the same sign-up rules to staff as to students.
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
let dept: string
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(BOOTSTRAP)
  for (const f of ['20260101000001_schema.sql', '20260101000002_rls.sql', '20260101000003_functions.sql', '20260101000004_reference_data.sql', '20260101000005_email_verification.sql']) {
    await db.exec(sql(f))
  }
  ;[{ id: dept }] = await q<{ id: string }>(`select id from departments where code = 'CSE'`)

  // staff as the OLD flow created them: a real e-mail address, no username
  const legacy: [string, string, string, string][] = [
    ['meena.s@college.edu', 'Dr. Meena S', 'faculty', 'F100'],
    ['meena.s@other-college.edu', 'Dr. Meena Sundar', 'faculty', 'F101'], // same local part → suffix
    ['x@college.edu', 'Short Mail', 'faculty', 'F102'], // local part too short to be a username
    ['principal@college.edu', 'The Admin', 'admin', ''],
  ]
  for (const [email, name, role, facultyId] of legacy) {
    await db.query(
      `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) values ($1, $2::jsonb, $3::jsonb, now())`,
      [email, JSON.stringify({ full_name: name, faculty_id: facultyId || null, department_id: role === 'admin' ? null : dept }), JSON.stringify({ role, provisioned: 'true' })],
    )
  }
  // and a student made by migration 6's flow must be left alone
  await db.exec(sql('20260101000006_username_auth.sql'))
  await db.query(
    `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) values ('stud1@certipass.invalid', $1::jsonb, '{}'::jsonb, now())`,
    [JSON.stringify({ username: 'stud1', full_name: 'Stud One', register_number: 'S1', department_id: dept, year: 1, section: 'A' })],
  )

  await db.exec(sql('20260101000007_role_logins.sql'))
})

afterAll(async () => {
  await db.close()
})

const signUp = (email: string, meta: Record<string, unknown>, app: Record<string, unknown> = {}) =>
  db.query(`insert into auth.users (email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) values ($1, $2::jsonb, $3::jsonb, now())`, [
    email,
    JSON.stringify(meta),
    JSON.stringify(app),
  ])

describe('upgrading existing faculty and admins to usernames', () => {
  it('keeps every existing profile and its real e-mail (now plain contact information)', async () => {
    const rows = await q<{ full_name: string; email: string | null }>(`select full_name, email from profiles where role <> 'student' order by full_name`)
    expect(rows.map((r) => r.full_name)).toEqual(['Dr. Meena S', 'Dr. Meena Sundar', 'Short Mail', 'The Admin'])
    expect(rows.find((r) => r.full_name === 'Dr. Meena S')?.email).toBe('meena.s@college.edu')
  })

  it('gives each of them a valid, unique username', async () => {
    const rows = await q<{ full_name: string; username: string }>(`select full_name, username from profiles where role <> 'student' order by created_at, full_name`)
    const by = Object.fromEntries(rows.map((r) => [r.full_name, r.username]))
    expect(by['Dr. Meena S']).toBe('meena.s')
    expect(by['Dr. Meena Sundar']).toBe('meena.s2') // collided → suffix
    expect(by['Short Mail']).toMatch(/^faculty[0-9a-f]{6}$/) // too short → generated
    expect(by['The Admin']).toBe('principal')
    expect(new Set(rows.map((r) => r.username)).size).toBe(rows.length)
    for (const r of rows) expect(r.username).toMatch(USERNAME_PATTERN)
  })

  it('leaves the existing student alone', async () => {
    const [s] = await q<{ username: string; email: string | null }>(`select username, email from profiles where role = 'student'`)
    expect(s).toEqual({ username: 'stud1', email: null })
  })

  it('requires a username for every role from now on', async () => {
    await expect(db.query(`update profiles set username = null where full_name = 'The Admin'`)).rejects.toThrow(/has_username|check|null/i)
    await expect(db.query(`update profiles set username = 'meena.s' where full_name = 'Dr. Meena Sundar'`)).rejects.toThrow(/duplicate key|unique/i)
  })

  it('can be run again without error or change', async () => {
    const before = await q(`select id, username from profiles order by id`)
    await db.exec(sql('20260101000007_role_logins.sql'))
    expect(await q(`select id, username from profiles order by id`)).toEqual(before)
  })
})

describe('sign-up rules after the upgrade', () => {
  const staffMeta = { full_name: 'New Teacher', faculty_id: 'F900', department_id: '' }

  it('creates faculty from a username and the internal login address, with no e-mail on the profile', async () => {
    await signUp('new.teacher@certipass.invalid', { ...staffMeta, department_id: dept, username: 'new.teacher' }, { role: 'faculty', provisioned: 'true' })
    const [p] = await q<{ role: string; username: string; email: string | null; faculty_id: string }>(`select role, username, email, faculty_id from profiles where username = 'new.teacher'`)
    expect(p).toEqual({ role: 'faculty', username: 'new.teacher', email: null, faculty_id: 'F900' })
  })

  it('refuses a real e-mail address as a staff login, and a missing or invalid username', async () => {
    await expect(signUp('real.person@college.edu', { ...staffMeta, department_id: dept, username: 'real.person' }, { role: 'faculty', provisioned: 'true' })).rejects.toThrow()
    await expect(signUp('nameless@certipass.invalid', { ...staffMeta, department_id: dept }, { role: 'faculty', provisioned: 'true' })).rejects.toThrow()
    await expect(signUp('bad name@certipass.invalid', { ...staffMeta, department_id: dept, username: 'bad name' }, { role: 'faculty', provisioned: 'true' })).rejects.toThrow()
  })

  it('lets only the first administrator use an official-looking name', async () => {
    await signUp('admin@certipass.invalid', { full_name: 'Site Admin', username: 'admin' }, { role: 'admin', provisioned: 'true' })
    await expect(signUp('staff@certipass.invalid', { ...staffMeta, department_id: dept, username: 'staff' }, { role: 'faculty', provisioned: 'true' })).rejects.toThrow()
    await expect(signUp('faculty@certipass.invalid', { full_name: 'Public', username: 'faculty', register_number: 'P1', department_id: dept, year: 1, section: 'A' })).rejects.toThrow()
  })

  it('still never turns a public sign-up into faculty or admin', async () => {
    await signUp('sneaky@certipass.invalid', { full_name: 'Sneaky', username: 'sneaky', register_number: 'SN9', department_id: dept, year: 1, section: 'A', role: 'admin' })
    const [p] = await q<{ role: string }>(`select role from profiles where username = 'sneaky'`)
    expect(p.role).toBe('student')
  })
})

describe('supabase/bootstrap-admin.sql (the first administrator, made from the SQL Editor)', () => {
  const script = readFileSync(join(__dirname, '..', 'bootstrap-admin.sql'), 'utf8')
  const forUser = (username: string) => {
    expect(script).toContain(`v_username constant text := 'college.admin';`)
    return script.replace(`'college.admin'`, `'${username}'`)
  }
  const register = (username: string, reg: string) =>
    signUp(`${username}@certipass.invalid`, { username, full_name: 'Future Admin', register_number: reg, department_id: dept, year: 1, section: 'A' })

  it('turns a freshly registered account into an administrator, and nothing else changes', async () => {
    await register('college.admin', 'ADM-1')
    await db.exec(forUser('college.admin'))
    const [p] = await q<{ role: string; register_number: string | null; department_id: string | null; is_active: boolean }>(
      `select role, register_number, department_id, is_active from profiles where username = 'college.admin'`,
    )
    expect(p).toEqual({ role: 'admin', register_number: null, department_id: null, is_active: true })
    // other people are untouched
    expect(await q(`select 1 from profiles where username = 'stud1' and role = 'student'`)).toHaveLength(1)
  })

  it('gives that account administrator access — and a plain student none', async () => {
    const [{ id: adminId }] = await q<{ id: string }>(`select id from profiles where username = 'college.admin'`)
    const countAs = async (userId: string) => {
      await db.exec('set role authenticated')
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId])
      try {
        return (await q<{ n: number }>(`select count(*)::int as n from profiles`))[0].n
      } finally {
        await db.exec('reset role')
        await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
      }
    }
    const [{ id: studentId }] = await q<{ id: string }>(`select id from profiles where username = 'stud1'`)
    expect(await countAs(adminId)).toBeGreaterThan(5) // sees everyone
    expect(await countAs(studentId)).toBe(1) // only themselves
  })

  it('does nothing for an unknown username, and refuses an account that already has records', async () => {
    await expect(db.exec(forUser('nobody.here'))).rejects.toThrow(/no account with the username/i)
    await register('busy.student', 'ADM-2')
    const [{ id }] = await q<{ id: string }>(`select id from profiles where username = 'busy.student'`)
    const [{ id: category }] = await q<{ id: string }>(`select id from event_categories limit 1`)
    await db.query(
      `insert into achievements (student_id, category_id, event_name, organization, start_date) values ($1, $2, 'Some Hackathon', 'Org', '2026-01-02')`,
      [id, category],
    )
    await expect(db.exec(forUser('busy.student'))).rejects.toThrow(/already has achievements/i)
    expect((await q<{ role: string }>(`select role from profiles where id = $1`, [id]))[0].role).toBe('student')
  })

  it('can be run again on the same account', async () => {
    await db.exec(forUser('college.admin'))
    expect((await q<{ role: string }>(`select role from profiles where username = 'college.admin'`))[0].role).toBe('admin')
  })

  it('can not be used by anyone signed in to the app: roles stay locked for API users', async () => {
    const [{ id }] = await q<{ id: string }>(`select id from profiles where username = 'stud1'`)
    await db.exec('set role authenticated')
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id])
    try {
      await expect(db.query(`update profiles set role = 'admin' where id = $1`, [id])).rejects.toThrow()
    } finally {
      await db.exec('reset role')
      await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    }
  })
})
