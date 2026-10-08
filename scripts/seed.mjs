#!/usr/bin/env node
/**
 * CertiPass seed / bootstrap script. Runs on YOUR machine with the service-role key — never in the browser.
 *
 *   npm run create-admin -- --username admin --password 'Str0ngPass1' --name 'Your Name'
 *       Creates the first administrator (public sign-up can never create one). Everyone signs in with a username.
 *       Add --reset to set a new password for an administrator that already exists (forgotten password).
 *
 *   npm run seed
 *       Creates realistic sample data for development: faculty, students, achievements in every
 *       status (with generated certificate PDFs), OD requests, verification records and notifications.
 *
 * Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the environment or from .env.local.
 * Safe to re-run: existing accounts and sample rows are skipped.
 */
import { readFileSync, existsSync } from 'node:fs'
import { randomInt, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { makePdf } from './lib/makePdf.mjs'

// ---------------------------------------------------------------------------------------- config
function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}
loadEnvFile('.env.local')
loadEnvFile('.env')

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Put them in .env.local — the service-role key must NOT have a VITE_ prefix.')
  process.exit(1)
}

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const fail = (context, error) => {
  console.error(`✗ ${context}: ${error.message ?? error}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------------------- helpers
const SAMPLE_PASSWORD = process.env.SEED_PASSWORD || 'CertiPass#2026'
const INTERNAL_EMAIL_DOMAIN = 'certipass.invalid' // must match src/lib/identity.ts
// must match src/lib/identity.ts (a test keeps the two in step)
const USERNAME_PATTERN = /^(?=.{3,100}$)(?!.*\.\.)[a-z0-9]([a-z0-9._-]*[a-z0-9])?(@[a-z0-9]([a-z0-9._-]*[a-z0-9])?)?$/
/** Everyone signs in with a username; the Supabase Auth identity is derived from it (never shown anywhere). */
const authEmailFor = (username) => `${username.replace('@', '+')}@${INTERNAL_EMAIL_DOMAIN}`

async function findUserByEmail(email) {
  // listUsers is paginated; sample sets are small, so scan a few pages.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) fail('listing users', error)
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

async function ensureUser({ username, password, role, meta }) {
  const email = authEmailFor(username)
  const existing = await findUserByEmail(email)
  if (existing) return { id: existing.id, created: false }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { ...meta, username },
    app_metadata: { role, provisioned: 'true' },
  })
  if (error) fail(`creating ${role} "${username}" (has migration 20260101000007_role_logins.sql been run?)`, error)
  return { id: data.user.id, created: true }
}

// ---------------------------------------------------------------------------------------- admin only
async function createAdmin() {
  const username = (option('username') || process.env.ADMIN_USERNAME || '').trim().toLowerCase()
  const password = option('password') || process.env.ADMIN_PASSWORD
  const name = option('name') || process.env.ADMIN_NAME || 'Administrator'
  if (!username || !password) {
    console.error('Usage: npm run create-admin -- --username admin --password "Str0ngPass1" --name "Your Name"')
    process.exit(1)
  }
  if (!USERNAME_PATTERN.test(username)) {
    console.error('The username must be 3-100 characters: letters, numbers, dots, dashes, underscores and at most one @.')
    process.exit(1)
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    console.error('The password needs 8+ characters with a letter and a number.')
    process.exit(1)
  }
  const { id, created } = await ensureUser({ username, password, role: 'admin', meta: { full_name: name } })
  if (created) {
    console.log(`✓ Administrator created — sign in at /login/admin with username "${username}"`)
  } else if (flag('reset')) {
    const { error } = await db.auth.admin.updateUserById(id, { password })
    if (error) fail('resetting the password', error)
    console.log(`✓ New password set for administrator "${username}"`)
  } else {
    console.log(`• "${username}" already exists (password unchanged — add --reset to set a new one)`)
  }
  return id
}

// ---------------------------------------------------------------------------------------- sample data
const FACULTY = [
  { dept: 'CSE', name: 'Dr. Meenakshi Sundaram', id: 'F1001', title: 'Professor & Head' },
  { dept: 'IT', name: 'Dr. Ravi Chandran', id: 'F2001', title: 'Associate Professor' },
  { dept: 'ECE', name: 'Prof. Lakshmi Narayanan', id: 'F3001', title: 'Assistant Professor' },
]

const STUDENTS = [
  { dept: 'CSE', username: 'dinesh2024', name: 'Dinesh Kumar', reg: '2021CSE001', year: 3, section: 'A' },
  { dept: 'CSE', username: 'priya.sharma', name: 'Priya Sharma', reg: '2021CSE014', year: 3, section: 'A' },
  { dept: 'CSE', username: 'arjun2022', name: 'Arjun Venkatesh', reg: '2022CSE027', year: 2, section: 'B' },
  { dept: 'CSE', username: 'fathima.r', name: 'Fathima Rahman', reg: '2020CSE009', year: 4, section: 'B' },
  { dept: 'IT', username: 'karthik.s', name: 'Karthik Subramanian', reg: '2021IT006', year: 3, section: 'A' },
  { dept: 'IT', username: 'sneha.iyer', name: 'Sneha Iyer', reg: '2022IT018', year: 2, section: 'A' },
  { dept: 'ECE', username: 'imran2021', name: 'Mohammed Imran', reg: '2021ECE011', year: 3, section: 'C' },
  { dept: 'ECE', username: 'anjali.nair', name: 'Anjali Nair', reg: '2022ECE004', year: 2, section: 'A' },
]

// [studentIdx, category slug, event, organization, start, end, result, status, withOd]
const ACHIEVEMENTS = [
  [0, 'hackathon', 'VMEDITHON V3.0', 'XYZ Institute of Technology', '2026-09-17', null, 'Finalist', 'verified', 'approved'],
  [0, 'workshop', 'Cloud Computing with AWS', 'AWS Student Community', '2026-03-12', '2026-03-13', 'Participant', 'verified', null],
  [0, 'internship', 'Summer Research Internship', 'IIT Madras', '2026-05-05', '2026-06-30', 'Completed', 'verified', null],
  [0, 'competition', 'Inter-College Coding Contest', 'Anna University', '2026-08-02', null, 'Second Prize', 'pending', 'pending'],
  [1, 'hackathon', 'Smart India Hackathon 2026', 'Ministry of Education', '2026-12-09', '2026-12-11', 'Winner', 'verified', 'approved'],
  [1, 'paper-presentation', 'ICAIML Paper Presentation', 'SRM Institute', '2026-04-21', null, 'Best Paper', 'verified', null],
  [1, 'conference', 'IEEE Tech Summit', 'IEEE Madras Section', '2026-02-14', null, 'Attendee', 'changes_requested', null],
  [2, 'workshop', 'Full-Stack React Bootcamp', 'GDG Chennai', '2026-01-18', null, 'Participant', 'pending', 'more_info'],
  [2, 'club-activity', 'Open Source Club Contribution Drive', 'Linux Users Group', '2026-07-10', null, 'Volunteer', 'rejected', null],
  [3, 'certification', 'NPTEL Cloud Computing', 'NPTEL – IIT Kharagpur', '2026-04-30', null, 'Elite + Silver', 'verified', null],
  [3, 'internship', 'Software Engineering Intern', 'Zoho Corporation', '2026-06-03', '2026-08-30', 'Completed', 'pending', null],
  [4, 'symposium', 'TechnoVista 2026', 'KCG College of Technology', '2026-03-05', null, 'Runner-up', 'verified', 'rejected'],
  [4, 'hackathon', 'CodeStorm 24h', 'Hackerearth', '2026-10-01', '2026-10-02', 'Top 10', 'pending', null],
  [5, 'workshop', 'Introduction to Cybersecurity', 'CyberSec Club', '2026-02-27', null, 'Participant', 'verified', null],
  [6, 'competition', 'Robotics Line-Follower Challenge', 'MIT Chennai', '2026-04-11', null, 'First Prize', 'verified', 'approved'],
  [6, 'paper-presentation', 'Paper on Edge AI for IoT', 'VIT Chennai', '2026-09-08', null, 'Participant', 'pending', null],
  [7, 'workshop', 'PCB Design Fundamentals', 'IETE Student Forum', '2026-05-22', null, 'Participant', 'changes_requested', null],
]

const OD_REASONS = {
  approved: ['Representing the college in the national finals; need to travel a day before.', 'Selected as a finalist team member; attendance required on-site.'],
  pending: ['Participating in the inter-college contest; the event clashes with two class hours.'],
  more_info: ['Attending the two-day bootcamp; will miss lab sessions on both days.'],
  rejected: ['Attending the symposium with my team for the technical events.'],
}
const OD_COMMENTS = {
  approved: 'Approved. Please share your certificate on return.',
  more_info: 'Please attach the registration confirmation from the organisers.',
  rejected: 'Dates overlap with internal assessments; OD cannot be granted.',
}

const REVIEW_COMMENTS = {
  verified: 'Certificate checked against the event brochure.',
  rejected: 'Certificate is for a different student batch. Please upload the correct one.',
  changes_requested: 'The organiser name is missing — please add it and resubmit.',
}

function verificationCode(taken) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (;;) {
    let tail = ''
    for (let i = 0; i < 5; i++) tail += alphabet[randomInt(alphabet.length)]
    const code = `CP-${new Date().getFullYear()}-${tail}`
    if (!taken.has(code)) {
      taken.add(code)
      return code
    }
  }
}

async function seedSample() {
  const adminUsername = option('username') || process.env.ADMIN_USERNAME
  if (adminUsername && (option('password') || process.env.ADMIN_PASSWORD)) await createAdmin()

  const { data: departments, error: dErr } = await db.from('departments').select('id, code')
  if (dErr) fail('reading departments — did you run the migrations?', dErr)
  const deptId = Object.fromEntries(departments.map((d) => [d.code, d.id]))
  const { data: categories, error: cErr } = await db.from('event_categories').select('id, slug')
  if (cErr) fail('reading event categories', cErr)
  const categoryId = Object.fromEntries(categories.map((c) => [c.slug, c.id]))

  console.log('Creating faculty…')
  const faculty = {}
  for (const f of FACULTY) {
    const username = `${f.dept.toLowerCase()}.faculty`
    const { id, created } = await ensureUser({
      username,
      password: SAMPLE_PASSWORD,
      role: 'faculty',
      meta: { full_name: f.name, faculty_id: f.id, designation: f.title, department_id: deptId[f.dept] },
    })
    faculty[f.dept] = id
    console.log(`  ${created ? '✓' : '•'} ${username}`)
  }

  console.log('Creating students…')
  const students = []
  for (const s of STUDENTS) {
    // Students sign in with a username; the Supabase Auth identity is derived from it (see src/lib/identity.ts).
    const username = s.username
    const { id, created } = await ensureUser({
      username,
      password: SAMPLE_PASSWORD,
      role: 'student',
      meta: { full_name: s.name, register_number: s.reg, department_id: deptId[s.dept], year: s.year, section: s.section },
    })
    students.push({ ...s, id })
    console.log(`  ${created ? '✓' : '•'} ${username}`)
  }

  const takenCodes = new Set()
  let made = 0
  let skipped = 0
  console.log('Creating achievements…')
  for (const [idx, slug, event, org, start, end, result, status, odStatus] of ACHIEVEMENTS) {
    const student = students[idx]
    const { data: dupe } = await db
      .from('achievements')
      .select('id')
      .eq('student_id', student.id)
      .eq('event_name', event)
      .eq('start_date', start)
      .maybeSingle()
    if (dupe) {
      skipped++
      continue
    }

    // 1. draft
    const { data: ach, error: aErr } = await db
      .from('achievements')
      .insert({
        student_id: student.id, category_id: categoryId[slug], event_name: event, organization: org,
        start_date: start, end_date: end, result, status: 'draft',
        description: `${result} at ${event}, organised by ${org}.`,
      })
      .select('id')
      .single()
    if (aErr) fail(`inserting "${event}"`, aErr)

    // 2. certificate (a real PDF with a text layer, uploaded to private storage)
    const path = `${student.id}/${randomUUID()}-certificate.pdf`
    const pdf = makePdf([
      'CERTIFICATE OF ACHIEVEMENT',
      org.toUpperCase(),
      `This is to certify that ${student.name.toUpperCase()} of ${student.dept} Department`,
      `has participated in the ${event} organized by ${org}`,
      `held on ${new Date(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} and secured ${result}.`,
      '',
      'Organizing Secretary                       Convenor',
    ])
    const { error: uErr } = await db.storage.from('certificates').upload(path, pdf, { contentType: 'application/pdf', upsert: false })
    if (uErr) fail(`uploading certificate for "${event}"`, uErr)
    const { error: cErr2 } = await db.from('certificates').insert({
      achievement_id: ach.id, student_id: student.id, storage_path: path,
      file_name: `${event.replace(/[^\w]+/g, '-')}.pdf`, mime_type: 'application/pdf', size_bytes: pdf.length,
      ocr_data: {
        provider: 'seed',
        extracted: { studentName: student.name, eventName: event, organization: org, startDate: start, result },
        name_check: 'match',
      },
    })
    if (cErr2) fail(`attaching certificate for "${event}"`, cErr2)

    // 3. walk it through the workflow so notifications and audit rows are created
    if (status !== 'draft') {
      const { error } = await db.from('achievements').update({ status: 'pending' }).eq('id', ach.id)
      if (error) fail(`submitting "${event}"`, error)
    }
    if (['verified', 'rejected', 'changes_requested'].includes(status)) {
      const { error } = await db
        .from('achievements')
        .update({
          status, reviewed_by: faculty[student.dept], reviewed_at: new Date().toISOString(),
          review_comment: REVIEW_COMMENTS[status],
        })
        .eq('id', ach.id)
      if (error) fail(`reviewing "${event}"`, error)
    }
    if (status === 'verified') {
      const { error } = await db.from('verification_records').insert({
        achievement_id: ach.id, verification_code: verificationCode(takenCodes), verified_by: faculty[student.dept],
      })
      if (error) fail(`issuing verification for "${event}"`, error)
    }

    // 4. OD request
    if (odStatus) {
      const { data: od, error: oErr } = await db
        .from('od_requests')
        .insert({
          student_id: student.id, achievement_id: ach.id, category_id: categoryId[slug], event_name: event,
          organization: org, event_date: start, event_end_date: end, start_time: '09:00', end_time: '17:00',
          venue: `${org} campus`, reason: (OD_REASONS[odStatus] ?? OD_REASONS.pending)[0], status: 'pending',
        })
        .select('id')
        .single()
      if (oErr) fail(`creating OD for "${event}"`, oErr)
      if (odStatus !== 'pending') {
        const { error } = await db
          .from('od_requests')
          .update({
            status: odStatus, reviewed_by: faculty[student.dept], reviewed_at: new Date().toISOString(),
            review_comment: OD_COMMENTS[odStatus] ?? null,
          })
          .eq('id', od.id)
        if (error) fail(`deciding OD for "${event}"`, error)
      }
    }
    made++
  }
  console.log(`✓ ${made} achievements created${skipped ? `, ${skipped} already existed` : ''}.`)

  console.log('\nSample sign-ins (development only):')
  console.log(`  password for every sample account: ${SAMPLE_PASSWORD}`)
  console.log(`  student : username ${STUDENTS[0].username}`)
  console.log('  faculty : username cse.faculty')
  if (adminUsername) console.log(`  admin   : username ${adminUsername}`)
}

// ---------------------------------------------------------------------------------------- run
if (flag('admin-only')) {
  await createAdmin()
} else {
  await seedSample()
}
