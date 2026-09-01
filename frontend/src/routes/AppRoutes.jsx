import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { LoginPage } from '@/pages/auth/LoginPage'
import { HomeRoute } from '@/routes/HomeRoute'
import { LeadsPage } from '@/pages/leads/LeadsPage'
import { LeadAnalyticsPage } from '@/pages/leads/LeadAnalyticsPage'
import { FormCollectionPage } from '@/pages/leads/FormCollectionPage'
import { FoundationFormPage } from '@/pages/public/FoundationFormPage'
import { InductionFormPage } from '@/pages/public/InductionFormPage'
import { MarketingBoardPage } from '@/pages/marketing/MarketingBoardPage'
import { AdmissionsPage } from '@/pages/admissions/AdmissionsPage'
import { StudentsPage } from '@/pages/students/StudentsPage'
import { ProgramsPage } from '@/pages/programs/ProgramsPage'
import { InductionAttendancePage } from '@/pages/attendance/InductionAttendancePage'
import { CoursesPage } from '@/pages/courses/CoursesPage'
import { BatchesPage } from '@/pages/batches/BatchesPage'
import { HRCoordinatorPage } from '@/pages/hr/HRCoordinatorPage'
import { WhatsAppLinksPage } from '@/pages/hr/WhatsAppLinksPage'
import { TutorsPage } from '@/pages/tutors/TutorsPage'
import { AttendancePage } from '@/pages/attendance/AttendancePage'
import { PaymentsPage } from '@/pages/payments/PaymentsPage'
import { PlacementsPage } from '@/pages/placements/PlacementsPage'
import { CompaniesPage } from '@/pages/companies/CompaniesPage'
import { TicketsPage } from '@/pages/tickets/TicketsPage'
import { NotificationsPage } from '@/pages/notifications/NotificationsPage'
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
      <Route path="/foundation-form" element={<FoundationFormPage />} />
      {/* Public like the Foundation Form: shared as a link, no login. */}
      <Route path="/induction-form" element={<InductionFormPage />} />
      {/* Sections are admin-managed and open-ended (Form Collection's "Add Form"
          button can create new ones at any time), so this is a dynamic route
          rather than one static entry per section. */}
      <Route path="/foundation-form/:section" element={<FoundationFormPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<HomeRoute />} />
          {/* Section Admins only - they're who Finance's payment reminders
              are addressed to. Gated on the route as well as the sidebar so
              it isn't reachable by typing the URL. */}
          <Route element={<ProtectedRoute scopedOnly />}>
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>

          <Route element={<ProtectedRoute permission={PERMISSIONS.LEADS_VIEW} />}>
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/marketing-board" element={<MarketingBoardPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.LEADS_VIEW} blockScoped />}>
            {/* blockScoped, matching its nav entry: the board summarises every
                section, which is not a Section Admin's to see. */}
            <Route path="/lead-analytics" element={<LeadAnalyticsPage />} />
            <Route path="/leads/form-collection" element={<FormCollectionPage />} />
            <Route path="/leads/foundation-form" element={<Navigate to="/leads/form-collection" replace />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.ADMISSIONS_VIEW} />}>
            <Route path="/admissions" element={<AdmissionsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.STUDENTS_VIEW} />}>
            <Route path="/students" element={<StudentsPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.PROGRAMS_VIEW} />}>
            <Route path="/programs" element={<ProgramsPage />} />
          </Route>
          {/* blockScoped like the other Admin boards: it covers every
              section's induction roll, which is not a Section Admin's to see.
              The path is its own rather than /attendance, which is the
              classroom register a Tutor marks. */}
          <Route element={<ProtectedRoute permission={PERMISSIONS.INDUCTION_ATTENDANCE_VIEW} blockScoped />}>
            <Route path="/induction-attendance" element={<InductionAttendancePage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.COURSES_VIEW} />}>
            <Route path="/courses" element={<CoursesPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.BATCHES_VIEW} />}>
            <Route path="/batches" element={<BatchesPage />} />
          </Route>
          <Route element={<ProtectedRoute permission={PERMISSIONS.BATCH_CONFIRMATION_VIEW} />}>
            <Route path="/batch-confirmation" element={<HRCoordinatorPage />} />
            <Route path="/whatsapp-links" element={<WhatsAppLinksPage />} />
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
