import { FileSpreadsheet } from 'lucide-react'
import { TabStrip } from '@/components/ui/TabStrip'
import { GoogleSheetsIntegration } from '@/components/marketing/GoogleSheetsIntegration'

// One tab so far, but it still wears the shared strip: when the second
// integration lands the control is already the one every other board uses, and
// in the meantime this page doesn't advertise a third style of tab.
const TABS = [{ key: 'sheets', label: 'Google Sheets', icon: FileSpreadsheet }]

export function MarketingBoardPage() {
  return (
    <div>
      <TabStrip tabs={TABS} value="sheets" onChange={() => {}} className="mb-4" />
      <GoogleSheetsIntegration />
    </div>
  )
}
