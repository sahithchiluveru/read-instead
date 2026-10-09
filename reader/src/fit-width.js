// Fit-width, shared by the PDF and CBZ readers: one page fills the width of the screen,
// and →/← scroll it by half a screen before moving to the next/previous page. Its Position
// is then the page and how far down it's scrolled, as a fraction of the page's height on
// screen: "<page>@<fraction>" (just "<page>" at the top).

// A Position (or a Contents target: a page number) as its page and scroll offset.
export const parsePosition = position => {
    const [page, offset] = String(position).split('@')
    return { page: Number(page), offset: Number(offset) || 0 }
}

export const positionOf = (page, offset) => offset ? `${page}@${offset}` : String(page)

// Scroll half a screen down (1) or up (-1) from offset on the page of a Spread, in a stage
// view px tall; from the page's bottom (top), go to the top of the next page (the bottom of
// the previous one). The reader supplies:
// - heightOf(spread): resolves to the height on screen of a Spread's page, in CSS px;
// - stillCurrent(): whether the view is unchanged since the scroll began (if it moved or was
//   relaid out while a page was measured, the scroll gives up);
// - goTo(spread, offset): shows a Spread's page from offset down, resolving to whether the
//   view moved (false past either end of the book).
// Resolves to whether the view moved.
export const scrollFitWidth = async (direction, { spread, offset, view, heightOf, stillCurrent, goTo }) => {
    const height = await heightOf(spread)
    if (!stillCurrent()) return false
    const to = scrolledOffset(offset, height, view, direction)
    if (to !== null) return goTo(spread, to)
    const next = spread + direction
    if (direction > 0 || next < 0) return goTo(next, 0)
    const previous = await heightOf(next)
    if (!stillCurrent()) return false
    return goTo(next, bottomOffset(previous, view))
}

// Move a page height px tall up to show it from offset down, but never past its bottom.
export const scrollPage = (element, offset, height, view) => {
    const scrolled = Math.min(offset * height, Math.max(height - view, 0))
    element.style.transform = `translateY(${-scrolled}px)`
}

// Where half a screen down (1) or up (-1) from offset goes on the same page, or null from
// its bottom (top).
const scrolledOffset = (offset, height, view, direction) => {
    const bottom = Math.max(height - view, 0)
    const at = offset * height
    // Half a pixel of slack absorbs rounding in offset × height.
    if (direction > 0 ? at >= bottom - 0.5 : at <= 0.5) return null
    return Math.min(Math.max(at + direction * view / 2, 0), bottom) / height
}

// The offset of a page scrolled to its bottom (0 for one no taller than the stage, or one
// that failed to load and has no height).
const bottomOffset = (height, view) => height > view ? (height - view) / height : 0
