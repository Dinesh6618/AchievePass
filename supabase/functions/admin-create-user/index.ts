// Creates a student / faculty / admin account on behalf of a signed-in administrator.
//
// Why an edge function: creating an auth user with a chosen role needs the service-role key,
// which must never be shipped to the browser. This function:
//   1. verifies the caller's JWT,
//   2. checks in the database that the caller is an *active admin*,
//   3. creates the user with the role in `app_metadata` (clients can never write that field),
//      which the `handle_new_user` trigger reads to build the profile.
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

// Students sign in with a username; their Supabase Auth identity is <username>@certipass.invalid (never shown).
// Keep these three in sync with src/lib/identity.ts and the sign-up trigger (a test enforces it).
const INTERNAL_EMAIL_DOMAIN = 'certipass.invalid'
const USERNAME_PATTERN = /^(?=.{3,100}$)(?!.*\.\.)[a-z0-9]([a-z0-9._-]*[a-z0-9])?(@[a-z0-9]([a-z0-9._-]*[a-z0-9])?)?$/
const RESERVED = ['admin', 'administrator', 'root', 'faculty', 'staff', 'support', 'certipass', 'system', 'moderator', 'help']

interface Body {
  role?: string
  /** staff only */
  email?: string
  /** students only */
  username?: string
  password?: string
  fullName?: string
  departmentId?: string
  registerNumber?: string
  year?: number
  section?: string
  facultyId?: string
  designation?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(b: Body): string | null {
  if (!['student', 'faculty', 'admin'].includes(b.role ?? '')) return 'Choose a valid role.'
  if (b.role === 'student') {
    const username = (b.username ?? '').trim().toLowerCase()
    if (!USERNAME_PATTERN.test(username)) return 'Choose a username of 3 to 100 characters: letters, numbers, dots, dashes, underscores and at most one @.'
    if (RESERVED.includes(username)) return 'That username is reserved. Please choose another.'
  } else if (!b.email || !EMAIL.test(b.email.trim())) {
    return 'Enter a valid email address.'
  }
  if (!b.password || b.password.length < 8 || !/[A-Za-z]/.test(b.password) || !/\d/.test(b.password)) {
    return 'The password needs 8+ characters with a letter and a number.'
  }
  if (!b.fullName || b.fullName.trim().length < 2) return 'Enter the full name.'
  if (b.role !== 'admin' && (!b.departmentId || !UUID.test(b.departmentId))) return 'Choose a department.'
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
    return json({ error: 'Only administrators can create accounts.' }, 403)
  }

  // 3. Validate and create.
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return json({ error: 'The request was not valid JSON.' }, 400)
  }
  const problem = validate(body)
  if (problem) return json({ error: problem }, 422)

  const role = body.role as 'student' | 'faculty' | 'admin'
  const username = role === 'student' ? body.username!.trim().toLowerCase() : null
  const { data, error } = await admin.auth.admin.createUser({
    // an "@" inside an e-mail-style username is written "+" (usernames never contain "+")
    email: username ? `${username.replace('@', '+')}@${INTERNAL_EMAIL_DOMAIN}` : body.email!.trim().toLowerCase(),
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
      return json({ error: role === 'student' ? 'That username is already taken.' : 'An account with this email already exists.' }, 409)
    }
    if (/database error/i.test(message)) {
      return json(
        { error: 'The account could not be saved. The username, register number or faculty ID may already be in use.' },
        422,
      )
    }
    console.error('createUser failed', error)
    return json({ error: 'The account could not be created. Please try again.' }, 500)
  }

  return json({ id: data.user.id }, 201)
})
