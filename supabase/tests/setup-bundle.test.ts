/**
 * `supabase/setup.sql` is what gets pasted into the Supabase SQL editor on a new project, so it must
 *   1. be exactly the migrations concatenated (never stale),
 *   2. run cleanly as ONE script on an empty database, and
 *   3. create every object the app relies on — with Row Level Security on every table.
 * The Supabase-provided pieces it leans on (auth/storage schemas, roles) come from ./bootstrap.ts.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BOOTSTRAP } from './bootstrap'

const ROOT = join(__dirname, '..', '..')
const SETUP = join(ROOT, 'supabase', 'setup.sql')

let db: PGlite
const names = async (sql: string) => (await db.query<{ n: string }>(sql)).rows.map((r) => r.n).sort()
const count = async (sql: string) => Number((await db.query<{ n: number | string }>(sql)).rows[0].n)

const TABLES = [
  'achievements', 'app_settings', 'audit_logs', 'certificates', 'departments', 'event_categories',
  'notifications', 'od_requests', 'profiles', 'verification_records',
]
const VIEWS = ['achievement_details', 'od_details', 'student_summaries']

beforeAll(async () => {
  db = new PGlite()
  await db.exec(BOOTSTRAP)
  // exactly what pasting the file into the SQL editor does: one script, one go
  await db.exec(readFileSync(SETUP, 'utf8'))
})

afterAll(async () => {
  await db.close()
})

describe('supabase/setup.sql', () => {
  it('is the current migrations, concatenated (regenerate with `npm run build-sql` if this fails)', () => {
    const before = readFileSync(SETUP, 'utf8')
    execFileSync(process.execPath, ['scripts/bundle-sql.mjs'], { cwd: ROOT, stdio: 'pipe' })
    const after = readFileSync(SETUP, 'utf8')
    expect(after).toBe(before)
  })

  it('creates all tables, and every one has Row Level Security enabled', async () => {
    expect(await names(`select tablename as n from pg_tables where schemaname = 'public'`)).toEqual(TABLES)
    const unprotected = await names(
      `select c.relname as n from pg_class c join pg_namespace s on s.oid = c.relnamespace
        where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    )
    expect(unprotected).toEqual([])
  })

  it('creates the reporting views as security-invoker (callers\' RLS applies)', async () => {
    expect(await names(`select viewname as n from pg_views where schemaname = 'public'`)).toEqual(VIEWS)
    const invoker = await names(
      `select c.relname as n from pg_class c join pg_namespace s on s.oid = c.relnamespace
        where s.nspname = 'public' and c.relkind = 'v' and 'security_invoker=true' = any(c.reloptions)`,
    )
    expect(invoker).toEqual(VIEWS)
  })

  it('creates the relationships (foreign keys), indexes and constraints', async () => {
    // 14 = profiles→auth.users/departments, achievements→profiles(2)/categories, certificates & OD→achievement (composite),
    // OD→categories/profiles, verification→achievements/profiles, notifications→profiles, audit→profiles, settings→profiles
    expect(await count(`select count(*) as n from pg_constraint c join pg_namespace s on s.oid = c.connamespace where s.nspname = 'public' and c.contype = 'f'`)).toBe(14)
    // the composite keys that tie certificates / OD requests to the same student as their achievement
    const composite = await names(`select conname as n from pg_constraint where contype = 'f' and conname in ('certificates_achievement_fkey', 'od_requests_achievement_fkey')`)
    expect(composite).toEqual(['certificates_achievement_fkey', 'od_requests_achievement_fkey'])
    const indexes = await names(`select indexname as n from pg_indexes where schemaname = 'public'`)
    for (const expected of [
      'achievements_student_idx', 'achievements_status_idx', 'achievements_category_idx', 'achievements_start_date_idx',
      'certificates_student_hash_idx', 'od_requests_student_idx', 'od_requests_status_idx', 'notifications_user_idx',
      'audit_logs_created_idx', 'audit_logs_entity_idx', 'profiles_role_department_idx', 'profiles_full_name_idx',
    ]) {
      expect(indexes, `missing index ${expected}`).toContain(expected)
    }
    const uniques = await names(`select indexname as n from pg_indexes where schemaname = 'public' and indexname in ('profiles_register_number_key', 'profiles_faculty_id_key')`)
    expect(uniques).toEqual(['profiles_faculty_id_key', 'profiles_register_number_key'])
  })

  it('creates the triggers (signup, integrity, notifications, audit)', async () => {
    const triggers = await names(
      `select t.tgname as n from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace s on s.oid = c.relnamespace
        where not t.tgisinternal and s.nspname in ('public', 'auth')`,
    )
    for (const expected of [
      'on_auth_user_created', 'profiles_protect', 'profiles_normalize', 'achievements_guard_update', 'od_requests_guard',
      'achievements_notify', 'od_requests_notify', 'achievements_audit', 'od_requests_audit',
    ]) {
      expect(triggers, `missing trigger ${expected}`).toContain(expected)
    }
  })

  it('creates the functions the app calls (RPCs and RLS helpers)', async () => {
    const fns = await names(`select p.proname as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'`)
    for (const expected of [
      'public_settings', 'register_number_available', 'get_public_verification', 'verify_achievement', 'reject_achievement',
      'request_achievement_changes', 'review_od_request', 'review_stats', 'generate_verification_code', 'handle_new_user',
      'auth_role', 'auth_department', 'is_admin', 'is_faculty_of_student', 'achievement_is_editable',
      'storage_object_locked', 'faculty_can_read_object', 'username_available', 'is_reserved_username',
    ]) {
      expect(fns, `missing function ${expected}`).toContain(expected)
    }
  })

  it('creates Row Level Security policies on every table and on storage', async () => {
    const perTable = await db.query<{ t: string; n: number }>(`select tablename as t, count(*)::int as n from pg_policies where schemaname = 'public' group by tablename`)
    const covered = new Set(perTable.rows.map((r) => r.t))
    for (const table of TABLES) expect(covered.has(table), `no policies on ${table}`).toBe(true)
    // departments 2 · categories 2 · profiles 2 · settings 2 · achievements 5 · certificates 4 · OD 5 · verification 1 ·
    // notifications 3 · audit 1
    expect(await count(`select count(*) as n from pg_policies where schemaname = 'public'`)).toBe(27)

    const storage = await names(`select policyname as n from pg_policies where schemaname = 'storage' and tablename = 'objects'`)
    expect(storage).toEqual(expect.arrayContaining(['certificates_files_insert', 'certificates_files_student_read', 'certificates_files_staff_read', 'certificates_files_student_delete', 'avatars_insert']))
  })

  it('creates the private certificates bucket and the public avatars bucket', async () => {
    const buckets = await db.query<{ id: string; public: boolean; file_size_limit: string }>(`select id, public, file_size_limit from storage.buckets order by id`)
    expect(buckets.rows).toEqual([
      { id: 'avatars', public: true, file_size_limit: expect.anything() },
      { id: 'certificates', public: false, file_size_limit: expect.anything() },
    ])
  })

  it('loads the reference data: departments, event categories and settings', async () => {
    expect(await count(`select count(*) as n from public.departments`)).toBe(8)
    expect(await names(`select slug as n from public.event_categories`)).toEqual(
      ['certification', 'club-activity', 'competition', 'conference', 'hackathon', 'internship', 'other', 'paper-presentation', 'symposium', 'workshop'],
    )
    expect(await names(`select key as n from public.app_settings`)).toEqual(
      ['allow_student_registration', 'institution_name', 'verification_prefix'],
    )
  })

  it('wires the sign-up trigger so a username registration produces a student profile (and no stored e-mail)', async () => {
    const dept = (await db.query<{ id: string }>(`select id from public.departments where code = 'CSE'`)).rows[0].id
    await db.query(
      `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ('bundle.check@certipass.invalid', $1::jsonb, '{}'::jsonb)`,
      [JSON.stringify({ username: 'Bundle.Check', full_name: 'Bundle Check', register_number: '2024aids001', department_id: dept, year: 1, section: 'A', role: 'admin' })],
    )
    const profile = (await db.query<{ role: string; register_number: string; username: string; email: string | null }>(`select role, register_number, username, email from public.profiles where username = 'bundle.check'`)).rows[0]
    expect(profile).toEqual({ role: 'student', register_number: '2024AIDS001', username: 'bundle.check', email: null }) // a client-sent "admin" role is ignored
  })

  it('has no e-mail address in the staff directory view and no e-mail-verification objects', async () => {
    const cols = await names(`select column_name as n from information_schema.columns where table_schema = 'public' and table_name = 'student_summaries'`)
    expect(cols).toContain('username')
    expect(cols).not.toContain('email')
    expect(await names(`select p.proname as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname ilike '%verif%mail%'`)).toEqual([])
  })
  it('cannot be run twice (so it is safe: a second paste fails fast instead of half-applying)', async () => {
    await expect(db.exec(readFileSync(SETUP, 'utf8'))).rejects.toThrow(/already exists/i)
  })
})
