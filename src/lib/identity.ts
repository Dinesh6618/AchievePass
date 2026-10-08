/**
 * Username sign-in for students.
 *
 * Supabase Auth identifies people by an e-mail-shaped address, so each student's login identity is DERIVED from
 * their username:  <username>@certipass.invalid  (an "@" inside the username is written as "+").  ".invalid" is a reserved top-level domain that can never
 * resolve, so nothing is ever delivered and no real person's address is involved. This address is internal:
 * it is not stored in the profile and is never shown anywhere in the app.
 *
 * Keep INTERNAL_EMAIL_DOMAIN and RESERVED_USERNAMES in sync with supabase/migrations/…_username_auth.sql and
 * the admin-create-user edge function (a test enforces it).
 */

export const INTERNAL_EMAIL_DOMAIN = 'certipass.invalid'

export const RESERVED_USERNAMES = [
  'admin', 'administrator', 'root', 'faculty', 'staff', 'support', 'certipass', 'system', 'moderator', 'help',
] as const

export const USERNAME_MIN = 3
/**
 * Generous on purpose (any real e-mail address fits), but not unlimited: the sign-in address built from the username
 * must stay under Supabase Auth's 255-character limit for an address (verified: it accepts up to 237 before the domain).
 */
export const USERNAME_MAX = 100

/**
 * 3–100 characters: letters, digits, dot, dash, underscore, and at most one "@" — so a college-style name such as
 * dinesh.g.2024.aids@rajalakshmi.edu.in works as a username (it is just a name; nothing is ever sent to it).
 * Must start and end with a letter or digit (on both sides of the "@"), and no two dots in a row.
 */
export const USERNAME_PATTERN = /^(?=.{3,100}$)(?!.*\.\.)[a-z0-9]([a-z0-9._-]*[a-z0-9])?(@[a-z0-9]([a-z0-9._-]*[a-z0-9])?)?$/

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase()
}

/** Returns a human-readable problem with the username, or null when it is acceptable. */
export function validateUsername(input: string): string | null {
  const u = normalizeUsername(input)
  if (!u) return 'Enter a username.'
  if (u.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`
  if (u.length > USERNAME_MAX) return `Use ${USERNAME_MAX} characters or fewer.`
  if (!/^[a-z0-9._@-]+$/.test(u)) return 'Use only letters, numbers, dots, dashes, underscores and one @ — no spaces.'
  if (u.split('@').length > 2) return 'Use only one @ in a username.'
  if (u.includes('..')) return 'Do not put two dots in a row.'
  if (!USERNAME_PATTERN.test(u)) return 'Start and end with a letter or number (before and after any @).'
  if ((RESERVED_USERNAMES as readonly string[]).includes(u)) return 'That username is reserved. Choose another.'
  return null
}

/**
 * The internal address Supabase Auth uses for this username. Never display it.
 * An "@" inside the username becomes "+" (usernames can never contain "+", so the mapping is one-to-one and the
 * result is always a single, valid <local>@certipass.invalid address).
 */
export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username).replace('@', '+')}@${INTERNAL_EMAIL_DOMAIN}`
}
