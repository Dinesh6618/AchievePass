import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AppError, reportError } from '@/lib/errors'
import { fetchProfile } from '@/services/profileService'
import * as auth from '@/services/authService'
import type { Profile, Role } from '@/types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  /** True until the stored session (if any) and its profile have been resolved. */
  loading: boolean
  /** Set when a session exists but the account can't be used (deactivated, missing profile). */
  accountError: string | null
  /** True after following a password-reset email link. */
  recoveryMode: boolean
  /** Faculty / admin sign-in (e-mail + password). */
  signIn: (email: string, password: string) => Promise<Profile>
  /** Student sign-in (username + password). */
  signInWithUsername: (username: string, password: string) => Promise<Profile>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  setProfile: (profile: Profile) => void
  clearRecoveryMode: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function homePathFor(role: Role): string {
  return role === 'student' ? '/student' : role === 'faculty' ? '/faculty' : '/admin'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [profile, setProfileState] = useState<Profile | null>(null)
  // Id of the user whose profile lookup has settled (success or failure). Until it matches the
  // session's user we are still "loading" — otherwise a restored session would flash as signed out.
  const [profileFor, setProfileFor] = useState<string | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [recoveryMode, setRecoveryMode] = useState(false)

  // 1) Restore the persisted session and follow auth changes.
  useEffect(() => {
    let active = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session)
        setSessionReady(true)
      })
      .catch((err) => {
        reportError(err, 'getSession')
        if (active) setSessionReady(true)
      })

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // Never await Supabase calls in here (it can deadlock the auth client); just record state.
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      if (event === 'SIGNED_OUT') {
        setProfileState(null)
        setRecoveryMode(false)
      }
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  // 2) Load the profile whenever the signed-in user changes.
  const userId = session?.user.id
  useEffect(() => {
    if (!userId) {
      setProfileState(null)
      setProfileFor(null)
      return
    }
    let active = true
    fetchProfile(userId)
      .then(async (p) => {
        if (!active) return
        if (!p) {
          setAccountError('We could not find a profile for this account. Please contact your administrator.')
          setProfileState(null)
          await supabase.auth.signOut()
        } else if (!p.is_active) {
          setAccountError('This account has been deactivated. Please contact your administrator.')
          setProfileState(null)
          await supabase.auth.signOut()
        } else {
          setAccountError(null)
          setProfileState(p)
        }
      })
      .catch((err) => {
        if (active) setAccountError(reportError(err, 'fetchProfile'))
      })
      .finally(() => {
        if (active) setProfileFor(userId)
      })
    return () => {
      active = false
    }
  }, [userId])

  /** After the credentials were accepted: load the profile and make sure the account may be used. */
  const completeSignIn = useCallback(async (userIdValue: string) => {
    // While the profile loads the auth listener has already set the session, so the login page may
    // be swapped for a loader; keeping the message in context lets the page show it when it returns.
    const reject = async (message: string): Promise<never> => {
      setAccountError(message)
      await supabase.auth.signOut()
      throw new AppError(message)
    }
    const p = await fetchProfile(userIdValue)
    if (!p) return reject('We could not find a profile for this account. Please contact your administrator.')
    if (!p.is_active) return reject('This account has been deactivated. Please contact your administrator.')
    setProfileState(p)
    setProfileFor(userIdValue)
    return p
  }, [])

  /** Faculty / admin: e-mail + password. */
  const signIn = useCallback(
    async (email: string, password: string) => {
      setAccountError(null)
      const { user } = await auth.signInWithPassword(email, password)
      return completeSignIn(user.id)
    },
    [completeSignIn],
  )

  /** Students: username + password. */
  const signInWithUsername = useCallback(
    async (username: string, password: string) => {
      setAccountError(null)
      const { user } = await auth.signInWithUsername(username, password)
      return completeSignIn(user.id)
    },
    [completeSignIn],
  )

  const signOut = useCallback(async () => {
    await auth.signOut()
    setProfileState(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!userId) return
    const p = await fetchProfile(userId)
    if (p) setProfileState(p)
  }, [userId])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading: !sessionReady || (userId !== undefined && profileFor !== userId),
      accountError,
      recoveryMode,
      signIn,
      signInWithUsername,
      signOut,
      refreshProfile,
      setProfile: setProfileState,
      clearRecoveryMode: () => setRecoveryMode(false),
    }),
    [session, profile, sessionReady, userId, profileFor, accountError, recoveryMode, signIn, signInWithUsername, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** For pages that only render inside <RequireRole>: the profile is guaranteed. */
export function useProfile(): Profile {
  const { profile } = useAuth()
  if (!profile) throw new Error('useProfile used without a signed-in profile')
  return profile
}
