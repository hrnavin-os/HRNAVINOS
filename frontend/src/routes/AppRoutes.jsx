import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { LeadsPage } from '@/pages/leads/LeadsPage'
import { AdmissionsPage } from '@/pages/admissions/AdmissionsPage'
import { StudentsPage } from '@/pages/students/StudentsPage'
import { CoursesPage } from '@/pages/courses/CoursesPage'
import { BatchesPage } from '@/pages/batches/BatchesPage'
import { TutorsPage } from '@/pages/tutors/TutorsPage'
import { AttendancePage } from '@/pages/attendance/AttendancePage'
import { PaymentsPage } from '@/pages/payments/PaymentsPage'
import { PlacementsPage } from '@/pages/placements/PlacementsPage'
import { CompaniesPage } from '@/pages/companies/CompaniesPage'
import { TicketsPage } from '@/pages/tickets/TicketsPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { UsersPage } from '@/pages/users/UsersPage'
import { RolesPage } from '@/pages/roles/RolesPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { NotFoundPage } from '@/pages/errors/NotFoundPage'
import { UnauthorizedPage } from '@/pages/errors/UnauthorizedPage'
import { PERMISSIONS } from '@/constants/permissions'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<DashboardPage />} />

          <Route element={<ProtectedRoute permission={PERMISSIONS.LEADS_VIEW} />}>
            <Route path="/leads" element={<LeadsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.ADMISSIONS_VIEW} />}>
            <Route path="/admissions" element={<AdmissionsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.STUDENTS_VIEW} />}>
            <Route path="/students" element={<StudentsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.COURSES_VIEW} />}>
            <Route path="/courses" element={<CoursesPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.BATCHES_VIEW} />}>
            <Route path="/batches" element={<BatchesPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.TUTORS_VIEW} />}>
            <Route path="/tutors" element={<TutorsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.ATTENDANCE_VIEW} />}>
            <Route path="/attendance" element={<AttendancePage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.PAYMENTS_VIEW} />}>
            <Route path="/payments" element={<PaymentsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.PLACEMENTS_VIEW} />}>
            <Route path="/placements" element={<PlacementsPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.TICKETS_VIEW} />}>
            <Route path="/tickets" element={<TicketsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW} />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.USERS_VIEW} />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.ROLES_VIEW} />}>
            <Route path="/roles" element={<RolesPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.SETTINGS_VIEW} />}>
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
