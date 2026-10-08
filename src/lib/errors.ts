/**
 * Turns Supabase / Postgres / network failures into messages a student can act on.
 * Raw errors are still logged to the console for debugging.
 */

export class AppError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

interface ErrorLike {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
  status?: number
  statusCode?: string | number
  name?: string
}

function asErrorLike(err: unknown): ErrorLike {
  if (typeof err === 'string') return { message: err }
  if (err && typeof err === 'object') return err as ErrorLike
  return {}
}

export function isNetworkError(err: unknown): boolean {
  const { message = '', name = '', status } = asErrorLike(err)
  return (
    !navigator.onLine ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message) ||
    // supabase-js reports a lost connection as AuthRetryableFetchError with status 0. The *same* class is used for
    // 5xx answers (e.g. 500 "Error sending confirmation email" when SMTP is broken): those reached the server,
    // so they must not be shown as "check your internet connection".
    (name === 'AuthRetryableFetchError' && !status)
  )
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  profiles_register_number_key: 'This register number is already registered.',
  profiles_faculty_id_key: 'This faculty ID is already in use.',
  od_requests_one_per_achievement: 'An OD request already exists for this achievement.',
  certificates_one_per_achievement: 'This achievement already has a certificate.',
  departments_code_key: 'A department with this code already exists.',
  departments_name_key: 'A department with this name already exists.',
  event_categories_name_key: 'A category with this name already exists.',
  event_categories_slug_key: 'A category with this name already exists.',
}

export function toUserMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof AppError) return err.message

  const e = asErrorLike(err)
  const message = e.message ?? ''
  const detail = `${message} ${e.details ?? ''}`

  if (isNetworkError(err)) {
    return "We can't reach the server. Check your internet connection and try again."
  }

  // --- Supabase Auth -------------------------------------------------------
  if (/invalid login credentials/i.test(message)) return 'Incorrect email or password.'
  if (/user already registered|already been registered|email_exists|user_already_exists/i.test(message)) {
    return 'That username is already taken. Please choose another.'
  }
  if (/password should be at least|weak password/i.test(message)) {
    return 'Choose a stronger password (at least 8 characters).'
  }
  const e2 = e as ErrorLike & { error_code?: string }
  if (e.status === 429 || /rate limit|over_request_rate_limit|over_email_send_rate_limit/i.test(`${e.code ?? ''} ${e2.error_code ?? ''} ${message}`)) {
    return 'Too many attempts. Please wait a minute and try again.'
  }
  // Only reachable by staff password-reset e-mails (students never receive e-mail): the mail server refused the message.
  if (/error sending (confirmation|recovery|magic link|invite|email)|smtp|unable to send|failed to send|email address not authorized|email_address_not_authorized/i.test(message)) {
    return "We couldn't send that email. The email service isn't set up for this project yet — please tell your administrator."
  }
  if (/email address .* is invalid|unable to validate email|invalid format|email_address_invalid/i.test(message)) {
    return "That email address doesn't look valid. Check it for typos."
  }
  if (/signups? not allowed|signup_disabled|email_provider_disabled/i.test(message)) {
    return 'New registrations are currently turned off. Please contact your administrator.'
  }
  if (/otp_expired|token has expired|link is invalid or has expired|invalid or has expired/i.test(message)) {
    return 'This link has expired or was already used. Please request a new one.'
  }
  if (/database error saving new user/i.test(message)) {
    return "We couldn't create your account. That username or register number may already be taken — please check them and try again."
  }
  if (/jwt expired|invalid jwt|refresh token/i.test(message) || e.status === 401) {
    return 'Your session has expired. Please sign in again.'
  }
  if (/auth session missing/i.test(message)) return 'Please sign in to continue.'

  // --- Storage -------------------------------------------------------------
  if (/exceeded the maximum allowed size|payload too large/i.test(message) || e.status === 413) {
    return 'That file is too large. The maximum size is 10 MB.'
  }
  if (/mime type .* is not supported|invalid mime/i.test(message)) {
    return 'That file type is not supported. Upload a PDF, JPG or PNG.'
  }
  if (/the resource already exists|duplicate/i.test(message) && e.statusCode === '409') {
    return 'A file with this name already exists. Please try again.'
  }
  if (/bucket not found/i.test(message)) {
    return 'File storage is not set up yet. Ask an administrator to run the database migrations.'
  }

  // --- Postgres / PostgREST ------------------------------------------------
  switch (e.code) {
    case '23505': {
      for (const [constraint, text] of Object.entries(CONSTRAINT_MESSAGES)) {
        if (detail.includes(constraint)) return text
      }
      return 'That record already exists.'
    }
    case '23503':
      return "This item is linked to other records (for example an OD request), so it can't be removed."
    case '23514':
    case '22P02':
    case '22007':
    case '22001':
      return 'Some of the values you entered are not valid. Please review the form.'
    case '23502':
      return 'A required field is missing. Please complete the form.'
    case '42501':
      return message && !/row-level security/i.test(message)
        ? message
        : "You don't have permission to do that."
    case 'PGRST116':
    case 'P0002':
      return 'That record was not found, or you no longer have access to it.'
    case 'P0001':
      // raised on purpose by our own functions/triggers, already written for end users
      return message || fallback
    case 'PGRST301':
      return 'Your session has expired. Please sign in again.'
    case '42P01':
    case 'PGRST205':
      return 'The database has not been set up yet. Ask an administrator to run the migrations.'
    case 'FunctionsHttpError':
    case 'FunctionsFetchError':
      return 'That admin function is not available. Make sure the edge function is deployed.'
  }

  // The server answered, but with a failure we have no specific explanation for.
  if ((e.status ?? 0) >= 500) return 'Our server had a problem handling that. Please try again in a moment.'

  if (/row-level security/i.test(message)) return "You don't have permission to do that."
  if (/relation .* does not exist/i.test(message)) {
    return 'The database has not been set up yet. Ask an administrator to run the migrations.'
  }

  return fallback
}

/** Log the raw error for developers, return the friendly text for users. */
export function reportError(err: unknown, context: string, fallback?: string): string {
  console.error(`[CertiPass] ${context}`, err)
  return toUserMessage(err, fallback)
}
