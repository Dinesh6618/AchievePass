import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  /** Forget the last sign-in problem (e.g. when the visitor picks a different account type). */
  clearAccountError: () => void
  /**
   * Username + password sign-in for every role. `expectedRole` is the account type chosen on the login page; an account
   * of a different type is signed straight back out with an explanation (the role itself always comes from the database).
   */
  signInWithUsername: (username: string, password: string, expectedRole?: Role) => Promise<Profile>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  setProfile: (profile: Profile) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function homePathFor(role: Role): string {
  return role === 'student' ? '/student' : role === 'faculty' ? '/faculty' : '/admin'
}

const ROLE_LABEL: Record<Role, string> = { student: 'Student', faculty: 'Faculty', admin: 'Admin' }

/** Said after correct credentials were entered on the wrong account-type tab. */
export function wrongAccountTypeMessage(actual: Role, expected: Role): string {
  return `That is a ${ROLE_LABEL[actual]} account, not a ${ROLE_LABEL[expected]} one. Choose “${ROLE_LABEL[actual]}” above and sign in again.`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [profile, setProfileState] = useState<Profile | null>(null)
  // Id of the user whose profile lookup has settled (success or failure). Until it matches the
  // session's user we are still "loading" — otherwise a restored session would flash as signed out.
  const [profileFor, setProfileFor] = useState<string | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  // The account type picked on the login page while a sign-in is in flight (null otherwise).
  const expectedRole = useRef<Role | null>(null)
  // True while signInWithUsername runs: it loads and checks the profile itself, so the restore effect below must not
  // race it (a second, late lookup could wipe the "wrong account type" message or let the wrong account in).
  const signingIn = useRef(false)

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
      if (event === 'SIGNED_OUT') setProfileState(null)
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
    if (signingIn.current) return
    let active = true
    fetchProfile(userId)
      .then(async (p) => {
        if (!active) return
        if (!p) {
          setAccountError('We could not find a profile for this account. Please contact your administrator.')
          setProfileState(null)
          await supabase.auth.signOut()
        } else if (!p.is_active) {
          setAccountError('This account has been disabled. Please contact your administrator.')
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
    if (!p.is_active) return reject('This account has been disabled. Please contact your administrator.')
    if (expectedRole.current && p.role !== expectedRole.current) return reject(wrongAccountTypeMessage(p.role, expectedRole.current))
    setProfileState(p)
    setProfileFor(userIdValue)
    return p
  }, [])

  /** Student, faculty and admin: username + password. */
  const signInWithUsername = useCallback(
    async (username: string, password: string, expected?: Role) => {
      setAccountError(null)
      expectedRole.current = expected ?? null
      signingIn.current = true
      try {
        const { user } = await auth.signInWithUsername(username, password)
        return await completeSignIn(user.id)
      } catch (err) {
        // never leave a half-finished session behind (wrong account type, disabled account, profile lookup failed…)
        await supabase.auth.signOut().catch(() => undefined)
        throw err
      } finally {
        signingIn.current = false
        expectedRole.current = null
      }
    },
    [completeSignIn],
  )

  const clearAccountError = useCallback(() => setAccountError(null), [])

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
      clearAccountError,
      signInWithUsername,
      signOut,
      refreshProfile,
      setProfile: setProfileState,
    }),
    [session, profile, sessionReady, userId, profileFor, accountError, clearAccountError, signInWithUsername, signOut, refreshProfile],
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
