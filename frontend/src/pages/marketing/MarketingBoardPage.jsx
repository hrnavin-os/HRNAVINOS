import { FileSpreadsheet } from 'lucide-react'
import { GoogleSheetsIntegration } from '@/components/marketing/GoogleSheetsIntegration'

export function MarketingBoardPage() {
  return (
    <div>

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <span className="flex items-center gap-1.5 border-b-2 border-brand-600 px-1 pb-2 text-sm font-semibold text-brand-600">
          <FileSpreadsheet className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Google Sheets
        </span>
      </div>

      <GoogleSheetsIntegration />
    </div>
  )
}
