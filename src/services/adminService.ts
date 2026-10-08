import { supabase } from '@/lib/supabase'
import type { AuditLog } from '@/types'
import { unwrap, type Page } from './db'

export async function listAuditLogs(opts: { page?: number; pageSize?: number } = {}): Promise<Page<AuditLog>> {
  const { page = 0, pageSize = 15 } = opts
  const { data, error, count } = await supabase
    .from('audit_logs')
    .select('*, actor:profiles(full_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (error) throw error
  return { rows: (data ?? []) as unknown as AuditLog[], total: count ?? 0 }
}

/** Plain-English line for an audit row, e.g. "Dr. Meena verified “VMEDITHON V3.0”". */
export function describeAudit(log: AuditLog): string {
  const who = log.actor?.full_name ?? 'System'
  const m = log.metadata as Record<string, string | undefined>
  const event = m.event ? `“${m.event}”` : 'a submission'

  switch (log.entity_type) {
    case 'achievements':
      if (log.action === 'insert') return `${who} created ${event}`
      if (log.action === 'delete') return `${who} deleted ${event}`
      if (m.to === 'pending') return `${who} submitted ${event} for verification`
      if (m.to === 'verified') return `${who} verified ${event}`
      if (m.to === 'rejected') return `${who} rejected ${event}`
      if (m.to === 'changes_requested') return `${who} asked for changes on ${event}`
      return `${who} updated ${event}`
    case 'od_requests':
      if (log.action === 'insert') return `${who} requested OD for ${event}`
      if (log.action === 'delete') return `${who} withdrew the OD request for ${event}`
      if (m.to === 'approved') return `${who} approved OD for ${event}`
      if (m.to === 'rejected') return `${who} rejected OD for ${event}`
      if (m.to === 'more_info') return `${who} asked for more information on the OD for ${event}`
      return `${who} updated the OD request for ${event}`
    case 'profiles':
      return log.action === 'insert'
        ? `${m.name ?? 'A user'} joined as ${m.role ?? 'user'}`
        : `${who} updated the account of ${m.name ?? 'a user'}`
    case 'departments':
      return `${who} ${log.action}d the department ${m.name ?? ''}`.trim()
    case 'event_categories':
      return `${who} ${log.action}d the category ${m.name ?? ''}`.trim()
    case 'app_settings':
      return `${who} changed the setting “${m.name ?? ''}”`
    default:
      return `${who} ${log.action} ${log.entity_type}`
  }
}

// ----- system settings ---------------------------------------------------------

export interface SystemSettings {
  institution_name: string
  allow_student_registration: boolean
  verification_prefix: string
}

const DEFAULTS: SystemSettings = {
  institution_name: '',
  allow_student_registration: true,
  verification_prefix: 'CP',
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const rows = unwrap(await supabase.from('app_settings').select('key, value')) as { key: string; value: unknown }[]
  const out: Record<string, unknown> = { ...DEFAULTS }
  for (const r of rows) if (r.key in DEFAULTS) out[r.key] = r.value // ignore retired keys (e.g. student_email_domain)
  return out as unknown as SystemSettings
}

export async function saveSystemSettings(next: SystemSettings, updatedBy: string) {
  const rows = (Object.keys(next) as (keyof SystemSettings)[]).map((key) => ({
    key,
    value: next[key],
    updated_by: updatedBy,
  }))
  unwrap(await supabase.from('app_settings').upsert(rows, { onConflict: 'key' }).select('key'))
}
