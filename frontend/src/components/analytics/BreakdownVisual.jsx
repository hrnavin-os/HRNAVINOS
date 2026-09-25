import { ChartLine, ChartPie, LayoutGrid, Percent, SquareStack } from 'lucide-react'
import { DonutChart } from '@/components/analytics/DonutChart'
import { RateBars } from '@/components/analytics/RateBars'
import { OutcomeStack } from '@/components/analytics/OutcomeStack'
import { TrendChart } from '@/components/analytics/TrendChart'
import { TreemapChart } from '@/components/analytics/TreemapChart'
import { colorByEntity } from '@/constants/analyticsPalette'
import { shortMoney } from '@/constants/statisticsBoards'

/**
 * One breakdown, read four different ways - four analytics, not four drawings
 * of the same count.
 *
 *   Intake       how many sit under each value, and their share of the whole
 *   Conversion   the rate each value turns into the good outcome - which one
 *                actually works, which the headcount can't say
 *   Outcomes     where each value's people ended up: converted, still open,
 *                or lost - the mix behind the rate
 *   Money /      what each value brought in (Foundation), or its share of all
 *   Conversions  the conversions (Induction, where nobody has paid yet)
 *   Trend        the shape between periods, on the batch tab only
 *
 * They sit together as small multiples rather than behind a picker, because
 * the questions come one after another - which course is biggest, does it
 * convert, where do the rest go, what did it earn - and side by side the eye
 * carries the answer from one to the next for free.
 *
 * What makes them one canvas: they are fed the same rows, share one highlight,
 * and a value is the same colour in all of them. That colour is assigned once
 * here, ranked by headcount, and handed to every view - so the money map, which
 * sizes by rupees, doesn't repaint a course because it ranks differently there.
 *
 * The trend is drawn only where the values sit on an axis. A line across
 * categories asserts that the gap between two of them means something, and
 * between "Data Science" and "Full Stack" it means nothing - so on those
 * dimensions the view isn't drawn rather than being drawn and lying. Where it
 * is drawn it takes the full width: a line is read along its length.
 */
function visualsForBoard(board) {
  const [good] = board.outcomes
  return [
    // `reads` is the caption at the right of each cell - the question that
    // view answers.
    { value: 'intake', label: 'Intake', icon: ChartPie, reads: `${board.unit} under each value` },
    {
      value: 'conversion',
      label: 'Conversion rate',
      icon: Percent,
      reads: `${good.rateLabel} per value, vs overall`,
    },
    { value: 'outcomes', label: 'Outcome mix', icon: SquareStack, reads: 'Where each value ended up' },
    board.money
      ? { value: 'money', label: `${board.money.label} amount`, icon: LayoutGrid, reads: 'Area is the money' }
      : { value: 'conversions', label: 'Share of conversions', icon: LayoutGrid, reads: `Area is ${good.label.toLowerCase()}` },
    // See above: temporal dimensions only.
    {
      value: 'trend',
      label: 'Trend',
      icon: ChartLine,
      reads: 'Shape between periods',
      orderedOnly: true,
      wide: true,
    },
  ]
}

// The visuals are drawn at four fifths of their natural size - the charts
// only, never the cell's own header or the note underneath.
//
// Four charts on one canvas is a lot of board to cover, and each of them was
// sized for a panel that ran the full width of the page. At 1300px or so the
// ring plus its legend table came out wider than half of that and the legend's
// last column was clipped off the edge of the card. Zoom rather than a
// transform, because zoom is laid out rather than painted: the chart is given
// the 25% of extra width it wants, drawn at 80%, and the cell around it is the
// height of what was actually drawn - no scrollbars, no gap underneath, and
// the hit areas land where the marks appear.
//
// Firefox before 126 doesn't implement it and simply draws at full size, which
// is where this started: a busier canvas, not a broken one.
const CHART_ZOOM = 0.8

export function visualsFor(dimension, board) {
  return visualsForBoard(board).filter((visual) => !visual.orderedOnly || dimension.ordered)
}

/**
 * The four views of one breakdown, in a 2x2 grid.
 *
 * Each cell is a framed, captioned card of its own. The frame is doing real
 * work at this density - four charts loose in one panel read as one enormous
 * confusing chart - and the caption is what lets somebody say which of them
 * they mean.
 *
 * Two columns from xl up, one below it. The ring carries its legend table
 * beside it and the columns want room per bar, so narrower than that a
 * half-width cell isn't a smaller chart, it's a truncated one.
 */
export function BreakdownGrid({ visuals, items, unit, ordered, board, ...shared }) {
  // Categories nobody has been filed under, named once underneath rather than
  // drawn four times over.
  //
  // They have to be *said* - an option the form offers that nobody has chosen
  // is a finding, and the board's whole reason for listing every configured
  // value is to be able to say it. But as marks they are four cells' worth of
  // nothing: seven zero-height columns, seven empty bar tracks, seven grey
  // legend rows and a footnote, all repeating one sentence. So the charts draw
  // what exists and the sentence is printed once, with the table below the
  // canvas carrying the full roster and its rates.
  //
  // Only where the values are categories. On a dimension that runs along an
  // axis a zero is an observation - a batch nobody enrolled in is a real dip
  // in the line - and dropping those points would redraw the shape of the
  // trend rather than tidy it.
  const unfiled = ordered ? [] : items.filter((item) => !(item.count > 0))
  const filed = unfiled.length ? items.filter((item) => item.count > 0) : items
  // One colour per value for the whole canvas, ranked by headcount - see the
  // note at the top. A colour the data brings (the call-remark outcomes) wins.
  const colors = colorByEntity(filed)
  const drawn = filed.map((item) => ({ ...item, color: colors.get(item.value) }))

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {visuals.map((visual) => (
          <figure
            key={visual.value}
            className={`flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white ${
              visual.wide ? 'xl:col-span-2' : ''
            }`}
          >
            <figcaption className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <visual.icon
                  className="h-3.5 w-3.5 shrink-0 text-slate-400"
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
                {visual.label}
              </span>
              {/* Dropped rather than truncated on a narrow cell: it is a help
                  to the reading, and half of it is no help at all. */}
              <span className="hidden text-[10px] font-medium text-slate-400 sm:block">
                {visual.reads}
              </span>
            </figcaption>
            {/* flex-1 and centred, so the four cells come out the same height
                and each chart sits in the middle of its own card instead of
                hanging from the top of it. */}
            <div className="flex min-w-0 flex-1 items-center justify-center px-3 py-4">
              {/* The zoom rides on a wrapper of its own rather than on the
                  padded flex cell above, so the card's own padding stays the
                  same as every other card's on the page. */}
              <div className="w-full min-w-0" style={{ zoom: CHART_ZOOM }}>
                <BreakdownVisual
                  view={visual.value}
                  items={drawn}
                  unit={unit}
                  ordered={ordered}
                  board={board}
                  {...shared}
                />
              </div>
            </div>
          </figure>
        ))}
      </div>

      {unfiled.length > 0 && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          <span className="mr-1.5 font-bold uppercase tracking-wide text-slate-400">
            No {unit.toLowerCase()} yet
          </span>
          {unfiled.map((item) => item.value).join(' · ')}
        </p>
      )}
    </>
  )
}

export function BreakdownVisual({ view, items, unit, empty, measure, ordered, board, selected, onSelect }) {
  // The trend takes the values in their own order - batch-number order for a
  // batch - rather than ranked by size. A batch is a position, and re-ordering
  // batches by how many people came through them is not a chart of anything.
  // Values with no number go last.
  const sequence = ordered
    ? [...items].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
    : items

  const shared = { items, measure, selected, onSelect, emptyMessage: empty }
  const [good] = board.outcomes

  if (view === 'conversion') {
    return <RateBars {...shared} numeratorKey={good.key} noun={good.rateLabel.toLowerCase()} />
  }
  if (view === 'outcomes') return <OutcomeStack {...shared} outcomes={board.outcomes} />
  if (view === 'money') {
    return (
      <TreemapChart
        {...shared}
        valueKey={board.money.key}
        format={shortMoney}
        emptyMessage={`No money ${board.money.label.toLowerCase()} in this window yet.`}
        emptyNote={() => 'nothing collected yet'}
      />
    )
  }
  if (view === 'conversions') {
    return (
      <TreemapChart
        {...shared}
        valueKey={good.key}
        emptyMessage={`Nobody ${good.label.toLowerCase()} in this window yet.`}
        emptyNote={(names, plural) => `none of ${plural ? 'them' : 'it'} ${good.label.toLowerCase()} yet`}
      />
    )
  }
  if (view === 'trend') return <TrendChart {...shared} items={sequence} />
  return <DonutChart {...shared} centerLabel={unit} />
}
