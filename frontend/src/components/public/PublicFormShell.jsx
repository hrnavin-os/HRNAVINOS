import { GraduationCap } from 'lucide-react'

// The frame both public forms sit in.
//
// Shared so the induction form and the foundation form can't drift into two
// different-looking front doors, and because these are the only pages a
// candidate ever sees - they carry the whole first impression of the institute.
//
// `subtitle` is what the page is called; the wordmark stays the institute's
// name. The student-facing form deliberately does NOT say "ERP": that is the
// name of the system the staff use, and printing it on a form sent to a
// prospective student tells them nothing and reads as internal plumbing left
// on show.
export function PublicFormShell({ title, subtitle, children, wide = false }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* A band rather than a plain heading, so the page has a top edge on a
          phone where the card fills everything below it. */}
      <div className="bg-linear-to-br from-brand-700 via-brand-600 to-brand-500 px-4 pb-16 pt-10 text-center sm:pb-20 sm:pt-12">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25">
          <GraduationCap className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        </span>
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-white/80">{subtitle}</p>}
      </div>

      {/* Pulled up over the band so the card overlaps it - the join is what
          makes the two read as one page rather than a header and a box. */}
      <div className={`mx-auto -mt-10 w-full px-4 pb-12 sm:-mt-12 ${wide ? 'max-w-2xl' : 'max-w-xl'}`}>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg sm:p-7">{children}</div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Your details are used only to process your enrolment.
        </p>
      </div>
    </div>
  )
}
