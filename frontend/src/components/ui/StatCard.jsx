// Shared stat tile that doubles as a filter/tab control - the Admin board's
// section and stage rows, and the HR Coordinator's student tabs.
//
// Each card is a flat wash of its own accent so a row of them scans as a
// legend; the selected one fills solid with white text, so the active choice
// is unmistakable against its pale neighbours. An optional icon means the
// choice isn't carried by colour alone.
//
// Flat, not gradient. Every tile used to be a two-stop gradient with a
// gradient icon plate on top of it, which put four or five separate ramps in
// one 200px band across the top of the board - the first thing the eye landed
// on was the decoration rather than the figures. Solid fills at one step,
// with the accent doing the identifying and the number doing the talking.
//
// The colours themselves live in constants/statTones, which every other
// summary card in the ERP reads too, so they all wear this card's look.
import { statTone } from '@/constants/statTones'

// `hint` is a line of qualifying text under the value ("For selected period").
//
// Without `onClick` the card renders as a plain div rather than a button: a
// passive figure should not be focusable, should not announce a pressed state,
// and should not respond to the pointer promising a click that does nothing.
// That is what lets the Payments summary use this card instead of keeping its
// own near-copy of it.
export function StatCard({ label, value, toneName, isActive, onClick, icon: Icon, hint }) {
  const tone = statTone(toneName)
  const interactive = Boolean(onClick)
  const Wrapper = interactive ? 'button' : 'div'

  return (
    // Fills the row. There was a max-width here to stop two cards taking half
    // the screen each, but the fix for a sparse row is the row's business, not
    // the card's - capped, a full row of four just ended short of the edge with
    // the table beneath running wider than the cards above it.
    // basis-44 keeps them from collapsing the other way when there are six.
    <Wrapper
      {...(interactive
        ? { type: 'button', onClick, 'aria-pressed': isActive }
        : {})}
      // No hover lift. A row of tiles that rise under the pointer is a
      // consumer-dashboard gesture; here the tiles are filter controls sitting
      // directly above the table they filter, and nudging them shifts the one
      // thing the eye is using as an anchor. Colour and the focus ring carry
      // the interaction instead.
      //
      // A size container, so the card can tighten itself when its row makes
      // it narrow - eight stages in one row on a scaled laptop screen - rather
      // than clipping the label. Below 11rem the padding, icon and gap shrink;
      // below 9.75rem the icon goes, leaving the label the whole card. The
      // padding sits on the inner div because a container can't query itself.
      className={`group @container flex-1 basis-44 rounded-lg border text-left ${
        interactive
          ? 'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'
          : ''
      } ${isActive ? `${tone.active} shadow-sm` : `${tone.surface} ${interactive ? tone.hover : ''}`}`}
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5 @max-[11rem]:gap-2 @max-[11rem]:px-3">
        {Icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white @max-[11rem]:h-8 @max-[11rem]:w-8 @max-[9.75rem]:hidden ${
              isActive ? 'bg-white/20' : tone.plate
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {/* Two lines before it clips, not one: in a full row of stages a
              card is narrow enough that "Batch Confirmation" would otherwise
              lose its last letters. A label that fits stays on one line. */}
          <p
            className={`line-clamp-2 text-[11px] font-semibold uppercase leading-tight tracking-wide ${
              isActive ? 'text-white/80' : tone.label
            }`}
          >
            {label}
          </p>
          <p
            className={`mt-1 text-xl font-semibold leading-none tabular-nums ${isActive ? 'text-white' : tone.value}`}
          >
            {value}
          </p>
          {hint && (
            <p className={`mt-1 truncate text-[11px] ${isActive ? 'text-white/70' : 'text-slate-400'}`}>{hint}</p>
          )}
        </div>
      </div>
    </Wrapper>
  )
}
