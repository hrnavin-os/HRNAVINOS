import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export function UnauthorizedPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-center">
      <p className="text-5xl font-bold text-red-500">403</p>
      <h1 className="text-lg font-semibold text-slate-900">Access denied</h1>
      <p className="text-sm text-slate-500">You don't have permission to view this page.</p>
      <Link to="/">
        <Button className="mt-2">Back to dashboard</Button>
      </Link>
    </div>
  )
}
