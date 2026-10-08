import { supabase } from '@/lib/supabase'
import type { AppNotification } from '@/types'
import { unwrap, type Page } from './db'

export async function listNotifications(opts: { unreadOnly?: boolean; page?: number; pageSize?: number } = {}) {
  const { unreadOnly = false, page = 0, pageSize = 20 } = opts
  let q = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (unreadOnly) q = q.eq('is_read', false)
  const { data, error, count } = await q
  if (error) throw error
  return { rows: (data ?? []) as AppNotification[], total: count ?? 0 } satisfies Page<AppNotification>
}

export async function countUnread(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
  if (error) throw error
  return count ?? 0
}

export async function markRead(id: string) {
  unwrap(await supabase.from('notifications').update({ is_read: true }).eq('id', id).select('id'))
}

export async function markAllRead() {
  unwrap(await supabase.from('notifications').update({ is_read: true }).eq('is_read', false).select('id'))
}

export async function deleteNotification(id: string) {
  unwrap(await supabase.from('notifications').delete().eq('id', id).select('id'))
}

/** Live updates via Supabase Realtime. Returns an unsubscribe function. */
export function subscribeToNotifications(
  userId: string,
  handlers: { onInsert: (n: AppNotification) => void; onChange: () => void },
) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => handlers.onInsert(payload.new as AppNotification),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => handlers.onChange(),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'notifications' },
      () => handlers.onChange(),
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
