// The one segmented control in the app: a recessed slate track with the
// selected tab raised out of it on white.
//
// Extracted because five places had grown their own - the Lead Dashboard's
// Induction/Foundation switch, HR Coordinator, Analytics, Payments and
// Marketing - and two of them had drifted to a different shape entirely
// (underlined tabs, solid-filled pills). A control that means "switch which
// view you are looking at" should not look like three different controls
// depending on which page you are on.
//
// A tab keeps its own accent as the raised pill's TEXT colour rather than
// filling it: on a white surface a solid block of colour reads as a button
// floating over the page rather than a tab selected out of a track.
//
// tabs: [{ key, label, icon?, active? }] - `active` overrides the raised
// pill's classes for tabs that carry their own accent (Foundation's violet).
export function TabStrip({ tabs, value, onChange, className = '' }) {
  return (
    // Scrolls rather than overflowing. Two tabs always fit; four of them with
    // labels like "Induction Call Remarks" do not fit a phone, and a strip that
    // overflows makes the whole page scroll sideways - a much worse failure
    // than a short scroll inside the control itself. Tabs stay their natural
    // width instead of being squashed to fit.
    <div className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 ${className}`}>
      {tabs.map((tab) => {
        const isActive = value === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-pressed={isActive}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              isActive
                ? (tab.active ?? 'bg-white text-brand-700 shadow-sm')
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon && <tab.icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
