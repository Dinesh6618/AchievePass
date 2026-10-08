import { Link } from 'react-router-dom'
import {
  Award,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileBarChart,
  GraduationCap,
  MessageSquareMore,
  Users,
  XCircle,
} from 'lucide-react'
import { ChartCard, ShareBar } from '@/components/charts/ChartParts'
import { CHART } from '@/components/charts/theme'
import { EmptyState, ErrorState, PageHeader, SectionCard, SkeletonCards, SkeletonRows, StatCard } from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { relativeTime } from '@/lib/dates'
import { describeAudit, listAuditLogs } from '@/services/adminService'
import { getReviewStats } from '@/services/reviewService'

export default function DashboardPage() {
  useDocumentTitle('Dashboard')
  const profile = useProfile()
  const stats = useAsync(getReviewStats, [], { context: 'admin stats' })
  const audit = useAsync(() => listAuditLogs({ pageSize: 10 }), [], { context: 'audit feed' })
  const s = stats.data

  const changes = s ? Math.max(0, s.total_achievements - s.verified_total - s.pending_certificates - s.rejected) : 0

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Administration" title={`Welcome, ${profile.full_name.split(' ')[0]}`} subtitle="A live view of participation and verification across the college." />

      {stats.error ? (
        <ErrorState message={stats.error} onRetry={stats.reload} />
      ) : stats.loading && !s ? (
        <SkeletonCards count={9} className="lg:grid-cols-3" />
      ) : s ? (
        <>
          <section aria-label="Overview" className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard label="Total students" value={s.total_students} icon={GraduationCap} to="/admin/students" />
            <StatCard label="Total faculty" value={s.total_faculty} icon={Users} to="/admin/faculty" />
            <StatCard label="Total achievements" value={s.total_achievements} icon={Award} tone="gold" to="/admin/achievements" />
            <StatCard label="Verified certificates" value={s.verified_total} icon={BadgeCheck} tone="verified" />
            <StatCard label="Pending certificates" value={s.pending_certificates} icon={Clock} tone="pending" />
            <StatCard label="Total OD requests" value={s.total_ods} icon={ClipboardList} tone="info" to="/admin/od" />
            <StatCard label="Approved ODs" value={s.approved_ods} icon={CheckCircle2} tone="verified" />
            <StatCard label="Pending ODs" value={s.pending_ods} icon={Clock} tone="pending" />
            <StatCard label="Rejected ODs" value={s.rejected_ods} icon={XCircle} tone="rejected" />
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ChartCard
              title="Certificate pipeline"
              subtitle="Where every submitted achievement stands right now"
              table={{
                headers: ['Status', 'Achievements'],
                rows: [
                  ['Verified', s.verified_total],
                  ['Pending verification', s.pending_certificates],
                  ['Changes requested', changes],
                  ['Rejected', s.rejected],
                ],
              }}
            >
              {s.total_achievements === 0 ? (
                <p className="py-8 text-center text-sm text-ink-500">Nothing has been submitted yet.</p>
              ) : (
                <ShareBar
                  ariaLabel="Certificate pipeline"
                  items={[
                    { label: 'Verified', value: s.verified_total, color: CHART.verified, icon: CheckCircle2 },
                    { label: 'Pending verification', value: s.pending_certificates, color: CHART.pending, icon: Clock },
                    { label: 'Changes requested', value: changes, color: CHART.info, icon: MessageSquareMore },
                    { label: 'Rejected', value: s.rejected, color: CHART.rejected, icon: XCircle },
                  ]}
                />
              )}
              <div className="mt-5 flex flex-wrap gap-4 text-sm">
                <Link to="/admin/analytics" className="inline-flex items-center gap-1.5 font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900">
                  <BarChart3 className="size-4" aria-hidden /> Full analytics
                </Link>
                <Link to="/admin/reports" className="inline-flex items-center gap-1.5 font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900">
                  <FileBarChart className="size-4" aria-hidden /> Generate a report
                </Link>
              </div>
            </ChartCard>

            <SectionCard title="Recent activity" description="The latest actions across the system">
              {audit.error ? (
                <ErrorState message={audit.error} onRetry={audit.reload} />
              ) : audit.loading && !audit.data ? (
                <SkeletonRows rows={5} />
              ) : (audit.data?.rows.length ?? 0) === 0 ? (
                <EmptyState title="No activity yet" description="Actions will be listed here as people use CertiPass." className="border-0 py-8" />
              ) : (
                <ol className="space-y-3">
                  {audit.data!.rows.map((log) => (
                    <li key={log.id} className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 break-words text-ink-800">{describeAudit(log)}</span>
                      <time dateTime={log.created_at} className="shrink-0 text-xs text-ink-400">
                        {relativeTime(log.created_at)}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>
          </div>
        </>
      ) : null}
    </div>
  )
}
