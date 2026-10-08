/**
 * Runs the real migrations against an in-process Postgres (PGlite) and checks the
 * security rules that matter most: role isolation, department scoping, locked
 * states, signup hardening and the public QR page's data exposure.
 *
 * Supabase-specific pieces (auth schema, storage schema, roles) are stubbed in
 * ./bootstrap.ts. This does NOT replace testing against a real Supabase project
 * (GoTrue, Storage API), but it exercises every policy and RPC.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BOOTSTRAP } from './bootstrap'

const MIGRATIONS = join(__dirname, '..', 'migrations')

let db: PGlite
const ids: Record<string, string> = {}

type Row = Record<string, unknown>

async function rows(sql: string, params: unknown[] = []): Promise<Row[]> {
  const res = await db.query<Row>(sql, params)
  return res.rows
}

/** Run `fn` as a signed-in Supabase user (role + JWT subject), then restore the superuser. */
async function as<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(userId ? 'set role authenticated' : 'set role anon')
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ''])
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}

async function expectDenied(promise: Promise<unknown>) {
  await expect(promise).rejects.toThrow()
}

/** The internal login address Supabase Auth sees for a student (never displayed or stored in the profile). */
const authEmail = (username: string) => `${username.replace('@', '+')}@certipass.invalid`

/** Inserts into auth.users exactly like GoTrue does (with "Confirm email" off the address is confirmed at once). */
async function createUser(key: string, email: string, meta: Record<string, unknown>, app: Record<string, unknown> = {}) {
  const [row] = await rows(
    `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at)
     values ($1, $2::jsonb, $3::jsonb, now()) returning id`,
    [email, JSON.stringify(meta), JSON.stringify(app)],
  )
  ids[key] = row.id as string
  return ids[key]
}

/** A public student sign-up: username + password, the login address derived from the username. */
function createStudent(key: string, username: string, meta: Record<string, unknown> = {}) {
  return createUser(key, authEmail(username.toLowerCase().trim()), { username, ...meta })
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(BOOTSTRAP)
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
  }

  const [cse] = await rows(`select id from departments where code = 'CSE'`)
  const [ece] = await rows(`select id from departments where code = 'ECE'`)
  ids.cse = cse.id as string
  ids.ece = ece.id as string
  const [hack] = await rows(`select id from event_categories where slug = 'hackathon'`)
  ids.hackathon = hack.id as string

  await createStudent('alice', 'Alice2021', {
    full_name: 'Alice Kumar', register_number: '2021cse001', department_id: ids.cse, year: 3, section: 'A',
    // an attacker-controlled attempt to self-promote must be ignored
    role: 'admin',
  })
  await createStudent('bob', 'bob2021', {
    full_name: 'Bob Raj', register_number: '2021CSE002', department_id: ids.cse, year: 3,
  })
  await createStudent('carol', 'carol2021', {
    full_name: 'Carol Das', register_number: '2021ECE001', department_id: ids.ece, year: 2,
  })
  await createUser('fac_cse', 'fac.cse@college.edu',
    { full_name: 'Dr. Meena', faculty_id: 'f001', department_id: ids.cse, designation: 'Professor' },
    { role: 'faculty', provisioned: 'true' })
  await createUser('fac_ece', 'fac.ece@college.edu',
    { full_name: 'Dr. Ravi', faculty_id: 'f002', department_id: ids.ece },
    { role: 'faculty', provisioned: 'true' })
  await createUser('admin', 'admin@college.edu', { full_name: 'Site Admin' },
    { role: 'admin', provisioned: 'true' })
})

afterAll(async () => {
  await db.close()
})

describe('signup (username + password)', () => {
  it('creates a student profile from the username and ignores a client-supplied role', async () => {
    const [p] = await rows(`select role, username, register_number, email from profiles where id = $1`, [ids.alice])
    expect(p.role).toBe('student')
    expect(p.username).toBe('alice2021') // normalised to lower case
    expect(p.register_number).toBe('2021CSE001') // normalised
  })

  it('never stores the internal login address in the profile', async () => {
    const [p] = await rows(`select email from profiles where id = $1`, [ids.alice])
    expect(p.email).toBeNull()
    expect(await rows(`select 1 from profiles where email like '%certipass.invalid'`)).toHaveLength(0)
    const [view] = await as(ids.fac_cse, () => rows(`select * from student_summaries where id = $1`, [ids.alice]))
    expect(JSON.stringify(view)).not.toMatch(/certipass\.invalid/)
    expect(Object.keys(view)).not.toContain('email')
  })

  it('only honours the role from app metadata (service role); staff keep their real e-mail', async () => {
    const [f] = await rows(`select role, faculty_id, email from profiles where id = $1`, [ids.fac_cse])
    expect(f.role).toBe('faculty')
    expect(f.faculty_id).toBe('F001')
    expect(f.email).toBe('fac.cse@college.edu')
    const [a] = await rows(`select role, department_id from profiles where id = $1`, [ids.admin])
    expect(a.role).toBe('admin')
    expect(a.department_id).toBeNull()
  })

  it('makes usernames unique, ignoring case', async () => {
    await expectDenied(createStudent('dupName', 'ALICE2021', { full_name: 'Copycat', register_number: 'NEW1', department_id: ids.cse }))
    await expectDenied(createStudent('dupName2', ' alice2021 ', { full_name: 'Copycat', register_number: 'NEW2', department_id: ids.cse }))
  })

  it('rejects usernames that are too short, too long, or contain unsafe characters', async () => {
    const meta = { full_name: 'X Y', register_number: 'FMT', department_id: ids.cse }
    const bads = ['ab', 'a'.repeat(101), 'bad name', '.leading', 'trailing.', 'under_', 'emoji😀x', 'semi;colon', 'two..dots', 'a@b@c', '@leading', 'trailing@', 'name@.edu', 'name@edu.', 'a b@c.edu']
    for (const bad of bads) {
      await expectDenied(createUser('bad', `${bad.toLowerCase().replace('@', '+')}@certipass.invalid`, { username: bad, ...meta }))
    }
    await createStudent('goodName', 'good.name_1-x', { full_name: 'Good Name', register_number: 'FMT2', department_id: ids.cse })
    expect((await rows(`select username from profiles where id = $1`, [ids.goodName]))[0].username).toBe('good.name_1-x')
  })

  it('lets a student use a college-e-mail-style username (one @, up to 100 characters) without ever storing or using a real address', async () => {
    const meta = { full_name: 'Dinesh G', department_id: ids.cse }
    await createStudent('emailStyle', 'Dinesh.G.2024.AIDS@Rajalakshmi.edu.in', { ...meta, register_number: 'ES1' })
    const [p] = await rows(`select username, email from profiles where id = $1`, [ids.emailStyle])
    expect(p.username).toBe('dinesh.g.2024.aids@rajalakshmi.edu.in')
    expect(p.email).toBeNull()
    // the login address Supabase Auth sees is the single, never-deliverable internal one
    const [u] = await rows(`select email from auth.users where id = $1`, [ids.emailStyle])
    expect(u.email).toBe('dinesh.g.2024.aids+rajalakshmi.edu.in@certipass.invalid')
    // exactly 100 characters is fine, 101 is not (checked above)
    const hundred = `${'a'.repeat(60)}@${'b'.repeat(39)}`
    expect(hundred).toHaveLength(100)
    await createStudent('longName', hundred, { ...meta, register_number: 'ES2' })
    // it counts as taken afterwards, whatever the letter case
    const [taken] = await as(null, () => rows(`select public.username_available('DINESH.G.2024.AIDS@rajalakshmi.edu.in') as v`))
    expect(taken.v).toBe(false)
    // the real address itself can't be used as the *login* address for that username
    await expectDenied(createUser('realLogin', 'other.student@rajalakshmi.edu.in', { username: 'other.student@rajalakshmi.edu.in', ...meta, register_number: 'ES3' }))
    await expectDenied(createUser('twoAts', 'x@y@certipass.invalid', { username: 'x@y', ...meta, register_number: 'ES4' }))
  })

  it('keeps official-looking names (admin, faculty, …) unclaimable', async () => {
    for (const name of ['admin', 'Faculty', 'certipass', 'support']) {
      await expectDenied(createStudent('reserved', name, { full_name: 'Imposter', register_number: 'IMP1', department_id: ids.cse }))
    }
    const [r] = await as(null, () => rows(`select public.username_available('admin') as v`))
    expect(r.v).toBe(false)
  })

  it('requires a username for students', async () => {
    await expectDenied(createUser('nameless', authEmail('nameless'), { full_name: 'No Name', register_number: 'NN1', department_id: ids.cse }))
  })

  it('ties the login address to the username, so public sign-ups cannot register real e-mail addresses', async () => {
    const meta = { full_name: 'Sneaky', register_number: 'SN1', department_id: ids.cse }
    // a real address, even with a valid username
    await expectDenied(createUser('realEmail', 'someone@gmail.com', { username: 'sneaky1', ...meta }))
    // somebody else's internal address
    await expectDenied(createUser('stolen', authEmail('bob2021'), { username: 'sneaky2', ...meta }))
    // an internal address that does not match the username
    await expectDenied(createUser('mismatch', authEmail('other.name'), { username: 'sneaky3', ...meta }))
  })

  it('rejects duplicate register numbers', async () => {
    await expectDenied(createStudent('dup', 'dup2021', { full_name: 'Dup', register_number: '2021cse001', department_id: ids.cse }))
  })

  it('honours the "registration closed" setting', async () => {
    await db.exec(`update app_settings set value = to_jsonb(false) where key = 'allow_student_registration'`)
    await expectDenied(createStudent('closed', 'late2021', { full_name: 'Late Person', register_number: 'LATE1', department_id: ids.cse }))
    await db.exec(`update app_settings set value = to_jsonb(true) where key = 'allow_student_registration'`)
    await createStudent('open', 'timely2021', { full_name: 'Timely Person', register_number: 'OPEN1', department_id: ids.cse })
  })

  it('exposes only whitelisted settings and availability checks to anon', async () => {
    const [s] = await as(null, () => rows(`select public.public_settings() as s`))
    expect(Object.keys(s.s as object).sort()).toEqual(['allow_student_registration', 'institution_name'])
    const [reg] = await as(null, () => rows(`select public.register_number_available('2021cse001') as v`))
    expect(reg.v).toBe(false)
    const [taken] = await as(null, () => rows(`select public.username_available('  ALICE2021 ') as v`))
    expect(taken.v).toBe(false)
    const [free] = await as(null, () => rows(`select public.username_available('brand.new.name') as v`))
    expect(free.v).toBe(true)
    await expectDenied(as(null, () => rows(`select * from profiles`)))
  })

  it('has no e-mail verification state: accounts are usable straight away', async () => {
    // there is no pending / unconfirmed concept in the schema any more
    expect(await rows(`select 1 from pg_proc where proname in ('resend_verification','confirm_email')`)).toHaveLength(0)
    expect((await rows(`select count(*)::int as n from profiles where role = 'student' and username is null`))[0].n).toBe(0)
  })
})

describe('profiles', () => {
  it('students see only themselves; faculty see own-department students; admin sees all', async () => {
    const own = await as(ids.alice, () => rows(`select id from profiles`))
    expect(own.map((r) => r.id)).toEqual([ids.alice])

    const fac = await as(ids.fac_cse, () => rows(`select id from profiles order by full_name`))
    const facIds = fac.map((r) => r.id)
    expect(facIds).toContain(ids.alice)
    expect(facIds).toContain(ids.bob)
    expect(facIds).not.toContain(ids.carol)
    expect(facIds).not.toContain(ids.admin)

    const all = await as(ids.admin, () => rows(`select id from profiles`))
    expect(all.length).toBeGreaterThanOrEqual(6)
  })

  it('stops users escalating their own role or changing identifiers', async () => {
    await expectDenied(as(ids.alice, () => rows(`update profiles set role = 'admin' where id = $1`, [ids.alice])))
    await expectDenied(as(ids.alice, () => rows(`update profiles set department_id = $2 where id = $1`, [ids.alice, ids.ece])))
    await expectDenied(as(ids.alice, () => rows(`update profiles set register_number = 'HACK' where id = $1`, [ids.alice])))
    // the username is the login identity (the sign-in address is derived from it): nobody renames it through the API
    await expectDenied(as(ids.alice, () => rows(`update profiles set username = 'bob2021' where id = $1`, [ids.alice])))
    await expectDenied(as(ids.alice, () => rows(`update profiles set username = 'renamed' where id = $1`, [ids.alice])))
    await expectDenied(as(ids.admin, () => rows(`update profiles set username = 'renamed' where id = $1`, [ids.alice])))
    expect((await rows(`select username from profiles where id = $1`, [ids.alice]))[0].username).toBe('alice2021')
    // ...but an admin can still edit the rest of a profile
    await as(ids.admin, () => rows(`update profiles set section = 'C' where id = $1`, [ids.alice]))
    await as(ids.admin, () => rows(`update profiles set section = 'A' where id = $1`, [ids.alice]))
    await as(ids.alice, () => rows(`update profiles set phone = '+91 98765 43210', section = 'B' where id = $1`, [ids.alice]))
    const [p] = await rows(`select phone, section from profiles where id = $1`, [ids.alice])
    expect(p.section).toBe('B')
  })
})

describe('achievement workflow', () => {
  const cert = (achievementId: string, studentId: string, path: string) =>
    rows(
      `insert into certificates (achievement_id, student_id, storage_path, file_name, mime_type, size_bytes)
       values ($1, $2, $3, 'cert.pdf', 'application/pdf', 1234)`,
      [achievementId, studentId, path],
    )

  it('lets a student create a draft but not a pre-verified record', async () => {
    const [a] = await as(ids.alice, () =>
      rows(
        `insert into achievements (student_id, category_id, event_name, organization, start_date, result)
         values ($1, $2, 'VMEDITHON V3.0', 'XYZ Institute', '2026-09-17', 'Finalist') returning id, status`,
        [ids.alice, ids.hackathon],
      ),
    )
    ids.ach1 = a.id as string
    expect(a.status).toBe('draft')

    await expectDenied(
      as(ids.alice, () =>
        rows(
          `insert into achievements (student_id, category_id, event_name, start_date, status)
           values ($1, $2, 'Forged', '2026-01-01', 'verified')`,
          [ids.alice, ids.hackathon],
        ),
      ),
    )
    await expectDenied(
      as(ids.alice, () =>
        rows(
          `insert into achievements (student_id, category_id, event_name, start_date)
           values ($1, $2, 'Someone else''s', '2026-01-01')`,
          [ids.bob, ids.hackathon],
        ),
      ),
    )
  })

  it('requires a certificate before submission', async () => {
    await expectDenied(
      as(ids.alice, () => rows(`update achievements set status = 'pending' where id = $1`, [ids.ach1])),
    )
    await as(ids.alice, () => cert(ids.ach1, ids.alice, `${ids.alice}/a.pdf`))
    await as(ids.alice, () => rows(`update achievements set status = 'pending' where id = $1`, [ids.ach1]))
    const [a] = await rows(`select status, submitted_at from achievements where id = $1`, [ids.ach1])
    expect(a.status).toBe('pending')
    expect(a.submitted_at).not.toBeNull()
  })

  it('stops students certifying themselves or forging review data', async () => {
    // pending is locked: the UPDATE matches no row, so nothing changes
    await as(ids.alice, () => rows(`update achievements set status = 'verified' where id = $1`, [ids.ach1]))
    await as(ids.alice, () => rows(`update achievements set review_comment = 'approved' where id = $1`, [ids.ach1]))
    const [a] = await rows(`select status, review_comment from achievements where id = $1`, [ids.ach1])
    expect(a.status).toBe('pending')
    expect(a.review_comment).toBeNull()
  })

  it('hides pending records from other students and other departments', async () => {
    expect(await as(ids.bob, () => rows(`select id from achievements`))).toHaveLength(0)
    expect(await as(ids.fac_ece, () => rows(`select id from achievements`))).toHaveLength(0)
    expect(await as(ids.fac_cse, () => rows(`select id from achievements`))).toHaveLength(1)
    expect(await as(ids.fac_cse, () => rows(`select id from certificates`))).toHaveLength(1)
    expect(await as(ids.fac_ece, () => rows(`select id from certificates`))).toHaveLength(0)
    expect(await as(ids.fac_cse, () => rows(`select id from achievement_details`))).toHaveLength(1)
    expect(await as(ids.fac_ece, () => rows(`select id from achievement_details`))).toHaveLength(0)
  })

  it('does not show faculty a student draft', async () => {
    const [d] = await as(ids.bob, () =>
      rows(
        `insert into achievements (student_id, category_id, event_name, start_date)
         values ($1, $2, 'Private draft', '2026-02-02') returning id`,
        [ids.bob, ids.hackathon],
      ),
    )
    expect(d.id).toBeTruthy()
    const seen = await as(ids.fac_cse, () => rows(`select event_name from achievements`))
    expect(seen.map((r) => r.event_name)).not.toContain('Private draft')
  })

  it('notified faculty of the new submission and the student of the receipt', async () => {
    const f = await as(ids.fac_cse, () => rows(`select type, link from notifications`))
    expect(f.some((n) => n.type === 'review_requested' && String(n.link).includes(ids.ach1))).toBe(true)
    const s = await as(ids.alice, () => rows(`select type from notifications`))
    expect(s.map((n) => n.type)).toContain('achievement_submitted')
    expect(await as(ids.fac_ece, () => rows(`select id from notifications`))).toHaveLength(0)
  })

  it('only same-department faculty can decide', async () => {
    await expectDenied(as(ids.fac_ece, () => rows(`select public.verify_achievement($1)`, [ids.ach1])))
    await expectDenied(as(ids.alice, () => rows(`select public.verify_achievement($1)`, [ids.ach1])))
    await expectDenied(as(null, () => rows(`select public.verify_achievement($1)`, [ids.ach1])))
  })

  it('requires a reason to reject, and sends it to the student', async () => {
    await expectDenied(as(ids.fac_cse, () => rows(`select public.reject_achievement($1, '')`, [ids.ach1])))
    const [b] = await as(ids.bob, () =>
      rows(`select id from achievements where event_name = 'Private draft'`),
    )
    await as(ids.bob, () => cert(b.id as string, ids.bob, `${ids.bob}/b.pdf`))
    await as(ids.bob, () => rows(`update achievements set status = 'pending' where id = $1`, [b.id]))
    await as(ids.fac_cse, () =>
      rows(`select public.reject_achievement($1, 'Certificate date does not match the submitted event date.')`, [b.id]),
    )
    const n = await as(ids.bob, () => rows(`select message from notifications where type = 'achievement_rejected'`))
    expect(n[0].message).toBe('Certificate date does not match the submitted event date.')
    // a rejected record can be corrected and resubmitted
    await as(ids.bob, () => rows(`update achievements set start_date = '2026-02-03' where id = $1`, [b.id]))
    await as(ids.bob, () => rows(`update achievements set status = 'pending' where id = $1`, [b.id]))
    const [again] = await rows(`select status from achievements where id = $1`, [b.id])
    expect(again.status).toBe('pending')
  })

  it('verifies, issues a unique code, and locks the record', async () => {
    const [res] = await as(ids.fac_cse, () => rows(`select public.verify_achievement($1, 'Looks good') as code`, [ids.ach1]))
    const code = res.code as string
    expect(code).toMatch(/^CP-\d{4}-[A-HJ-NP-Z2-9]{5}$/)
    ids.code = code

    await expectDenied(as(ids.fac_cse, () => rows(`select public.verify_achievement($1)`, [ids.ach1])))

    // verified records can not be edited or deleted by the student
    await as(ids.alice, () => rows(`update achievements set event_name = 'Edited' where id = $1`, [ids.ach1]))
    await as(ids.alice, () => rows(`delete from achievements where id = $1`, [ids.ach1]))
    const [a] = await rows(`select event_name, status from achievements where id = $1`, [ids.ach1])
    expect(a.event_name).toBe('VMEDITHON V3.0')
    expect(a.status).toBe('verified')

    const n = await as(ids.alice, () => rows(`select type from notifications`))
    expect(n.map((x) => x.type)).toContain('achievement_verified')

    const vr = await as(ids.alice, () => rows(`select verification_code from verification_records`))
    expect(vr[0].verification_code).toBe(code)
    expect(await as(ids.bob, () => rows(`select * from verification_records`))).toHaveLength(0)
  })

  it('serves a public verification page without sensitive fields', async () => {
    const [r] = await as(null, () => rows(`select public.get_public_verification($1) as v`, [ids.code.toLowerCase()]))
    const v = r.v as Record<string, unknown>
    expect(v.student_name).toBe('Alice Kumar')
    expect(v.event_name).toBe('VMEDITHON V3.0')
    expect(v.result).toBe('Finalist')
    expect(Object.keys(v).sort()).toEqual([
      'category', 'department', 'end_date', 'event_name', 'institution', 'organization',
      'result', 'start_date', 'student_name', 'verification_code', 'verified_at',
    ])
    const text = JSON.stringify(v)
    expect(text).not.toContain('certipass.invalid') // the internal login address never leaves the database
    expect(text).not.toContain('alice2021') // nor does the username
    expect(text).not.toContain('98765')
    const [none] = await as(null, () => rows(`select public.get_public_verification('CP-2026-ZZZZZ') as v`))
    expect(none.v).toBeNull()
  })

  it('supports "request changes" and lets the student fix and resubmit', async () => {
    const [d] = await as(ids.alice, () =>
      rows(
        `insert into achievements (student_id, category_id, event_name, start_date)
         values ($1, $2, 'Cloud Workshop', '2026-03-03') returning id`,
        [ids.alice, ids.hackathon],
      ),
    )
    const id = d.id as string
    await as(ids.alice, () => cert(id, ids.alice, `${ids.alice}/c.pdf`))
    await as(ids.alice, () => rows(`update achievements set status = 'pending' where id = $1`, [id]))
    await as(ids.fac_cse, () => rows(`select public.request_achievement_changes($1, 'Please add the organiser name')`, [id]))
    await as(ids.alice, () => rows(`update achievements set organization = 'AWS User Group' where id = $1`, [id]))
    await as(ids.alice, () => rows(`update achievements set status = 'pending' where id = $1`, [id]))
    const [a] = await rows(`select status, organization from achievements where id = $1`, [id])
    expect(a.status).toBe('pending')
    expect(a.organization).toBe('AWS User Group')
  })
})

describe('OD requests', () => {
  const draftOd = (studentId: string, achievementId: string) =>
    rows(
      `insert into od_requests (student_id, achievement_id, category_id, event_name, event_date, venue, reason)
       values ($1, $2, $3, 'VMEDITHON V3.0', '2026-09-17', 'VM Auditorium', 'Participating in a national hackathon as a finalist.')
       returning id`,
      [studentId, achievementId, ids.hackathon],
    )

  it('requires a submitted achievement of the same student', async () => {
    const [d] = await as(ids.carol, () =>
      rows(
        `insert into achievements (student_id, category_id, event_name, start_date)
         values ($1, $2, 'Robotics Meet', '2026-04-01') returning id`,
        [ids.carol, ids.hackathon],
      ),
    )
    // draft achievement → not allowed
    await expectDenied(as(ids.carol, () => draftOd(ids.carol, d.id as string)))
    // someone else's achievement → composite FK / RLS rejects
    await expectDenied(as(ids.bob, () => draftOd(ids.bob, ids.ach1)))
  })

  it('creates an OD, notifies both sides, and keeps it private', async () => {
    const [od] = await as(ids.alice, () => draftOd(ids.alice, ids.ach1))
    ids.od1 = od.id as string
    expect((await as(ids.alice, () => rows(`select type from notifications`))).map((n) => n.type)).toContain('od_submitted')
    expect((await as(ids.fac_cse, () => rows(`select link from notifications`))).some((n) => String(n.link).includes(ids.od1))).toBe(true)
    expect(await as(ids.bob, () => rows(`select id from od_requests`))).toHaveLength(0)
    expect(await as(ids.fac_ece, () => rows(`select id from od_details`))).toHaveLength(0)
    expect(await as(ids.fac_cse, () => rows(`select id from od_details`))).toHaveLength(1)
    // one OD per achievement
    await expectDenied(as(ids.alice, () => draftOd(ids.alice, ids.ach1)))
  })

  it('rejects approve/reject by non-faculty and demands comments where needed', async () => {
    await expectDenied(as(ids.alice, () => rows(`select public.review_od_request($1, 'approved')`, [ids.od1])))
    await expectDenied(as(ids.fac_ece, () => rows(`select public.review_od_request($1, 'approved')`, [ids.od1])))
    await expectDenied(as(ids.fac_cse, () => rows(`select public.review_od_request($1, 'rejected')`, [ids.od1])))
    await expectDenied(as(ids.fac_cse, () => rows(`select public.review_od_request($1, 'pending')`, [ids.od1])))
    // students can not edit a pending OD at all
    await as(ids.alice, () => rows(`update od_requests set status = 'approved' where id = $1`, [ids.od1]))
    expect((await rows(`select status from od_requests where id = $1`, [ids.od1]))[0].status).toBe('pending')
  })

  it('walks through more-info → resubmit → approve', async () => {
    await as(ids.fac_cse, () => rows(`select public.review_od_request($1, 'more_info', 'Please attach the invitation letter')`, [ids.od1]))
    expect((await as(ids.alice, () => rows(`select type from notifications`))).map((n) => n.type)).toContain('od_more_info')

    await as(ids.alice, () => rows(`update od_requests set venue = 'VM Auditorium, Chennai', status = 'pending' where id = $1`, [ids.od1]))
    expect((await rows(`select status from od_requests where id = $1`, [ids.od1]))[0].status).toBe('pending')

    await as(ids.fac_cse, () => rows(`select public.review_od_request($1, 'approved')`, [ids.od1]))
    expect((await rows(`select status from od_requests where id = $1`, [ids.od1]))[0].status).toBe('approved')
    expect((await as(ids.alice, () => rows(`select type from notifications`))).map((n) => n.type)).toContain('od_approved')
    await expectDenied(as(ids.fac_cse, () => rows(`select public.review_od_request($1, 'rejected', 'changed my mind')`, [ids.od1])))
  })

  it('stops the linked achievement being deleted while an OD exists', async () => {
    await expectDenied(rows(`delete from achievements where id = $1`, [ids.ach1]))
  })
})

describe('storage policies', () => {
  const putObject = (userId: string, name: string) =>
    as(userId, () => rows(`insert into storage.objects (bucket_id, name, owner) values ('certificates', $1, $2)`, [name, userId]))

  it('limits uploads to the student’s own folder', async () => {
    await putObject(ids.alice, `${ids.alice}/new.pdf`)
    await expectDenied(putObject(ids.alice, `${ids.bob}/hack.pdf`))
    await expectDenied(putObject(ids.fac_cse, `${ids.fac_cse}/not-a-student.pdf`))
  })

  it('locks files backing submitted records, but not drafts', async () => {
    await rows(`insert into storage.objects (bucket_id, name) values ('certificates', $1)`, [`${ids.alice}/a.pdf`])
    await as(ids.alice, () => rows(`delete from storage.objects where name = $1`, [`${ids.alice}/a.pdf`]))
    expect(await rows(`select 1 from storage.objects where name = $1`, [`${ids.alice}/a.pdf`])).toHaveLength(1)

    await as(ids.alice, () => rows(`delete from storage.objects where name = $1`, [`${ids.alice}/new.pdf`]))
    expect(await rows(`select 1 from storage.objects where name = $1`, [`${ids.alice}/new.pdf`])).toHaveLength(0)
  })

  it('lets only same-department faculty (and admin) read a submitted certificate', async () => {
    const read = (userId: string) =>
      as(userId, () => rows(`select name from storage.objects where bucket_id = 'certificates' and name = $1`, [`${ids.alice}/a.pdf`]))
    expect(await read(ids.alice)).toHaveLength(1)
    expect(await read(ids.fac_cse)).toHaveLength(1)
    expect(await read(ids.admin)).toHaveLength(1)
    expect(await read(ids.fac_ece)).toHaveLength(0)
    expect(await read(ids.bob)).toHaveLength(0)
  })
})

describe('reporting views', () => {
  it('scopes student summaries by role and department', async () => {
    const mine = await as(ids.alice, () => rows(`select id from student_summaries`))
    expect(mine.map((r) => r.id)).toEqual([ids.alice])

    const fac = await as(ids.fac_cse, () => rows(`select id from student_summaries`))
    expect(fac.map((r) => r.id)).toContain(ids.alice)
    expect(fac.map((r) => r.id)).not.toContain(ids.carol)

    const ece = await as(ids.fac_ece, () => rows(`select id from student_summaries`))
    expect(ece.map((r) => r.id)).toEqual([ids.carol])

    const all = await as(ids.admin, () => rows(`select id from student_summaries`))
    expect(all.length).toBeGreaterThanOrEqual(4)
  })

  it('counts submitted work only (never drafts) in the summary', async () => {
    const [a] = await as(ids.fac_cse, () =>
      rows(`select total_achievements::int as total, verified_achievements::int as verified, total_ods::int as ods, approved_ods::int as approved
            from student_summaries where id = $1`, [ids.alice]),
    )
    expect(a.verified).toBe(1)
    expect(a.ods).toBe(1)
    expect(a.approved).toBe(1)
    expect(a.total).toBeGreaterThanOrEqual(2)
  })

  it('gives anonymous visitors none of the private tables or views', async () => {
    for (const rel of ['achievements', 'achievement_details', 'od_requests', 'od_details', 'student_summaries', 'notifications', 'certificates']) {
      await expectDenied(as(null, () => rows(`select * from ${rel}`)))
    }
    // …but the public QR lookup and the department list still work
    expect((await as(null, () => rows(`select id from departments`))).length).toBeGreaterThan(0)
  })

  it('lets a student see only their own OD rows through the view', async () => {
    expect((await as(ids.alice, () => rows(`select id from od_details`))).length).toBe(1)
    expect(await as(ids.bob, () => rows(`select id from od_details`))).toHaveLength(0)
  })
})

describe('admin-only data', () => {
  it('restricts settings, audit logs and reference-data writes', async () => {
    expect(await as(ids.alice, () => rows(`select * from app_settings`))).toHaveLength(0)
    expect(await as(ids.fac_cse, () => rows(`select * from audit_logs`))).toHaveLength(0)
    expect((await as(ids.admin, () => rows(`select * from audit_logs`))).length).toBeGreaterThan(0)
    await expectDenied(as(ids.alice, () => rows(`insert into departments (code, name) values ('HAX', 'Hackers')`)))
    await as(ids.admin, () => rows(`insert into departments (code, name) values ('MBA', 'Management Studies')`))
    await as(ids.admin, () => rows(`update event_categories set is_active = false where slug = 'other'`))
    const cats = await as(ids.alice, () => rows(`select slug from event_categories`))
    expect(cats.map((c) => c.slug)).not.toContain('other')
  })

  it('reports scoped dashboard stats', async () => {
    const [fac] = await as(ids.fac_cse, () => rows(`select public.review_stats() as s`))
    const [adm] = await as(ids.admin, () => rows(`select public.review_stats() as s`))
    const f = fac.s as Record<string, number>
    const a = adm.s as Record<string, number>
    const [{ n: cseStudents }] = await rows(
      `select count(*)::int as n from profiles where role = 'student' and department_id = $1`,
      [ids.cse],
    ) as { n: number }[]
    expect(f.total_students).toBe(cseStudents) // own department only — Carol (ECE) is excluded
    expect(a.total_students).toBeGreaterThan(cseStudents)
    expect(a.verified_total).toBe(1)
  })

  it('only allows users to flip their own notifications to read', async () => {
    await as(ids.alice, () => rows(`update notifications set is_read = true`))
    await expectDenied(as(ids.alice, () => rows(`update notifications set title = 'x'`)))
    expect(await as(ids.alice, () => rows(`select id from notifications where is_read = false`))).toHaveLength(0)
  })
})
