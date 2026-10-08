import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { SidebarShell } from '@/components/layout/SidebarShell'
import { TopNavShell } from '@/components/layout/TopNavShell'
import { PublicOnly, RequireRole } from '@/routes/guards'

import LandingPage from '@/pages/public/LandingPage'
import LoginPage from '@/pages/public/LoginPage'
import RegisterPage from '@/pages/public/RegisterPage'
import { ForgotPasswordPage } from '@/pages/public/PasswordPages'
import VerifyPage, { VerifyLookupPage } from '@/pages/public/VerifyPage'
import NotFoundPage from '@/pages/public/NotFoundPage'

// Signed-in areas are split per page so a student never downloads the admin charts, and vice versa.
const PassportPage = lazy(() => import('@/pages/student/PassportPage'))
const AchievementsPage = lazy(() => import('@/pages/student/AchievementsPage'))
const AchievementDetailPage = lazy(() => import('@/pages/student/AchievementDetailPage'))
const AchievementWizardPage = lazy(() => import('@/pages/student/AchievementWizardPage'))
const OdListPage = lazy(() => import('@/pages/student/OdListPage'))
const OdFormPage = lazy(() => import('@/pages/student/OdFormPage'))
const OdDetailPage = lazy(() => import('@/pages/student/OdDetailPage'))
const CalendarPage = lazy(() => import('@/pages/student/CalendarPage'))

const NotificationsPage = lazy(() => import('@/pages/shared/NotificationsPage'))
const ProfilePage = lazy(() => import('@/pages/shared/ProfilePage'))
const ReportsPage = lazy(() => import('@/pages/shared/ReportsPage'))
const StudentDirectoryPage = lazy(() => import('@/pages/shared/StudentDirectoryPage'))
const StudentDetailPage = lazy(() => import('@/pages/shared/StudentDetailPage'))
const AchievementsExplorerPage = lazy(() => import('@/pages/shared/AchievementsExplorerPage'))
const OdQueuePage = lazy(() => import('@/pages/shared/OdQueuePage'))
const ReviewAchievementPage = lazy(() => import('@/pages/shared/ReviewAchievementPage'))
const OdReviewPage = lazy(() => import('@/pages/shared/OdReviewPage'))

const VerificationCenterPage = lazy(() => import('@/pages/faculty/VerificationCenterPage'))

const AdminDashboardPage = lazy(() => import('@/pages/admin/DashboardPage'))
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'))
const AnalyticsPage = lazy(() => import('@/pages/admin/AnalyticsPage'))
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage'))

export default function App() {
  return (
    <Routes>
      {/* ---------- public ---------- */}
      <Route path="/" element={<LandingPage />} />
      {/* one sign-in page: pick Student / Faculty / Admin, then Username + Password */}
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/login/:role" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/faculty/login" element={<Navigate to="/login/faculty" replace />} />
      <Route path="/admin/login" element={<Navigate to="/login/admin" replace />} />
      <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/verify" element={<VerifyLookupPage />} />
      <Route path="/verify/:code" element={<VerifyPage />} />

      {/* ---------- student ---------- */}
      <Route path="/student" element={<RequireRole role="student"><SidebarShell role="student" /></RequireRole>}>
        <Route index element={<PassportPage />} />
        <Route path="achievements" element={<AchievementsPage />} />
        <Route path="achievements/new" element={<AchievementWizardPage />} />
        <Route path="achievements/:id" element={<AchievementDetailPage />} />
        <Route path="achievements/:id/edit" element={<AchievementWizardPage />} />
        <Route path="od" element={<OdListPage />} />
        <Route path="od/new" element={<OdFormPage />} />
        <Route path="od/:id" element={<OdDetailPage />} />
        <Route path="od/:id/edit" element={<OdFormPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* ---------- faculty ---------- */}
      <Route path="/faculty" element={<RequireRole role="faculty"><TopNavShell /></RequireRole>}>
        <Route index element={<VerificationCenterPage />} />
        <Route path="review/:id" element={<ReviewAchievementPage />} />
        <Route path="od" element={<OdQueuePage />} />
        <Route path="od/:id" element={<OdReviewPage />} />
        <Route path="students" element={<StudentDirectoryPage />} />
        <Route path="students/:id" element={<StudentDetailPage />} />
        <Route path="achievements" element={<AchievementsExplorerPage />} />
        <Route path="search" element={<AchievementsExplorerPage globalSearch />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* ---------- admin ---------- */}
      <Route path="/admin" element={<RequireRole role="admin"><SidebarShell role="admin" /></RequireRole>}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="students" element={<UsersPage kind="student" />} />
        <Route path="students/:id" element={<StudentDetailPage />} />
        <Route path="faculty" element={<UsersPage kind="faculty" />} />
        <Route path="achievements" element={<AchievementsExplorerPage />} />
        <Route path="achievements/:id" element={<ReviewAchievementPage />} />
        <Route path="search" element={<AchievementsExplorerPage globalSearch />} />
        <Route path="od" element={<OdQueuePage />} />
        <Route path="od/:id" element={<OdReviewPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
