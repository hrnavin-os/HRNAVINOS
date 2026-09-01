// The app's one surface. `rounded-lg border border-slate-200 bg-white
// shadow-sm` was written out by hand in twenty-nine files, and had already
// drifted - five of them at rounded-xl, two at rounded-2xl, several carrying a
// hover lift on a panel that isn't clickable. Naming it is what stops the
// thirtieth from inventing a thirty-first variant.
//
// Padding is deliberately not baked in: some cards hold a table that must run
// edge to edge, others hold a form that needs p-4. Pass it through className,
// or use CardBody for the common case.
//
// (TableCard is the one surface that stays separate - it must not clip its
// contents, for reasons its own file explains at length.)
export function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`} {...props}>
      {children}
    </div>
  )
}

// A card's title bar: name on the left, whatever acts on the card on the
// right. 13px semibold is the panel-title size across the app - a panel
// heading is a label for the thing under it, not a page heading, and sizing it
// like one is what made several screens read as a stack of competing titles.
export function CardHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ className = '', children }) {
  return <div className={`p-4 ${className}`}>{children}</div>
}

// The band at the top of a page: what this screen is, and the one or two
// actions that apply to the whole of it. The Topbar already names the current
// page, so this is for the screens that need a subtitle or page-level buttons
// - not a second copy of the title on every page.
export function PageHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        {title && <h1 className="text-base font-semibold text-slate-900">{title}</h1>}
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
