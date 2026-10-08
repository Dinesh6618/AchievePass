import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { normalizeUsername, usernameToAuthEmail } from '@/lib/identity'
import type { PublicSettings } from '@/types'
import { unwrap } from './db'

export interface StudentSignUpInput {
  username: string
  password: string
  fullName: string
  registerNumber: string
  departmentId: string
  year: number
  section: string
}

/** Faculty and admins sign in with their real e-mail address. */
export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
  return data
}

/**
 * Students sign in with a username. Supabase Auth only understands e-mail-shaped identities, so the username is
 * mapped to an internal address (see lib/identity.ts) that the student never sees or types.
 */
export async function signInWithUsername(username: string, password: string) {
  try {
    return await signInWithPassword(usernameToAuthEmail(username), password)
  } catch (err) {
    if (/invalid login credentials/i.test((err as { message?: string })?.message ?? '')) {
      throw new AppError('Incorrect username or password.', 'invalid_credentials')
    }
    throw err
  }
}

const REGISTRATION_NOT_READY =
  'Registration is not switched on for this project yet. An administrator needs to turn OFF “Confirm email” in Supabase (Authentication → Providers → Email) — CertiPass does not use email verification.'

/**
 * Self-service student registration: username + password + student details. The database trigger creates the
 * profile (role is always "student" for public sign-ups) and the new account is signed in immediately.
 */
export async function signUpStudent(input: StudentSignUpInput) {
  const username = normalizeUsername(input.username)
  const { data, error } = await supabase.auth.signUp({
    email: usernameToAuthEmail(username),
    password: input.password,
    options: {
      data: {
        username,
        full_name: input.fullName.trim(),
        register_number: input.registerNumber.trim(),
        department_id: input.departmentId,
        year: input.year,
        section: input.section.trim(),
      },
    },
  })

  if (error) {
    // With "Confirm email" still on, Supabase tries to mail the internal address and its mailer refuses.
    if (/email address not authorized|error sending|smtp/i.test(error.message)) {
      throw new AppError(REGISTRATION_NOT_READY, 'confirm_email_enabled')
    }
    throw error
  }
  // No session means Supabase is still waiting for an e-mail confirmation that can never happen for these accounts.
  if (!data.session) throw new AppError(REGISTRATION_NOT_READY, 'confirm_email_enabled')
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/** Faculty / admin password reset by e-mail. Students have no e-mail address on file (recovery is not available yet). */
export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${env.appUrl}/reset-password`,
  })
  if (error) throw error
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

export async function fetchPublicSettings(): Promise<PublicSettings> {
  return unwrap(await supabase.rpc('public_settings')) ?? {}
}

export async function isRegisterNumberAvailable(registerNumber: string): Promise<boolean> {
  return unwrap(await supabase.rpc('register_number_available', { p_register_number: registerNumber })) as boolean
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  return unwrap(await supabase.rpc('username_available', { p_username: username })) as boolean
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.'
  return null
}
