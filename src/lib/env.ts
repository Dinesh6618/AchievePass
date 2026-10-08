const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

/**
 * The public address of this app. Used inside QR codes. Set VITE_APP_URL in production if the app is served from an address other than the one people open;
 * otherwise the current origin is used, so nothing is hard-coded to localhost.
 * (VITE_PUBLIC_APP_URL is still read for backwards compatibility.)
 */
const appUrl = (
  (import.meta.env.VITE_APP_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim() ||
  window.location.origin
).replace(/\/+$/, '')

export const env = {
  supabaseUrl: url ?? '',
  supabaseAnonKey: anonKey ?? '',
  appUrl,
  ocrProvider: ((import.meta.env.VITE_OCR_PROVIDER as string | undefined) ?? 'tesseract').trim(),
  ocrApiUrl: (import.meta.env.VITE_OCR_API_URL as string | undefined)?.trim() ?? '',
}

export const isSupabaseConfigured = Boolean(url && anonKey && /^https?:\/\//.test(url))

if (import.meta.env.PROD && /^https?:\/\/(localhost|127\.0\.0\.1)/.test(appUrl)) {
  console.warn('[CertiPass] This production build uses a localhost address for shared links. Set VITE_APP_URL to your public URL.')
}
