import {
  ArrowRightLeft,
  BadgeIndianRupee,
  BookOpen,
  CalendarRange,
  GraduationCap,
  Layers,
  Megaphone,
  MessageSquareText,
  PhoneCall,
  Tag,
  UserRound,
  UserX,
  Users,
  Activity,
  XCircle,
} from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { leadService } from '@/services/leadService'
import { PAYMENT_PLAN_LABELS } from '@/constants/installmentPaymentModes'
import { CALL_REMARK_OPTIONS, CALL_REMARK_BY_VALUE } from '@/constants/paymentOptions'

/**
 * The Statistics board, described rather than coded.
 *
 * Two halves of one institute: Induction is everyone who took the call, and
 * Foundation is everyone who came out of it and filled the form. They are the
 * same reading of two different populations - which is why they are one page
 * with one set of panels, and why everything that differs between them is a
 * string in this file rather than a branch in the page.
 *
 * A board carries:
 *   load        how its numbers are fetched (both endpoints answer alike)
 *   outcomes    the two things that can become of a row, named for that half
 *   foot        the three states the population divides into, under the chart
 *   dimensions  the tabs - one per field the half can be cut by
 *
 * A dimension carries the wording for every place its name appears, because
 * with eight of them a ternary at each use site would be eight-way and
 * repeated five times over.
 *
 * `key` must match a dimension the matching endpoint accepts - the backend's
 * closed map is what decides which fields are groupable at all, and this is
 * only the menu of them.
 */

// Values the form offers that nobody has been filed under yet. The aggregation
// can only return values that exist in the data, so an untouched option is
// simply absent - and absent reads as "doesn't exist" rather than "nobody
// yet", which are very different findings. A course nobody enrolled on is
// exactly the thing this board should be able to say out loud.
const planValues = () => Object.keys(PAYMENT_PLAN_LABELS)
const remarkValues = () => CALL_REMARK_OPTIONS.map((option) => option.value)

export const BOARDS = [
  {
    key: 'induction',
    label: 'Induction',
    icon: PhoneCall,
    // The raised pill's classes in TabStrip. Same pair the Lead Dashboard's
    // own Induction/Foundation switch wears, so the two switches read as one
    // control in two places rather than two controls that happen to agree.
    active: 'bg-white text-brand-700 shadow-sm',
    title: 'Induction Analytics',
    caption: 'Induction call insights & candidate categorization',
    load: (dimension, filters) => inductionEntryService.getAnalytics(dimension, filters),
    dateLabel: 'Registration date',
    // What one row of the population is, wherever the board has to name it.
    unit: 'Candidates',
    totalLabel: 'Total candidates',
    highlightLabel: 'Highlighted candidates',
    scopeLabel: (total) => `${total} candidates in scope`,
    // The two outcome columns every row carries, named for this half of the
    // institute. `key` is the field on an API row; `invert` marks the figure
    // where up is the bad direction, so the trend arrow can't colour a rise in
    // people quitting green.
    outcomes: [
      {
        key: 'moved',
        label: 'Moved to Foundation',
        rateLabel: 'Converted',
        icon: ArrowRightLeft,
        tone: 'emerald',
      },
      { key: 'quit', label: 'Quit', rateLabel: 'Quit rate', icon: UserX, tone: 'red', invert: true },
    ],
    foot: ({ total, moved, quit }) => [
      { label: 'Active candidates', value: total - quit, of: total, icon: Users, tone: 'brand' },
      {
        label: 'Still in induction',
        value: total - moved - quit,
        of: total,
        icon: Activity,
        tone: 'amber',
      },
      { label: 'Dropped out', value: quit, of: total, icon: XCircle, tone: 'red' },
    ],
    dimensions: [
      {
        key: 'category',
        label: 'Category',
        icon: Tag,
        column: 'Category',
        noun: 'category',
        title: 'Candidates by Category',
        subtitle: 'Distribution of candidates across the categories the form records.',
        hint: 'Counts every induction entry in the current filters, including those with no category set.',
        empty: 'No categories recorded yet.',
        leader: 'Largest category',
        expected: (context) => context.inductionOptions.category ?? [],
      },
      {
        key: 'call_remark',
        label: 'Induction Call Remarks',
        icon: PhoneCall,
        column: 'Call Remark',
        noun: 'outcome',
        title: 'Candidates by Call Outcome',
        subtitle: 'The nineteen remarks grouped into the six outcomes they belong to.',
        hint: 'The ring groups the remarks into outcomes; the ranking beside it keeps the exact wording each caller chose.',
        empty: 'No call remarks recorded yet. Set one from the dropdown on the induction board.',
        leader: 'Most common remark',
        // The one dimension whose chart is a level up from its table - see
        // groupRemarks in the page.
        grouped: true,
      },
      {
        key: 'sales_person',
        label: 'Sales Person',
        icon: UserRound,
        column: 'Sales Person',
        noun: 'sales person',
        title: 'Candidates by Sales Person',
        subtitle: 'Who the form credits, and how many of theirs went on to Foundation.',
        hint: 'The sales person is recorded on the induction form, not the round-robin assignee who works the entry.',
        empty: 'No sales person recorded on any induction entry yet.',
        leader: 'Most entries',
        expected: (context) => context.inductionOptions.sales_person ?? [],
      },
      {
        key: 'lead_source',
        label: 'Lead Source',
        icon: Megaphone,
        column: 'Lead Source',
        noun: 'source',
        title: 'Candidates by Lead Source',
        subtitle: 'Which channel the induction lead arrived through.',
        hint: 'Whatever the form recorded, including sources that are no longer offered on the dropdown.',
        empty: 'No lead source recorded on any induction entry yet.',
        leader: 'Largest source',
        expected: (context) => context.inductionOptions.lead_source ?? [],
      },
    ],
  },
  {
    key: 'foundation',
    label: 'Foundation',
    icon: GraduationCap,
    active: 'bg-white text-violet-700 shadow-sm',
    title: 'Foundation Analytics',
    caption: 'Course intake, batch strength & how the money came in',
    load: (dimension, filters) => leadService.getAnalytics(dimension, filters),
    // Not "Registration date": a Foundation lead's date is the day their form
    // landed, which is the day they sat the class.
    dateLabel: 'Form date',
    unit: 'Leads',
    totalLabel: 'Total leads',
    highlightLabel: 'Highlighted leads',
    scopeLabel: (total) => `${total} leads in scope`,
    outcomes: [
      {
        key: 'confirmed',
        label: 'Batch confirmed',
        rateLabel: 'Confirmed',
        icon: BadgeIndianRupee,
        tone: 'emerald',
      },
      { key: 'lost', label: 'Quit', rateLabel: 'Quit rate', icon: UserX, tone: 'red', invert: true },
    ],
    // The Foundation half's own measure. Money has no equivalent on the
    // Induction side, where nobody has paid anything yet, so it is a column
    // this board adds rather than one both carry.
    money: { key: 'collected', label: 'Collected' },
    foot: ({ total, confirmed, lost }) => [
      { label: 'Confirmed', value: confirmed, of: total, icon: BadgeIndianRupee, tone: 'emerald' },
      {
        label: 'Still in the pipeline',
        value: total - confirmed - lost,
        of: total,
        icon: Activity,
        tone: 'amber',
      },
      { label: 'Quit', value: lost, of: total, icon: XCircle, tone: 'red' },
    ],
    dimensions: [
      {
        key: 'course',
        label: 'Courses',
        icon: BookOpen,
        column: 'Course',
        noun: 'course',
        title: 'Leads by Course',
        subtitle: 'What the intake is studying, and how much of each course converted.',
        hint: 'Every live course, including any nobody has enrolled on yet, plus values already in the data that are no longer offered.',
        empty: 'No course recorded on any lead yet.',
        leader: 'Largest course',
        expected: (context) => context.courses,
      },
      {
        key: 'batch',
        label: 'Batch & Month',
        icon: CalendarRange,
        column: 'Batch',
        noun: 'batch',
        title: 'Leads by Batch',
        subtitle: 'The intake month by month, in the batch number the institute calls it by.',
        hint: 'A batch is the month the Foundation Form landed in. Months nobody came through are shown at zero rather than left out.',
        empty: 'No leads recorded yet.',
        leader: 'Largest batch',
        // The one dimension that runs along an axis rather than being a set of
        // names, which is what earns it the trend line - see VIEWS.
        ordered: true,
      },
      {
        key: 'payment_plan',
        label: 'Payment Method',
        icon: Layers,
        column: 'Payment Method',
        noun: 'payment method',
        title: 'Leads by Payment Method',
        subtitle: 'Single shot, two shot or EMI - and which of them actually closes.',
        hint: 'The plan set on the Payment Method column of the Foundation board. Leads nobody has set one on are counted as "Not set".',
        empty: 'No payment method set on any lead yet.',
        leader: 'Most used method',
        expected: planValues,
        labelOf: (value) => PAYMENT_PLAN_LABELS[value] ?? value,
      },
      {
        key: 'payment_call_remarks',
        label: 'Payment Remarks',
        icon: MessageSquareText,
        column: 'Payment Remark',
        noun: 'remark',
        title: 'Leads by Payment Remark',
        subtitle: 'What the last caller made of the payment conversation.',
        hint: 'Set by whoever is chasing the payment. It can disagree with the stage on the board - treat Stage as the authority.',
        empty: 'No payment remark recorded on any lead yet.',
        leader: 'Most common remark',
        expected: remarkValues,
        labelOf: (value) => CALL_REMARK_BY_VALUE[value]?.label ?? value,
      },
    ],
  },
]

export const BOARD_BY_KEY = Object.fromEntries(BOARDS.map((board) => [board.key, board]))

// Rupees, short. The tiles have room for a figure, not for ₹1,20,500.00 - and
// on a board about how the intake divides, the reading is the size of the
// number rather than the paise.
export function shortMoney(amount) {
  if (!amount) return '₹0'
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`
  if (amount >= 1000) return `₹${Math.round(amount / 1000)}K`
  return `₹${Math.round(amount)}`
}
