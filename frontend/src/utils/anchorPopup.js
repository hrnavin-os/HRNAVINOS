// Where to put a popup anchored to a cell, in fixed coordinates.
//
// Shared rather than copied: this was private to InlineSelectCell, and the
// schedule cell needed exactly the same rules. A second copy is what stops
// matching the first the moment one of them is fixed.
//
// `rect` is the trigger's bounding rect; `width`/`height` are the popup's, and
// only matter for deciding whether it fits.
//
// Opening upward, the popup is pinned by its *bottom* edge to the trigger
// rather than given a top computed from `height`: `height` is the most it can
// be, and a short menu (three groups) placed at "trigger minus the tallest it
// could be" floated a long way above the row it belonged to.
export function anchorPopup(rect, width = 320, height = 340) {
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  // Flips above the trigger when there isn't room below, so a row near the
  // bottom of the page doesn't open a popup you have to scroll to see.
  const openUp = rect.bottom + height > window.innerHeight && rect.top > height
  return openUp
    ? { left, bottom: window.innerHeight - rect.top + 4 }
    : { left, top: rect.bottom + 4 }
}
