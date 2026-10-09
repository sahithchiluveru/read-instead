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

// The offset of a page height px tall scrolled to its bottom in a view px tall stage.
export const bottomOffset = (height, view) => height > view ? (height - view) / height : 0

// Where scrolling half a screen down (1) or up (-1) from offset goes on a page height px
// tall in a view px tall stage: a new offset, or null from the page's bottom (top), to move
// to the top of the next page (the bottom of the previous one).
export const scrolledOffset = (offset, height, view, direction) => {
    const bottom = Math.max(height - view, 0)
    const at = offset * height
    // Half a pixel of slack absorbs rounding in offset × height.
    if (direction > 0 ? at >= bottom - 0.5 : at <= 0.5) return null
    return Math.min(Math.max(at + direction * view / 2, 0), bottom) / height
}

// Move a page height px tall up to show it from offset down, but never past its bottom.
export const scrollPage = (element, height, offset, view) => {
    const scrolled = Math.min(offset * height, Math.max(height - view, 0))
    element.style.transform = `translateY(${-scrolled}px)`
}
