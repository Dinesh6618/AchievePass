import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { useToast } from '@/components/ui'
import { countUnread, subscribeToNotifications } from '@/services/notificationService'

interface NotificationsContextValue {
  unread: number
  refresh: () => void
}

const NotificationsContext = createContext<NotificationsContextValue>({ unread: 0, refresh: () => {} })

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [unread, setUnread] = useState(0)
  const userId = profile?.id

  const refresh = useCallback(() => {
    if (!userId) return
    countUnread()
      .then(setUnread)
      .catch((err) => console.error('[CertiPass] unread count', err))
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setUnread(0)
      return
    }
    refresh()
    return subscribeToNotifications(userId, {
      onInsert: (n) => {
        setUnread((c) => c + 1)
        toast.info(n.title)
      },
      onChange: refresh,
    })
  }, [userId, refresh, toast])

  const value = useMemo(() => ({ unread, refresh }), [unread, refresh])
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications() {
  return useContext(NotificationsContext)
}
