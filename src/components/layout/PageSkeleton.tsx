import { Skeleton, SkeletonCards } from '@/components/ui'

/** Suspense fallback while a lazily loaded page downloads. */
export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />
      </div>
      <SkeletonCards count={4} />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
