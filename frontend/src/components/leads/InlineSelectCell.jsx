import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { anchorPopup } from '@/utils/anchorPopup'
import { Check, ChevronDown, Search } from 'lucide-react'

// Typing "didnt pick 2" should find "Didn't Pick Up - Attempt 2", and "career
// gap" should find "Career Gap" however it was punctuated. Punctuation is the
// part nobody types the same way twice, so it is dropped on both sides and
// only the words are matched.
function words(text) {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Every typed word has to appear, in any order: the query is a filter, not a
// prefix, so "phone completed" finds the Gmeet-or-phone pair either way round.
export function optionMatches(option, query) {
  const needle = words(query)
  if (!needle) return true
  const haystack = words(option)
  return needle.split(' ').every((word) => haystack.includes(word))
}

// Anchored to the trigger and clamped to the viewport. Portaled to <body>
// because the table scrolls in both directions - a menu rendered inside the
// row would be clipped by that container, and the list is taller than the row
// it hangs off by a long way.
/**
 * A table cell that is also a dropdown: click the value, pick another, it
 * saves.
 *
 * Extracted from the induction call remark cell when the category column
 * needed the same thing. The two differ only in what they offer and how the
 * chosen value is coloured - everything underneath (the portaled menu, the
 * search box, typing a value the list doesn't have, clearing) was going to be
 * copied wholesale, and a copy is what stops matching the original the first
 * time one of them is fixed.
 *
 * `groups` is [{ key, options, dot?, text? }]. One group with no colours is a
 * plain list; several with colours are a list split by colour, which is how
 * the remarks read.
 */
export function InlineSelectCell({
  value,
  groups,
  onSave,
  isSaving = false,
  // Classes for the trigger when something is set - the caller knows what the
  // value means, so it knows what colour it should wear.
  badgeClass = 'border-slate-200 bg-slate-50 text-slate-700',
  placeholder = 'Set value',
  clearLabel = 'No value',
  searchLabel = 'Search or type',
  // What the column can store, so nothing is typed that the save would reject.
  maxLength = 100,
  // Off where a typo would pollute a list people filter by.
  allowCustom = true,
}) {
  const triggerRef = useRef(null)
  const [menu, setMenu] = useState(null)
  const [query, setQuery] = useState('')

  // Groups keep their order so any colours run in a predictable sequence, and
  // an emptied group drops out rather than leaving a gap while filtering.
  const shown = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          options: group.options.filter((option) => optionMatches(option, query)),
        }))
        .filter((group) => group.options.length),
    [groups, query],
  )

  const typed = query.trim().slice(0, maxLength)
  const known = groups.some((group) =>
    group.options.some((option) => words(option) === words(typed)),
  )
  // Anything the list doesn't cover can still be written down. The dropdown is
  // the shortcut, not the whole vocabulary - somebody who needs to say
  // something else shouldn't have to leave the cell blank.
  const custom = allowCustom && typed && !known ? typed : null
  const first = shown[0]?.options[0] ?? custom

  function open(event) {
    event.stopPropagation()
    if (menu) {
      setMenu(null)
      return
    }
    setQuery('')
    setMenu(anchorPopup(triggerRef.current.getBoundingClientRect()))
  }

  function choose(next) {
    setMenu(null)
    setQuery('')
    if (next !== value) onSave(next)
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') setMenu(null)
    // Type enough to leave one candidate, press Enter, move on - the whole
    // point of the search box for someone working down a column of rows.
    if (event.key === 'Enter' && first) choose(first)
  }

  const row = 'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        disabled={isSaving}
        title={value ?? placeholder}
        className={`inline-flex w-full max-w-52 items-center justify-between gap-1.5 rounded-md border px-2 py-1 text-left text-xs font-medium transition-colors disabled:cursor-wait ${
          value ? badgeClass : 'border-dashed border-slate-300 bg-white text-slate-400 hover:border-slate-400'
        }`}
      >
        <span className="truncate">{isSaving ? 'Saving…' : (value ?? placeholder)}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={2} aria-hidden="true" />
      </button>

      {menu &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div
              style={{ top: menu.top, left: menu.left }}
              className="fixed z-50 flex max-h-[21rem] w-80 flex-col rounded-lg border border-slate-200 bg-white shadow-xl"
            >
              <div className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
                <input
                  autoFocus
                  value={query}
                  maxLength={maxLength}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={searchLabel}
                  className="w-full border-0 p-0 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                />
              </div>

              <div className="overflow-y-auto p-1">
                {/* Clearing has to be reachable: a value set by mistake could
                    otherwise never be taken off the candidate again. */}
                {!query && (
                  <button
                    type="button"
                    onClick={() => choose(null)}
                    className={`${row} justify-between ${
                      value ? 'text-slate-600 hover:bg-slate-50' : 'bg-brand-50 font-medium text-brand-700'
                    }`}
                  >
                    {clearLabel}
                    {!value && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
                  </button>
                )}

                {shown.map((group) => (
                  // A gap and the colour are the whole separation. A heading
                  // said out loud what the dot already says, and cost a line
                  // of the menu each time it did.
                  <div key={group.key} className="mt-1 first:mt-0">
                    {group.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => choose(option)}
                        className={`${row} ${
                          option === value ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'
                        } ${group.text ?? 'text-slate-700'}`}
                      >
                        {group.dot && (
                          <span className={`h-2 w-2 shrink-0 rounded-full ${group.dot}`} aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1">{option}</span>
                        {option === value && (
                          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                        )}
                      </button>
                    ))}
                  </div>
                ))}

                {custom && (
                  <button
                    type="button"
                    onClick={() => choose(custom)}
                    className={`${row} mt-1 border-t border-slate-100 pt-2 text-slate-600 hover:bg-slate-50`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full border border-dashed border-slate-400"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      Use “<span className="font-medium text-slate-800">{custom}</span>”
                    </span>
                  </button>
                )}

                {!shown.length && !custom && (
                  <p className="px-2.5 py-3 text-sm text-slate-400">Nothing matches that.</p>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
