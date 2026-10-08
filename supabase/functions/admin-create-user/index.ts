// Account management for administrators: create student / faculty accounts, set a new password, delete a faculty account.
//
// Why an edge function: creating an auth user with a chosen role (and changing someone else's password) needs the
// service-role key, which must never be shipped to the browser. This function:
//   1. verifies the caller's JWT,
//   2. checks in the database that the caller is an *active admin*,
//   3. does the work with the role in `app_metadata` (clients can never write that field), which the
//      `handle_new_user` trigger reads to build the profile.
//
// Administrator accounts can NOT be created, changed or deleted here — the first admin comes from
// `npm run create-admin` on a trusted machine, so the role cannot be reached through the app.
//
// Deploy:  supabase functions deploy admin-create-user
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // access is controlled by the JWT check below, not by origin
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Everyone signs in with a username; their Supabase Auth identity is <username>@certipass.invalid (never shown).
// Keep these three in sync with src/lib/identity.ts and the sign-up trigger (a test enforces it).
const INTERNAL_EMAIL_DOMAIN = 'certipass.invalid'
const USERNAME_PATTERN = /^(?=.{3,100}$)(?!.*\.\.)[a-z0-9]([a-z0-9._-]*[a-z0-9])?(@[a-z0-9]([a-z0-9._-]*[a-z0-9])?)?$/
const RESERVED = ['admin', 'administrator', 'root', 'faculty', 'staff', 'support', 'certipass', 'system', 'moderator', 'help']

type Action = 'create' | 'set-password' | 'delete'

interface Body {
  action?: Action
  role?: string
  /** set-password / delete */
  userId?: string
  username?: string
  password?: string
  fullName?: string
  departmentId?: string
  /** students */
  registerNumber?: string
  year?: number
  section?: string
  /** faculty */
  facultyId?: string
  designation?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function passwordProblem(password: string | undefined): string | null {
  if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'The password needs 8+ characters with a letter and a number.'
  }
  return null
}

function validateCreate(b: Body): string | null {
  // Only students and faculty. There is deliberately no way to create an administrator through the app.
  if (b.role !== 'student' && b.role !== 'faculty') return 'Choose a valid role.'
  const username = (b.username ?? '').trim().toLowerCase()
  if (!USERNAME_PATTERN.test(username)) return 'Choose a username of 3 to 100 characters: letters, numbers, dots, dashes, underscores and at most one @.'
  if (RESERVED.includes(username)) return 'That username is reserved. Please choose another.'
  const pw = passwordProblem(b.password)
  if (pw) return pw
  if (!b.fullName || b.fullName.trim().length < 2) return 'Enter the full name.'
  if (!b.departmentId || !UUID.test(b.departmentId)) return 'Choose a department.'
  if (b.role === 'student') {
    if (!b.registerNumber?.trim()) return 'Enter the register number.'
    if (!Number.isInteger(b.year) || (b.year as number) < 1 || (b.year as number) > 6) return 'Choose a valid year.'
    if (!b.section?.trim()) return 'Enter the section.'
  }
  if (b.role === 'faculty' && !b.facultyId?.trim()) return 'Enter the faculty ID.'
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'You need to be signed in.' }, 401)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) return json({ error: 'The function is not configured correctly.' }, 500)

  // 1. Who is calling?
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: caller, error: callerError } = await callerClient.auth.getUser()
  if (callerError || !caller.user) return json({ error: 'Your session has expired. Please sign in again.' }, 401)

  // 2. Are they an active admin? (looked up server-side — never trust a claim sent by the client)
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: me } = await admin.from('profiles').select('role, is_active').eq('id', caller.user.id).maybeSingle()
  if (!me || me.role !== 'admin' || !me.is_active) {
    return json({ error: 'Only administrators can manage accounts.' }, 403)
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return json({ error: 'The request was not valid JSON.' }, 400)
  }

  const action: Action = body.action ?? 'create'
  if (action === 'create') return createAccount(admin, body)
  if (action === 'set-password') return setPassword(admin, body)
  if (action === 'delete') return deleteAccount(admin, body)
  return json({ error: 'Unknown action.' }, 400)
})

type AdminClient = ReturnType<typeof createClient>

// ---------------------------------------------------------------------------------------------- create
async function createAccount(admin: AdminClient, body: Body) {
  const problem = validateCreate(body)
  if (problem) return json({ error: problem }, 422)

  const role = body.role as 'student' | 'faculty'
  const username = body.username!.trim().toLowerCase()
  const { data, error } = await admin.auth.admin.createUser({
    // an "@" inside an e-mail-style username is written "+" (usernames never contain "+")
    email: `${username.replace('@', '+')}@${INTERNAL_EMAIL_DOMAIN}`,
    password: body.password!,
    email_confirm: true, // no e-mail verification anywhere in CertiPass
    user_metadata: {
      username,
      full_name: body.fullName!.trim(),
      department_id: body.departmentId ?? null,
      register_number: body.registerNumber?.trim() ?? null,
      year: body.year ?? null,
      section: body.section?.trim() ?? null,
      faculty_id: body.facultyId?.trim() ?? null,
      designation: body.designation?.trim() ?? null,
    },
    // app_metadata can only be written with the service role; the signup trigger trusts it for the role.
    app_metadata: { role, provisioned: 'true' },
  })

  if (error) {
    const message = error.message ?? ''
    if (/already (been )?registered|already exists/i.test(message)) {
      return json({ error: 'That username is already taken.' }, 409)
    }
    if (/database error/i.test(message)) {
      return json({ error: 'The account could not be saved. The username, register number or faculty ID may already be in use.' }, 422)
    }
    console.error('createUser failed', error)
    return json({ error: 'The account could not be created. Please try again.' }, 500)
  }

  return json({ id: data.user.id }, 201)
}

// ---------------------------------------------------------------------------------------------- set-password
async function setPassword(admin: AdminClient, body: Body) {
  if (!body.userId || !UUID.test(body.userId)) return json({ error: 'Choose an account.' }, 422)
  const pw = passwordProblem(body.password)
  if (pw) return json({ error: pw }, 422)

  const { data: target } = await admin.from('profiles').select('role').eq('id', body.userId).maybeSingle()
  if (!target) return json({ error: 'That account no longer exists.' }, 404)
  if (target.role === 'admin') return json({ error: 'Administrator passwords can not be changed here.' }, 403)

  const { error } = await admin.auth.admin.updateUserById(body.userId, { password: body.password! })
  if (error) {
    console.error('updateUserById failed', error)
    return json({ error: 'The password could not be changed. Please try again.' }, 500)
  }
  return json({ ok: true })
}

// ---------------------------------------------------------------------------------------------- delete
async function deleteAccount(admin: AdminClient, body: Body) {
  if (!body.userId || !UUID.test(body.userId)) return json({ error: 'Choose an account.' }, 422)

  const { data: target } = await admin.from('profiles').select('role, full_name').eq('id', body.userId).maybeSingle()
  if (!target) return json({ error: 'That account no longer exists.' }, 404)
  // Only faculty accounts can be deleted here: administrators are protected, and a student's passport is a permanent record.
  if (target.role !== 'faculty') return json({ error: 'Only faculty accounts can be deleted. Disable other accounts instead.' }, 403)

  // Deleting would silently erase who verified what. A reviewer with history is disabled, not deleted.
  const counts = await Promise.all([
    admin.from('achievements').select('id', { count: 'exact', head: true }).eq('reviewed_by', body.userId),
    admin.from('od_requests').select('id', { count: 'exact', head: true }).eq('reviewed_by', body.userId),
    admin.from('verification_records').select('id', { count: 'exact', head: true }).eq('verified_by', body.userId),
  ])
  if (counts.some((c) => c.error)) return json({ error: 'Could not check this account\'s review history. Please try again.' }, 500)
  if (counts.some((c) => (c.count ?? 0) > 0)) {
    return json(
      { error: `${target.full_name} has reviewed certificates or OD requests, so deleting the account would erase that history. Disable the account instead.` },
      409,
    )
  }

  const { error } = await admin.auth.admin.deleteUser(body.userId)
  if (error) {
    console.error('deleteUser failed', error)
    return json({ error: 'The account could not be deleted. Please try again.' }, 500)
  }
  return json({ ok: true })
}
