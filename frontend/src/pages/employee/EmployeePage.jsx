import { Navigate, useSearchParams } from 'react-router-dom'
import { TabStrip } from '@/components/ui/TabStrip'
import { EMPLOYEE_TABS } from '@/constants/employeeTabs'
import { useAuth } from '@/hooks/useAuth'
import { StaffsPage } from '@/pages/staffs/StaffsPage'
import { DepartmentsPage } from '@/pages/departments/DepartmentsPage'
import { RolesPage } from '@/pages/roles/RolesPage'
import { UsersPage } from '@/pages/users/UsersPage'

const PAGES = {
  staffs: StaffsPage,
  departments: DepartmentsPage,
  roles: RolesPage,
  users: UsersPage,
}

// Employee > Staffs | Departments | Roles | Users, as tabs on one page.
//
// Each tab is granted on its own, so the strip shows only the ones this user
// may open. The open tab lives in the URL (?tab=users) rather than in state,
// so a reload, the back button and a shared link all land on the same tab.
export function EmployeePage() {
  const { hasPermission } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabs = EMPLOYEE_TABS.filter((tab) => hasPermission(tab.permission))
  if (!tabs.length) return <Navigate to="/unauthorized" replace />

  // An unknown or withheld tab in the URL falls back to the first one open.
  const requested = searchParams.get('tab')
  const active = tabs.find((tab) => tab.key === requested) ?? tabs[0]
  const Page = PAGES[active.key]

  return (
    <div>
      <div className="mb-4">
        <TabStrip
          tabs={tabs}
          value={active.key}
          onChange={(key) => setSearchParams({ tab: key }, { replace: true })}
          equal
        />
      </div>
      {/* Keyed so switching tabs starts the page fresh - its search, page
          number and any open modal belong to the tab they were opened on. */}
      <Page key={active.key} />
    </div>
  )
}
