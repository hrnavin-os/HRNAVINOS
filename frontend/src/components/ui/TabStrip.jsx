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
//
// `equal` spreads the tabs across the full width in equal shares instead of
// sizing each to its label. For two tabs beside a page title, natural widths
// are right - a strip stretched across the page to hold two words reads as a
// toolbar, not a switch. Past three, and especially where the labels differ
// wildly in length ("Category" against "Induction Call Remarks"), equal shares
// stop the strip looking lopsided and give every tab the same target size.
export function TabStrip({ tabs, value, onChange, equal = false, className = '' }) {
  return (
    // Equal mode is a grid, not a wrapping flex row. Flex shares are computed
    // from flex-basis but items refuse to shrink below their own label, so a
    // basis small enough to keep four on one line lets the longest label push
    // the row past the container. Grid tracks are minmax(0, 1fr): exactly equal
    // by construction, and content cannot blow one out.
    //
    // Two columns until sm, so four tabs become two rows of two on a phone
    // rather than one line that scrolls half the control out of sight.
    <div
      style={equal ? { '--tab-count': tabs.length } : undefined}
      className={`gap-1 rounded-lg bg-slate-100 p-1 ${
        equal
          ? 'grid w-full grid-cols-2 sm:grid-cols-[repeat(var(--tab-count),minmax(0,1fr))]'
          : 'inline-flex max-w-full overflow-x-auto'
      } ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = value === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-pressed={isActive}
            // min-w-0 lets the button shrink to its track; without it the
            // button's own content floor would push past the 1fr the grid
            // gave it, which is the flex problem again one level down.
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              equal ? 'min-w-0 justify-center' : 'shrink-0'
            } ${
              isActive
                ? (tab.active ?? 'bg-white text-brand-700 shadow-sm')
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon && <tab.icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />}
            {/* Truncation is the last resort at the narrowest widths, and only
                in equal mode - a tab sized to its own label never needs it. */}
            <span className={equal ? 'truncate' : ''}>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
