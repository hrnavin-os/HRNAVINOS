// The white card a table sits in, with its pagination or count footer.
//
// Deliberately does NOT clip its contents, which is the whole reason it exists
// as a component. It used to be `overflow-hidden rounded-lg …` copied into nine
// files, and that clip makes DataTable's sticky horizontal scrollbar inert: a
// sticky child is positioned against its nearest scrollport, and a hidden box
// that never scrolls never offsets it. DataTable rounds its own top corners
// instead - see .table-frame in styles/index.css - so the corners still look
// clipped without a clip.
//
// Anything that isn't a table can keep using the plain classes; this is for the
// table shell specifically, so the reason for the missing overflow-hidden lives
// in one place instead of being a puzzling omission in nine.
export function TableCard({ children, className = '' }) {
  return <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>
}
