import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// From/to date pair behind one button, so a filter row doesn't spend two full
// date inputs on a filter that's usually empty. The button label doubles as
// the current value. Shared by the Admin board and the Finance cashbook.
export function DateRangeFilter({ dateFrom, dateTo, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const hasValue = Boolean(dateFrom || dateTo)

  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setIsOpen((open) => !open)}>
        <Calendar className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        {hasValue ? `${dateFrom || '…'} → ${dateTo || '…'}` : 'Date'}
      </Button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
            <Input
              type="date"
              label="From"
              value={dateFrom}
              onChange={(event) => onChange({ dateFrom: event.target.value, dateTo })}
            />
            <div className="mt-3">
              <Input
                type="date"
                label="To"
                value={dateTo}
                onChange={(event) => onChange({ dateFrom, dateTo: event.target.value })}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  onChange({ dateFrom: '', dateTo: '' })
                  setIsOpen(false)
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
