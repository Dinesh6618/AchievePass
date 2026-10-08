import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'
import type { PublicVerification } from '@/types'
import { unwrap } from './db'

/** The public QR landing URL for a verification ID. */
export function verificationUrl(code: string): string {
  return `${env.appUrl}/verify/${encodeURIComponent(code)}`
}

const CODE_PATTERN = /^[A-Z0-9]{2,6}-\d{4}-[A-Z0-9]{5}$/

/** Anonymous lookup — backed by a SECURITY DEFINER function that returns only public fields. */
export async function getPublicVerification(code: string): Promise<PublicVerification | null> {
  const clean = code.trim().toUpperCase()
  if (!CODE_PATTERN.test(clean)) return null // skip the round-trip for malformed input
  const data = unwrap(await supabase.rpc('get_public_verification', { p_code: clean }))
  return (data as PublicVerification | null) ?? null
}
