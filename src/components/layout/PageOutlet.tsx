import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PageSkeleton } from './PageSkeleton'

/** Renders the matched child route with a loading skeleton and a per-page crash guard. */
export function PageOutlet() {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<PageSkeleton />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  )
}
