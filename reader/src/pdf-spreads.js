// How a PDF's (or a CBZ's) pages pair up into Spreads (docs/research/page-spreads.md §4).
//
// - 'book': like print, odd pages on the right, so the cover stands alone, then 2–3, 4–5.
// - 'paper': 1–2, 3–4, with no lonely first page.
// - 'single': one page per screen, for landscape pages such as slides.

// Only the two-page layouts say anything about pairing. SinglePage is the PDF default
// and many producers write it out, so SinglePage/OneColumn count as unset.
const layouts = {
    TwoPageRight: 'book', TwoColumnRight: 'book',
    TwoPageLeft: 'paper', TwoColumnLeft: 'paper',
}

const near = (a, b) => Math.abs(a - b) <= 3 // points
const sameSize = (a, b) => near(a.width, b.width) && near(a.height, b.height)
const isOfficePaper = size => [{ width: 612, height: 792 }, { width: 595, height: 842 }]
    .some(paper => sameSize(size, paper))

// Documents longer than this with a book trim are taken to be books.
const BOOK_MIN_PAGES = 40

// pageLayout: the document's /PageLayout ('' if unset). sizes: the sizes of its first
// few pages, in points.
//
// Landscape pages (median width/height above 1) always go one per screen: two slides
// side by side would each get a quarter of the screen. Otherwise a two-page /PageLayout
// decides. Failing that, it's a book if the cover's size differs from page 2's, or if
// it runs past BOOK_MIN_PAGES pages at a size other than US Letter or A4; anything else
// is a paper.
export const choosePairing = ({ pageLayout, pageCount, sizes }) => {
    const aspects = sizes.map(({ width, height }) => width / height).sort((a, b) => a - b)
    if (aspects[Math.floor(aspects.length / 2)] > 1) return 'single'
    if (layouts[pageLayout]) return layouts[pageLayout]
    const [cover, second] = sizes
    if (second && !sameSize(cover, second)) return 'book'
    if (pageCount > BOOK_MIN_PAGES && !isOfficePaper(cover)) return 'book'
    return 'paper'
}

// Pages side by side on screen: one for 'single', else two.
export const columnsOf = pairing => pairing === 'single' ? 1 : 2

// The page numbers a Spread shows, without its blank page.
export const pagesOf = ({ left, right }) => [left, right].filter(Boolean)

// Every Spread as { left, right } page numbers (1-based); null is a blank page.
export const pairPages = (pairing, pageCount) => {
    const pages = Array.from({ length: pageCount }, (_, i) => i + 1)
    if (pairing === 'single') return pages.map(left => ({ left, right: null }))
    const slots = pairing === 'book' ? [null, ...pages] : pages
    const spreads = []
    for (let i = 0; i < slots.length; i += 2)
        spreads.push({ left: slots[i], right: slots[i + 1] ?? null })
    return spreads
}

// The status line's page label for a Spread: "Pages 2–3 of 45", or "Page 1 of 45" alone.
export const spreadLabel = ({ left, right }, pageCount) =>
    left && right ? `Pages ${left}–${right} of ${pageCount}` : `Page ${left ?? right} of ${pageCount}`

// The index of the Spread showing a page; out-of-range pages go to the nearest end.
export const spreadIndexOf = (spreads, page) => {
    if (Number.isNaN(page)) return 0
    const index = spreads.findIndex(spread => pagesOf(spread).some(n => n >= page))
    return index === -1 ? spreads.length - 1 : index
}
