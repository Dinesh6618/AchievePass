import { createClient } from '@supabase/supabase-js'
import { env } from './env'

// A placeholder URL keeps module evaluation from throwing when the project is not
// configured yet; <App> renders a setup screen instead of using this client.
export const supabase = createClient(
  env.supabaseUrl || 'http://localhost:54321',
  env.supabaseAnonKey || 'public-anon-key-not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Needed for the password-reset link sent to faculty / admins (it returns with a session in the URL).
      detectSessionInUrl: true,
    },
  },
)
